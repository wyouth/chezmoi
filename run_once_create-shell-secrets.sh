#!/usr/bin/env bash
# Create ~/.config/shell/secrets.sh from the example once, if missing.
set -euo pipefail
dir="$HOME/.config/shell"
dest="$dir/secrets.sh"
example="$dir/secrets.sh.example"
mkdir -p "$dir"
if [[ ! -f "$dest" && -f "$example" ]]; then
  cp "$example" "$dest"
  chmod 600 "$dest"
fi
