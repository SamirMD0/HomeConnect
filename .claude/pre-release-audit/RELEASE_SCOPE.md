# Release audit scope

Audit started 2026-09-26. No merge, push, release tag, version bump, or publication is authorized.

Candidate: `upgrade/phase-03-pricing-cards`, HEAD `e5297bb`. Base: `main` / `origin/main` at `ac6ae9f555dd69d61ca79be527cc1a80513643d9` (local refs; no remote freshness claim). There are 80 commits since main, touching 736 tracked files (+46,700/-3,100 lines). `develop` at `24dc4de` is an ancestor: its Phase 1/2 work is deliberately included by the previous integration task. The pricing-card feature tip `10fea06` is also included.

Initial dirty work is accounted for: six modified files and eleven new files/directories implement the user-requested CSV product importer (parser, persisted review, external identifiers, category mapping, explicit merge/combine/exclusion choices and inventory posting). This is part of the candidate, not unrelated work. The pre-existing stash is retained. No checkpoint commit is necessary to run the audit; an evidence manifest records the inspected tree, and final results apply to the candidate plus listed audit fixes.

Version was already changed from 2.0.0 on main to 2.0.1 in the candidate. This audit does not change it. Configuration deltas include database-inclusive CI, explicit Vite config, dev child shutdown, added cross-env/DOMPurify, and packaged pricing-card/migration resources. Playwright setup is added by this audit as requested.

Scope includes Phase 1 integrity/security/currency/VAT, Phase 2 documents/returns/counter receipts/credit limits/supplier aging/categories, secret-price/barcode changes, shop and brand assets, feature icons, pricing-card templates/resolution/editing/printing, routing and the CSV importer. Profit/COGS is not assumed implemented merely because the planning workspace describes a future phase.

Required evidence is recorded in the sibling audit documents and `evidence/`. Logs, raw business backups, credentials, browser profiles and restored customer records stay in ignored local storage. Test databases must be newly created and named explicitly; destructive suites must never use the source business connection.

Audit continued on 2026-09-27 (Asia/Beirut). Additional worktree changes are explained: Playwright dependency/configuration and synthetic harness; audit scripts/evidence/docs; explicit test discovery; backend timing logs; desktop readiness/cleanup/CSP/diagnostic fixes and tests; test commands in package.json. No new commit, stash operation, merge or push was performed. The final source checkpoint and installer SHA-256 identify the handoff; formatting-only changes after build do not imply an additional packaged functional change. Local audit output exists under release/audit-production-20260927 and is not published.
