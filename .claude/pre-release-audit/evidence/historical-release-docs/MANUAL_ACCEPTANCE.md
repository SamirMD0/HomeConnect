# Manual acceptance — do not release yet

Run only after engineering/migration blockers are resolved and the final automated suite is green. Use a disposable restored acceptance database, with its database name visible/confirmed, not live shop data. Record operator, date, candidate commit/tree hash, printer/scanner models, screenshots and expected/actual results. Leave each box unchecked until personally performed.

## Installation and recovery

- [ ] Store a fresh verified backup on an independent/off-machine destination; record SHA-256 and restore location.
- [ ] On a disposable Windows profile/VM, install the previous approved version, restore a representative older business backup, and record balances, stock, settings and template customization.
- [ ] Install the candidate over that version. Do not install the audit package over the shop's live app. Verify database, accounts, settings, logo, customized templates and historical invoices survive.
- [ ] Rehearse a clean installation including PostgreSQL/configuration, first admin and default VAT/FX setup. Confirm first sale needs no SQL surgery.
- [ ] From fully stopped processes after reboot, launch once; record elapsed time to login and diagnostics. Close normally, confirm no owned backend remains, restart and record timing.
- [ ] In the disposable environment only, test unavailable DB and occupied app port; confirm useful guidance, Retry recovery and no killing of unrelated services.

## Catalogue and CSV

- [ ] Login as admin, search by name/model/SKU/barcode, open a product, change only notes, save without unintended price/identity changes.
- [ ] Import a COPY of TCLINV.csv in Products. Verify row count, title/header parsing, quantities and missing costs before committing.
- [ ] Map ELECTRONICS to the intended category (or explicit Uncategorized). Category-only issues must not offer an empty existing-product merge selector.
- [ ] Reimport the same file: inspect every duplicate; exercise rename/external-code change, explicit merge, combine-file-rows and explicit exclusion. No automatic skip.
- [ ] Merge with KEEP stock and confirm unchanged quantity. Separately test authorized reconciliation/password on a fixture and verify exact stock movement and audit after-value.
- [ ] Retry commit/refresh after submission; ensure no duplicate product, external ID or opening movement.

## Financial workflows

- [ ] With cost 370/public 400/default VAT 11%, sell two units in USD, collect 600, leave 200 debt. Verify invoice gross/VAT, customer ledger and payment report.
- [ ] Deduct two units, return one SELLABLE, apply debt relief first and cash refund remainder. Verify one unit restored and original VAT/FX snapshots unchanged.
- [ ] Return final unit; sum gross/VAT/base returns must exactly equal original snapshots, without residual cents. Re-submit/reprint must not duplicate posting.
- [ ] Repeat with LBP and a known FX rate; change the current rate afterward and reprint original documents. Historical values must not change.
- [ ] Exercise full refund, store credit, DAMAGED and QUARANTINE on fixtures; damaged/quarantined units must not inflate sellable stock.
- [ ] Attempt excessive quantity and outside-window return as employee; verify refusal, then authorized admin override with recorded reason.
- [ ] Create customerless cash sale; payment appears once in collected totals, not in a named customer statement.
- [ ] Purchase and receive three units with VAT, retry the action, confirm only three movements/units and correct ex-VAT cost; manual selling price unchanged. Repeat with explicitly automatic preset and inspect audit.
- [ ] Review supplier due dates, aging buckets/FIFO report, customer balances, payment report, inventory reconciliation and dashboard against the fixture ledger.

## Pricing cards, physical output and access

For physical-device sign-off, use one disposable TV product with a recorded
public price, stored SKU, barcode, and known staff-secret preset. Record those
four expected values **before** printing. Photograph or scan every page and
record printer/scanner model, driver settings, paper size, operator, and time.

1. Print the ordinary product barcode label and a pricing card with the secret preset off. Confirm the printed public price and SKU match the product record, and the barcode is not clipped or scaled into its quiet zones.
2. Scan the printed barcode into a plain text field, not the HomeConnect search box. Compare the entire decoded string byte-for-byte with the recorded barcode value. Then scan into HomeConnect and confirm it opens exactly that product.
3. Enable the known staff-secret preset, print another pricing card, and compare the displayed secret code/presentation SKU with the preset's documented expected encoding. Confirm the stored SKU, stored barcode, and public price in Products did not change. Scan the new barcode into plain text and confirm the secret suffix is **not** encoded.
4. Print the thermal card on the actual XP-80T/target device at 76 mm width and verify physical dimensions, legible bars, margins, no clipping, and no driver auto-scaling. Repeat step 2 with that card.
5. Print an A4/Letter invoice and receipt for a disposable sale, then a return receipt. Compare printed line items, VAT, currency, paid/debt/refund totals, identifiers, and Arabic/English text with the saved document and ledger. Reprint and confirm no new financial posting.
6. Cancel one print and disconnect one printer. Verify the app remains usable and never reports physical success without output. Restore the device and print again.

Automated checks cover label dispatch, barcode geometry, pricing-card print
rendering, and print snapshots; they **do not** prove paper/scanner output.

- [ ] TV, washer, refrigerator, small appliance and VGR trimmer: resolve product/category/shop template defaults, then verify correct preview after changes.
- [ ] Verify actual brand logo and missing-logo text fallback; no duplicate TCL TCL. Verify company logo, QLED, 4K, Dolby, Google TV, category icons, unknown-icon fallback and missing specs.
- [ ] Select staff-secret preset/encoding; public price unchanged, presentation SKU may include code, stored SKU unchanged. Invalid secret price must fail safely.
- [ ] Print A4/Letter invoice, receipt, return receipt and pricing cards; check Arabic/English, clipping, VAT/currency totals and valid-until.
- [ ] Print thermal card at actual size on the XP-80T/target printer. Confirm intended 76 mm width, quiet zones, sharp bars, no scaling/clipping.
- [ ] Scan printed barcode with the actual scanner. Encoded value equals printed barcode digits/product identifier; secret-price suffix must NOT be scanned.
- [ ] Cancel print and test unavailable printer; application remains responsive and reports failure without falsely claiming paper printed.
- [ ] Login as employee; attempt pricing configuration, restricted report, backup/restore and financial mutation without authorization/password. Confirm denial. Disable a logged-in user and confirm session rejection.

## Acceptance record

- [ ] All engineering and data blockers closed with rerun evidence; exact tested artifact hash recorded.
- [ ] Owner/accountant approves legacy counter-cash limitations and historical balances.
- [ ] Owner explicitly approves release in a new message. Only then consider main merge, tag/version or publishing; none is authorized by this checklist alone.
