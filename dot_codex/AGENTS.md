# 全局 Agent 规则

## TypeSafe 门禁

动手执行任务前：加载 `typesafe-ai`，用 Jev 判断当前方案是否可执行。

- **通过** → 再执行。
- **未通过** → 先改方案，复判通过后再动手；不得带着未通过的方案执行。
- **Jev 不可用** → 简短说明后自行推进，不得声称已通过。

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
