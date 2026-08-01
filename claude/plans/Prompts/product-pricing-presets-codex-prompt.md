# Codex Implementation Prompt — Product Pricing Presets

Copy everything below the line into Codex.

---

You are implementing a new feature in the **HomeConnect** repository (Node/Express + Prisma/Postgres backend, React + TypeScript frontend, Electron desktop shell).

## Your source of truth

Read this file first and treat it as the specification:

```
claude/plans/product-pricing-presets-plan.md
```

It contains the full design: data model, formulas, API contract, UI plan, validation rules, tests, checkpoints, and the exact file list. **Do not redesign it.** If you believe part of it is wrong, stop and say so in your response before writing code — do not silently deviate.

## What you are building

A **Pricing Presets / صيغ التسعير** system. Products get a real cost price and a link to a reusable percentage formula (preset), or per-product custom percentages. The backend derives cash price, installment price, down payment, remaining, and monthly payment from that cost. The UI shows a live breakdown preview.

This version **calculates and displays numbers only**. It does not create debts, installment plans, or sales.

## Non-negotiable rules

1. **No JavaScript float math on money or percentages, anywhere.** Use `decimal.js` / Prisma `Decimal` end to end. Extend `backend/src/features/financial/domain/money.ts` with `multiplyMoney` / `divideMoney` rather than inventing a second money vocabulary inside the pricing feature.
2. **All money and percent values cross the API as strings.** Never as `number`.
3. **The rounding rule is exact and tested.** Compound the raw Decimal chain with **no intermediate rounding**, round once at the cash-price boundary. The canonical case must produce exactly these values and must be a pinned test:
   ```
   cost 300.00, expenses 10%, profit 7%, buffer 7%, installment markup 20%, down payment 40%, 3 months
   → cashPrice 377.82
   → installmentPrice 453.38
   → downPayment 181.35
   → remaining 272.03
   → monthlyPayment 90.67, lastInstallmentPayment 90.69
   ```
   The raw compound result is `377.817`; round once at the cash-price boundary. There is a test for it.
4. **`remaining = installmentPrice − downPayment`** by subtraction, never `installmentPrice × (1 − downPayment%)`. `downPayment + remaining` must equal `installmentPrice` exactly at 2dp, always.
5. **The last installment absorbs the residual cent.** `monthlyPayment` floors to 2dp; `lastInstallmentPayment = remaining − monthlyPayment × (n − 1)`. `monthly × (n−1) + last` must re-sum to `remaining` exactly.
6. **Do not break existing products.** Every new column is nullable or defaulted. `Product.price` and `Product.discount` keep their current meaning and are **not** repurposed, backfilled, or dropped. A product with no cost price and no preset must keep working and report `pricingAvailable: false`. The existing `products.routes.test.ts` must pass untouched — that is your proof.
7. **The calculated cash price is not stored.** It is derived on read.
8. **Admin password is never stored, never logged, never echoed, never placed in audit `beforeValues`/`afterValues`.** Reuse `verifyAdminPassword` from `backend/src/lib/admin-verification.ts`, and verify + mutate in the same transaction, exactly as `products.service.ts` already does.
9. **Reuse the existing audit table.** `ServiceAudit` is already generic. Add only the `PRICING_PRESET` record type and `SET_DEFAULT` action. Do not create a new audit model.
10. **Terminology.** The 7% uplift is `discountBufferPercent` / **هامش الخصم**. It is never called a discount in code, API, or UI. `Product.discount` is a different, subtractive field.
11. **Do not convert the app to RTL.** Layout stays LTR. Use `dir="auto"` on user-entered text inputs and displays only — never on numeric money/percent values.
12. **Follow existing repo conventions rather than your own.** Mirror `backend/src/features/suppliers/` for feature layout, `backend/src/features/service/products/` for validator/repository/service/controller/routes structure, and `frontend/src/features/products/` for the frontend feature shape.

## One open decision, already resolved for you

The plan's D6 asks whether non-admin staff can see `costPrice`. **Implement the recommendation: `costPrice` is admin-only in API responses; all staff can read cash and installment prices.** Note it in your CP5 summary so it can be revisited.

Decisions D1–D5 and D7 are settled in the plan — follow the stated recommendation for each.

## How to work

Implement the checkpoints in §17 of the plan, **in order**. One checkpoint per commit. Do not start a checkpoint until the previous one's tests pass.

```
CP1  Confirm gaps (read-only, no code) — report back before proceeding
CP2  Prisma schema + single migration (incl. raw-SQL partial unique index)
CP3  Pure pricing calculator + money helpers + tests
CP4  Pricing preset API (admin password + reason + audit wired in from the start)
CP5  Pricing resolution, preview endpoint, product pricing PATCH
CP6  Frontend types/schemas/api/hooks
CP7  Pricing Presets page, table, form dialog, action dialogs, route, nav
CP8  Product pricing section + preview card + products table column
CP9  Bilingual labels, dir="auto" pass, responsive/empty/loading/error polish
CP10 Docs
CP11 Final verification + version bump + release notes
```

**Stop and report after CP1** with your confirmation that the plan's assumptions hold — specifically that `Product.price`/`discount` semantics and the `ServiceAudit` reuse are as described. Then continue through the rest.

Two implementation details that are easy to get wrong:

- The Prisma schema has **no `@map` on columns**, so Postgres column names are camelCase. The partial unique index raw SQL must quote them:
  ```sql
  CREATE UNIQUE INDEX "pricing_presets_single_default"
    ON "pricing_presets" ("isDefault")
    WHERE "isDefault" = true AND "archivedAt" IS NULL;
  ```
- In `products.routes.ts`, register `/:productId/pricing` and `/:productId/pricing-preview` **above** the bare `GET /:productId`, matching how the existing action routes are ordered.

## Do not

- Do not implement anything in §16 (out of scope): sale-time discount, debt/installment-plan creation, checkout, stock, VAT, delivery/installation fees, reports, ecommerce sync, cost history, bulk re-pricing.
- Do not auto-seed example presets.
- Do not auto-overwrite `Product.price` with the calculated cash price. The "use calculated price" action is human-triggered only.
- Do not add an N+1 preview call per row in the products list — compute list-level cash price in-process from an included preset relation.
- Do not bump the version or generate an installer before CP11.

## Verification

Run per-checkpoint tests as you go. At CP11 only, run the full suite once:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

All five must pass. If any fail, fix the cause — do not skip, silence, or weaken a test to make it green. Report the actual output.

## Reporting

After each checkpoint, state briefly: what you built, which tests you ran and their result, and anything in the plan that turned out to be wrong or under-specified. If you had to deviate, say so explicitly and why.
