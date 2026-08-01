# claude/documentation

Reference documents for Claude Code sessions. These answer recurring questions so a session does not have to re-analyze the repository to reach the same conclusion twice.

Distinction from neighbouring folders:

- `claude/PROJECT_BRIEF.md` — read first; orientation, stack, runtime architecture, conventions
- `claude/documentation/` — **this folder**; standing analysis and architectural assessments
- `claude/plans/` — implementation plans for specific features, written before the work
- `docs/` — the project's own user- and phase-facing documentation

## Index

| Document | Answers |
|---|---|
| [ERP_POSITIONING.md](ERP_POSITIONING.md) | What an ERP actually is, why HomeConnect is not one, the three structural gaps, the forced sequence if ERP is ever pursued, and why it is not recommended. Read before proposing inventory, purchase-order, general-ledger, or "make it an ERP" work. |

## Conventions for documents added here

- State a **status line** with the date and app version the analysis was made against.
- Cite evidence with concrete file paths, model names, and line numbers.
- Include a **"when to revisit"** section listing the conditions that would invalidate the analysis. A standing document without one silently rots.
- Reach a verdict. These documents exist to prevent a decision being re-litigated, which requires that a decision was actually made.
