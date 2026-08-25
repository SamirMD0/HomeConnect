# Codex / Claude Prompt — CP-RW8 / Release

Run this **once per release** in the real-work sequence. It is a thin wrapper, not a runbook.

## The runbook already exists — use it

```
claude/plans/Prompts/release-version-bump-and-db-repair-prompt.md
```

That file is the authority for cutting a HomeConnect release: preflight gates, the five verification commands, version-bump mechanics, installer build, business-PC repair handling, and the facts about this repo that must not be re-derived (version lives in `package.json` only; `release/` is gitignored; the business PC's `_prisma_migrations` table has historically been drifted).

**Do not rewrite it, and do not work around a failing gate in it.**

This prompt supplies only what that runbook asks you to fill in, per release.

---

## What is different about this whole sequence

**None of these four releases contains a Prisma migration.** Every checkpoint from CP-RW2 to CP-RW7 was designed to use existing tables and columns. That means:

- Phase 3 of the runbook (repair SQL, `manifest.json`, `RepairRegistry`, SHA-256 stamping) **does not apply** to any of these four releases.
- If a release you are cutting *does* contain a migration, something went wrong in implementation. **Stop and report it** rather than proceeding — a schema change appearing here is a plan violation, not a release task.

**`backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql` is not part of any release.** It is not in `backend/prisma/repair/`, it is not in `manifest.json`, and `RepairRegistry` will never see it. It is a one-off cleanup the user runs by hand, after a fresh backup, whenever they choose. Do not bundle it, do not register it, do not run it.

---

## The release is v2.0.0, cumulative — one installer, not four

An earlier draft of this file listed four separate releases (v1.9.7 → v1.10.0). **That did not happen and is no longer the plan.** None of them was ever cut: RW2–RW7 all landed in one uncommitted working tree, and the installed version is still `1.9.6`. Shipping four installers now would be version spam for no benefit.

Everything ships once, as **`v2.0.0`**.

```
Version:        2.0.0
Release type:   major
What shipped:   Inventory-managed ERP release. Add Product can enable stock tracking;
                Scanner "Make Order" prefills the scanned product; batch opening-count
                onboarding with dry-run preview clears the untracked backlog; Inventory
                Untracked tab paginates server-side; product image and name open details
                with Inventory and Make Order quick actions; live barcode/SKU/model
                duplicate detection; Brands section with combobox, near-match hints, and
                admin-controlled duplicate cleanup.
Schema changed: no
Push to remote: <ask>
```

### The changelog must state that 2.0.0 is not a breaking release

The runbook defines major as "breaking change to data or workflow". This release is major by **milestone**, not by breakage — it is schema-identical to `1.9.6`. Say so explicitly, or anyone upgrading (including future-you reading `git log`) will assume a data migration:

> No schema change, no migration, no repair SQL. Upgrade is install-over-the-top from any 1.9.x.

Do not silently let a `2.0.0` imply a migration that does not exist.

### Do not cut this release until CP-RW8B, 8C, and 8D are closed

See the **CP-RW8 Release Freeze Review** section of the plan. As of 2026-08-22 the open blockers are: the Brands page is read-only and cannot fix duplicates, the untracked `.backup` file is not gitignored, `backend/prisma/data-fixes/` is untracked while the UI names its path on screen, and unrelated WhatsApp/customer-communication work is mixed into the same tree. **If those are still open, stop and report rather than cutting.**

---

## Release-specific smoke tests

The runbook covers install and startup. These are the workflow checks for **this** release — run **all four groups** on the installed build, in order, and report the actual result of each. A smoke test that was not run is reported as not run, never as passed.

### Inventory batch onboarding (CP-RW3 + CP-RW4)

1. Inventory → Untracked tab shows a **total greater than 100** and paginates.
2. Inventory → Onboarding lists products with no opening balance, server-searched.
3. Select ~10, set counts, **Preview** — tallies are correct.
4. Change one count → the preview invalidates and the password field disappears.
5. Preview again, submit with the admin password → written/skipped counts reported accurately.
6. Open two of those products: Stock section shows a verified opening count and one `OPENING_BALANCE` row each.
7. Re-submit the same batch → every row reports **skipped**, and the original opening balances are unchanged.
8. Wrong password → rejected, nothing written.

### Product page UX + duplicate detection (CP-RW5 + CP-RW6)

1. Products grid: click a product image → details drawer opens.
2. Click a product name → details opens; it does **not** toggle the selection checkbox.
3. Click the checkbox → selects; it does **not** open details.
4. Table view: click the thumbnail → details opens.
5. Inventory quick action → drawer opens on the Stock section.
6. Make Order quick action → sales order opens with that product prefilled, quantity 1.
7. Add Product: type a barcode that already exists → the owning product is named inline and **Save is blocked**.
8. Edit an existing product → it does not flag itself as a duplicate.

### Brands (CP-RW7)

1. Add Product: type `koz` → `Kozano` appears with its product count; selecting it fills the canonical spelling.
2. Type `KOZANO` → near-match hint appears; adopting it sets `Kozano`; ignoring it still saves `KOZANO`.
3. Type a brand-new brand → saves unchanged, no hint.
4. Products filter: brand dropdown lists brands with counts and filters correctly.
5. Brands page lists brands, counts, and flags any brand with more than one spelling.

### Brand duplicate cleanup (CP-RW8B)

1. Brands page: a multi-spelling row (`General` / `GENERAL`) offers a **Fix spellings** action.
2. Preview names the affected products and the exact count before anything is written.
3. Apply with a typed reason → products update, the row collapses to one spelling, the amber flag clears.
4. **`General Pro`, `General Gold`, and `GENERAL OCEAN` are untouched.** Verify each by name.
5. Re-running the same cleanup changes 0 products.
6. Spot-check one affected product's audit history: the brand change is recorded with the reason.
7. The Brands page no longer instructs the user to run a SQL file.

---

## Backups

The runbook's backup step is not optional here even though no release carries a migration. Take the backup before installing, every time.

If the user chooses to run the brand cleanup script, it is a **separate operation with its own fresh backup**, not part of a release. Its own header says so.

---

## Report

Follow the runbook's reporting requirements, plus:

1. Which release you cut, and the exact installer path produced.
2. Every smoke test above, with its actual result.
3. Confirmation that **no migration** was included and that the brand SQL was not bundled, registered, or executed.
4. Whether anything was pushed, and to where.
