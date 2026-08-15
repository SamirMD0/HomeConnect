# Codex prompts — v1.9.2

Plan: `claude/plans/inventory-v1.9.2-product-picker-supplier-bridge-plan.md`

**Reference the plan by section. Do not paste architecture or release history into a prompt.**
The plan's §0 already answers "is a backend change needed", "what do I mirror", and "how does the
bridge reach the form". Do not re-derive them.

## Standing rules for every prompt

- Touch only the files listed in the checkpoint's scope. Anything else is a stop condition.
- Do not bump version, build an installer, stage, commit, or push.
- Do not touch the business PC database.
- Run the focused tests named in the checkpoint. Not the full suite (CP-1925 only).
- Report the five-line delta, nothing more:

```
files changed:
behavior changed:
tests run:
blockers:
next step:
```

---

## CP-1922 — searchable product picker

> Per §3 of `claude/plans/inventory-v1.9.2-product-picker-supplier-bridge-plan.md`, build a shared
> searchable product picker mirroring the existing `CustomerPicker` / `useCustomerSearch` pattern,
> and use it to replace the capped 100-item `<select>` in both `ProductLinePicker` and
> `SupplierReceivingForm`.
>
> Frontend only — the list API already supports `search` (§0.1). Scope is the six files in §12.
> In the receiving form, list ineligible products disabled with a reason instead of hiding them
> (§3, last bullet). Run the picker, receiving-form and sales-order-form tests.
>
> Stop and report if any backend change appears necessary.

## CP-1923 — receiving to supplier debt bridge

> Per §4 of the same plan, add the admin-only "Record supplier debt" action to the receiving
> document, routing to the supplier profile with prefill state, and raise the supplier transaction
> `reference` cap from 100 to 200 (validator constant, no migration — §4 "reference-length trap").
>
> Scope is the four source files plus tests in §12. The `prefill` prop type must make `amount`
> unprefillable. Run the receiving-detail, supplier-form and transaction-validator tests.
>
> Stop and report if anything would create a debt automatically, prefill an amount, add a database
> link between receiving and transaction, or require a new endpoint.

## CP-1925 — release

> Full validation, release notes, bump to 1.9.2, installer, selective staging, commit. Follow the
> v1.9.1 release checkpoint shape. Full suite runs here.
