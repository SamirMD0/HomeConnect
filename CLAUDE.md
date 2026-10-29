## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

### Project navigation policy

These project-specific limits take precedence over the generic defaults above:
- Use scoped queries for unfamiliar relationships, for example `graphify query "scanner authentication" --seed "backend/src/features/scanner/mobile-api-gateway.ts" --budget 1200`.
- Never load the entire graph JSON, report, or Obsidian vault by default. Read the relevant current source before editing; the graph is a navigation aid.
- Fall back to targeted searches when the graph is stale, incomplete, or unhelpful. Skip graph queries for trivial edits when the target file is already known.
- Do not rebuild or export on every prompt. Git hooks maintain local structural data; rebuild manually after pulling when needed and export only when refreshing Obsidian. Use local structural extraction only; do not enable semantic extraction, API backends, or model-based enrichment.
- Obsidian vault: `C:\Users\User\Documents\Obsidian\home-connect-Graph`. Maintenance commands and coverage limits: `docs/setup/GRAPHIFY_OBSIDIAN.md`.
