# Codex prompts — v1.9.3

Plan: `claude/plans/scanner-v1.9.3-pos-preview-plan.md`

**Reference the plan by section. Do not paste architecture or release history into a prompt.**
§0 already records the file map and the two findings that shape the release. Do not re-derive them.

> **Scope corrected 2026-08-14.** v1.9.3 now includes CP-E, the supplier transaction ↔ receiving
> link, which carries a migration. This is a **schema release**. Version stays 1.9.2 until CP-1934,
> and CP-1934 is blocked until CP-1930 (migration gate) passes. See the plan's scope-correction
> note and §6.

## Standing rules

- Touch only the files in the checkpoint's scope. Anything else is a stop condition.
- Do not bump version, build an installer, stage, commit, or push.
- Do not touch the business PC database.
- Run the focused tests named in the checkpoint. Full suite at CP-1934 only.
- Report the five-line delta, nothing more:

```
files changed:
behavior changed:
tests run:
blockers:
next step:
```

**The `blockers:` line covers release-level state, not only your own diff.** If the working tree
carries an unrehearsed migration, an uncommitted schema change, or work from another checkpoint,
say so every time — even when your own checkpoint is clean. Two migrations are currently
unrehearsed and must be reported as blockers until CP-1930 clears them.

---

## CP-1931 — product preview modal

> Per §3 of `claude/plans/scanner-v1.9.3-pos-preview-plan.md`, add a product preview modal opened
> by a desk scan on Scanner Hub. The modal fetches its own detail from the existing authenticated
> `GET /products/:id` plus `useProductImageUrl` — **do not add price or stock to
> `ProductScanPayload`** (§3, "the security rule"): that payload is served to the unauthenticated
> LAN phone endpoint. Add a test asserting its exact key set.
>
> Phone scans must not open the modal (§3). Out of stock warns but does not disable "Make Order";
> archived disables it (§8).
>
> Stop and report if anything requires changing `scanLookup` or the LAN router.

## CP-1932 — Make Order prefill

> Per §4, wire "Make Order" to the existing sales-order wizard, mirroring the v1.9.2 supplier-debt
> bridge: navigate with route state, let `SalesOrdersPage` open the dialog, clear the state.
>
> Route state carries **`productId` only** — no price crosses the boundary. The dialog fetches the
> product and applies the exported `salesLineForProduct` from `ProductLinePicker` (§0.1) rather
> than duplicating price logic. Prefill may set only productId, unit price and quantity 1 (§4).
>
> Stop and report if a price would cross route state, if a new endpoint is needed, or if prefill
> would set customer, payment or status fields.

## CP-1933 — carried v1.9.2 follow-ups

> Per §5: add a `staleTime` to `useProductInventory`, and replace the `pageSize: 100` supplier
> dropdown in `SupplierReceivingForm` with a searchable picker.
>
> Defer either fix if it exceeds a few lines rather than growing the release.

## CP-1930 — migration gate (blocks CP-1934)

> Per §6 and §11 of the plan, run the migration safety scan and the restored-business-PC-backup
> rehearsal for **both** unrehearsed migrations —
> `20260814110000_add_supplier_receivings` and
> `20260814170000_link_supplier_transactions_to_receivings` — applied together, in order, against
> one restored backup copy. Never against the business PC database itself.
>
> Also prove the CP-E link is informational: no money query reads `supplierReceivingId`, supplier
> balances are unchanged across the migration, and a cross-supplier link is rejected by the
> database rather than only by the service.
>
> Stop and report if any statement is destructive, any backfill exists, or any balance changes.

## CP-1934 — release

> **Blocked until CP-1930 passes.** Full validation, release notes documenting the CP-E link and
> **including the deployment-gate paragraph** (§12), bump to 1.9.3, installer, selective staging,
> commit. Follow the v1.9.2 release checkpoint shape.
