#!/usr/bin/env python3
"""Safely replace the two locally built images in the 631 ARM delivery tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path


SERVICE_CONFIG = {
    "review631-backend": {
        "repository": "test-review-app",
        "env_file": Path("config/631/backend/env.example"),
        "env_key": "APP_IMAGE",
    },
    "resona-core-worker": {
        "repository": "resona-worker",
        "env_file": Path("config/631/core/.env.example"),
        "env_key": "RESONA_IMAGE",
    },
}


def command(*args: str, cwd: Path | None = None) -> bytes:
    return subprocess.run(args, cwd=cwd, check=True, stdout=subprocess.PIPE).stdout


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def manifest_blocks(text: str) -> tuple[list[str], dict[str, dict[str, str]]]:
    blocks = text.rstrip("\n").split("\n\n")
    services: dict[str, dict[str, str]] = {}
    for block in blocks:
        values = dict(line.split("=", 1) for line in block.splitlines() if "=" in line)
        service = values.get("service")
        if service:
            if service in services:
                raise RuntimeError(f"duplicate manifest service: {service}")
            services[service] = values
    return blocks, services


def update_block(block: str, updates: dict[str, str]) -> str:
    output: list[str] = []
    seen: set[str] = set()
    for line in block.splitlines():
        if "=" not in line:
            output.append(line)
            continue
        key = line.split("=", 1)[0]
        if key == "source_revision_from_tag":
            key = "source_revision"
        if key in updates:
            if key not in seen:
                output.append(f"{key}={updates[key]}")
                seen.add(key)
        else:
            output.append(line)
    output.extend(f"{key}={value}" for key, value in updates.items() if key not in seen)
    return "\n".join(output)


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"{label}: expected reference not found: {old}")
    return text.replace(old, new)


def docker_metadata(image: str) -> tuple[str, str, str]:
    item = json.loads(command("docker", "image", "inspect", image))[0]
    os_name, arch = item.get("Os"), item.get("Architecture")
    if (os_name, arch) != ("linux", "arm64"):
        raise RuntimeError(f"{image} is {os_name}/{arch}, expected linux/arm64")
    return item["Id"], os_name, arch


def validate_docker_tar(path: Path) -> None:
    with tarfile.open(path, "r") as archive:
        member = archive.getmember("manifest.json")
        handle = archive.extractfile(member)
        if handle is None:
            raise RuntimeError(f"cannot read manifest.json from {path}")
        json.load(handle)


def checksum_text(root: Path) -> str:
    paths: list[Path] = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if not path.is_file() or relative == Path("SHA256SUMS"):
            continue
        if relative.parts[0] == "backups" or relative.parts[0].startswith(".update-"):
            continue
        paths.append(relative)
    return "".join(f"{sha256(root / path)}  ./{path.as_posix()}\n" for path in sorted(paths))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--backend-image", required=True)
    parser.add_argument("--backend-revision", required=True)
    parser.add_argument("--core-image", required=True)
    parser.add_argument("--core-revision", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    manifest_path = root / "images-manifest.txt"
    readme_path = root / "README-INTRANET-QUICKSTART.md"
    checksum_path = root / "SHA256SUMS"
    metadata_paths = [manifest_path, readme_path, checksum_path]
    metadata_paths.extend(root / item["env_file"] for item in SERVICE_CONFIG.values())
    for path in [root / "images", *metadata_paths]:
        if not path.exists():
            raise RuntimeError(f"missing delivery path: {path}")

    original_manifest = manifest_path.read_text(encoding="utf-8")
    blocks, services = manifest_blocks(original_manifest)
    supplied = {
        "review631-backend": (args.backend_image, args.backend_revision),
        "resona-core-worker": (args.core_image, args.core_revision),
    }
    state: dict[str, dict[str, object]] = {}
    for service, (image, revision) in supplied.items():
        config = SERVICE_CONFIG[service]
        current = services.get(service)
        if current is None:
            raise RuntimeError(f"manifest service missing: {service}")
        repository, separator, tag = image.partition(":")
        if separator != ":" or repository != config["repository"]:
            raise RuntimeError(f"unexpected image name for {service}: {image}")
        if not re.fullmatch(r"[0-9]{8}-[0-9a-f]{8}-arm64", tag):
            raise RuntimeError(f"unexpected image tag for {service}: {tag}")
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise RuntimeError(f"invalid source revision for {service}: {revision}")
        image_id, os_name, arch = docker_metadata(image)
        old_relative = Path(current["tar"])
        old_path = root / old_relative
        if not old_path.is_file():
            raise RuntimeError(f"old tar missing for {service}: {old_path}")
        matches = sorted((root / "images").glob(f"{repository}-*.tar"))
        if matches != [old_path]:
            raise RuntimeError(f"expected exactly one {repository} tar, found: {matches}")
        new_relative = Path("images") / f"{repository}-{tag}.tar"
        new_path = root / new_relative
        if new_path.exists() and new_path != old_path:
            raise RuntimeError(f"new tar path already exists: {new_path}")
        state[service] = {
            "image": image,
            "revision": revision,
            "image_id": image_id,
            "os": os_name,
            "arch": arch,
            "old_image": current["image"],
            "old_relative": old_relative,
            "old_path": old_path,
            "new_relative": new_relative,
            "new_path": new_path,
        }

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = root / "backups" / timestamp
    stage = Path(tempfile.mkdtemp(prefix=".update-", dir=root))
    installed: list[Path] = []
    moved_old: list[tuple[Path, Path]] = []
    committed = False
    try:
        for values in state.values():
            staged_tar = stage / values["new_relative"]
            staged_tar.parent.mkdir(parents=True, exist_ok=True)
            command("docker", "save", "-o", str(staged_tar), str(values["image"]))
            validate_docker_tar(staged_tar)
            values["staged_tar"] = staged_tar

        updated_blocks = list(blocks)
        for index, block in enumerate(blocks):
            values_in_block = dict(line.split("=", 1) for line in block.splitlines() if "=" in line)
            service = values_in_block.get("service")
            if service not in state:
                continue
            values = state[service]
            updated_blocks[index] = update_block(block, {
                "image": str(values["image"]),
                "repo_digest": "LOCAL_IMAGE_NO_REPODIGEST",
                "image_id": str(values["image_id"]),
                "source_revision": str(values["revision"]),
                "source_repo_head_at_packaging": str(values["revision"]),
                "os": str(values["os"]),
                "arch": str(values["arch"]),
                "source": "79-server-local-project-build",
                "tar": values["new_relative"].as_posix(),
            })
        (stage / manifest_path.name).write_text("\n\n".join(updated_blocks) + "\n", encoding="utf-8")

        readme = readme_path.read_text(encoding="utf-8")
        for values in state.values():
            # The quickstart always names the TAR, but some revisions do not
            # repeat the image tag in prose. Replace the tag when present.
            readme = readme.replace(str(values["old_image"]), str(values["image"]))
            readme = replace_required(
                readme,
                values["old_relative"].as_posix(),
                values["new_relative"].as_posix(),
                "README tar",
            )
        (stage / readme_path.name).write_text(readme, encoding="utf-8")

        for service, config in SERVICE_CONFIG.items():
            relative = config["env_file"]
            source = root / relative
            text = source.read_text(encoding="utf-8")
            old = f"{config['env_key']}={state[service]['old_image']}"
            new = f"{config['env_key']}={state[service]['image']}"
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(replace_required(text, old, new, str(relative)), encoding="utf-8")

        backup.mkdir(parents=True)
        for source in metadata_paths:
            target = backup / source.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        for values in state.values():
            old_path = values["old_path"]
            saved = backup / values["old_relative"]
            saved.parent.mkdir(parents=True, exist_ok=True)
            os.replace(old_path, saved)
            moved_old.append((saved, old_path))

        for values in state.values():
            new_path = values["new_path"]
            os.replace(values["staged_tar"], new_path)
            installed.append(new_path)
        os.replace(stage / manifest_path.name, manifest_path)
        os.replace(stage / readme_path.name, readme_path)
        for config in SERVICE_CONFIG.values():
            os.replace(stage / config["env_file"], root / config["env_file"])
        checksum_path.write_text(checksum_text(root), encoding="utf-8")
        subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=root, check=True)
        committed = True
    finally:
        if not committed and backup.exists():
            for path in installed:
                path.unlink(missing_ok=True)
            for saved, original in reversed(moved_old):
                if saved.exists():
                    original.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(saved, original)
            for original in metadata_paths:
                saved = backup / original.relative_to(root)
                if saved.exists():
                    original.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(saved, original)
        shutil.rmtree(stage, ignore_errors=True)

    print(f"backup={backup}")
    for service, values in state.items():
        path = values["new_path"]
        print(
            f"{service}: image={values['image']} id={values['image_id']} "
            f"tar={path} sha256={sha256(path)}"
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise
