# Graphify and Obsidian for Claude Code

Project root: `D:\User\Documents\Home Connect` (Windows PowerShell).
Vault: `C:\Users\User\Documents\Obsidian\home-connect-Graph`.

## Installed configuration

Graphify 0.9.90 was already available at `C:\Users\User\.local\bin\graphify.exe`,
using the existing uv tool environment. Its optional `tree-sitter-sql` 0.3.11
parser was added to that environment to cover the project's SQL files.
No application dependencies were changed.

`graphify claude install --project` created `.claude/skills/graphify/` with its
references, `.claude/CLAUDE.md`, the managed section of root `CLAUDE.md`, and
two advisory `PreToolUse` groups in `.claude/settings.json`. These call
`graphify hook-guard search` and `graphify hook-guard read` with 10-second
timeouts. There is no Stop hook or strict read blocking. Existing
`.claude/settings.local.json` permissions were preserved byte-for-byte.

Root `CLAUDE.md` adds project limits: scoped navigation, current-source checks,
targeted-search fallback, no graph step for trivial known-file edits, and no
per-prompt rebuild or export. Structural extraction only is authorized by this
setup; semantic extraction, API backends, and model-based enrichment stay off.

`.graphifyignore` excludes dependencies, build/install artifacts, coverage,
reports, runtime data, secrets, backups, assistant history, binary assets,
lockfiles, and graph output. Frontend, backend, desktop, mobile, shared source,
tests, and SQL migrations remain eligible. `.gitignore` only adds the generated
`graphify-out/` exclusion and exceptions for the project Claude integration.

## Coverage and verification

The initial command was `graphify extract . --code-only`. After installing the
missing SQL parser, the same command completed with **9,556 nodes**, **29,528
relationships**, and **308 communities**. The graph represents **1,563 existing
files**, including all **100 SQL migration/repair/data-fix files**. Every edge
endpoint exists. Community names were not enriched with a model.

The first scan found 1,571 supported code files; eight JSON data/config files
produced no graph nodes. Some data-only files and SQL
statements yield no symbols; a file note does not imply every SQL statement is
modeled. Prisma's `backend/prisma/schema.prisma` and CSS have no structural
extractor in this installation. HTML, Markdown, and YAML are treated as
documents and skipped by `--code-only` (112 non-code files on the initial scan).
Do not infer complete database schema coverage from the SQL graph. Read current
Prisma, CSS, HTML, and documentation directly when relevant.

The scoped query below returned two real symbols and their `calls` relationship,
verified at lines 25, 29, and 34 of
`backend/src/features/scanner/mobile-api-gateway.ts`:

```powershell
graphify query "How does the mobile scanner gateway check allowed requests?" --seed "mobileApiGateway()" --context call --budget 1200
```

The Obsidian export contains 9,864 Markdown notes and `graph.canvas`. Verification
found 72,535 wikilinks with no unresolved targets and 9,556 valid canvas file
references. Local verification details are in
`graphify-out/setup-verification.json`; the query output is in
`graphify-out/setup-query.txt`. Graphify
tracks its exported files in `.graphify_obsidian_manifest.json`; preserve that
manifest, personal notes, and `.obsidian` settings when refreshing. The existing
`HomeConnects-Graph` vault belongs to a different codebase and was left untouched.

## Maintenance

`graphify hook install` installed `post-commit`, `post-checkout`, and `post-merge`
in this repository's `.git/hooks/`. There was no existing hook manager or active
hook to replace. `graphify hook status` reports all three installed and the
graph merge driver registered. All three shell scripts passed syntax checks.
The merge driver registration appends one graph-specific `.gitattributes` rule
and two `merge.graphify.*` entries to repository-local Git configuration;
existing SQL line-ending rules are preserved.

The installed hooks launch background local AST rebuilds after commits, branch
changes, and merges. Commit rebuilds use changed files; checkout and merge
rebuilds rescan the code. They update graph data and structural reports, with
visuals subject to the tool's visualization limits,
reuse valid labels or derive names from graph hubs, and may refresh saved
work-memory reflections if such memory exists. They do **not** export Obsidian
or perform semantic extraction. Logs go to
`C:\Users\User\.cache\graphify-rebuild.log`. Hooks are local to this checkout;
another checkout must run `graphify hook install` separately.

After pulling changes, run these exact commands when a manual refresh is needed
(including after a fast-forward pull, which may not invoke a merge hook):

```powershell
Set-Location -LiteralPath 'D:\User\Documents\Home Connect'
graphify update .
graphify export obsidian --dir "C:\Users\User\Documents\Obsidian\home-connect-Graph"
```

`graphify update .` is local structural maintenance. The explicit code-only
extraction alternative is `graphify extract . --code-only`. Check errors and
coverage warnings; do not use `--force` to bypass an unexplained shrink or failure.
No refresh is needed on every prompt.

To open the export, use Obsidian's **Open folder as vault** and select
`C:\Users\User\Documents\Obsidian\home-connect-Graph`. No Obsidian MCP or
additional Obsidian plugin was installed. Restart Claude Code in this project
if it was already running when the integration was installed.
