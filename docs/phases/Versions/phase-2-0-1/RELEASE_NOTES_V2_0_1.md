# HomeConnect v2.0.1 — Scan-Safe Labels and Secret Label Pricing

A focused hotfix on top of v2.0.0. It contains no ERP-upgrade (Phase 1/2) work.

## Scan-safe barcodes

Large price labels printed on the Xprinter XP-80T (203 dpi thermal roll) often did not scan: the
bars printed thick and ran together. The barcode had been stretched to fit the label box, which
left every bar a fraction of a printer dot wide, and thermal printing closed the narrow gaps.

Barcodes are now generated at a fixed physical size:

- The narrowest bar is exactly 0.375 mm — 3 printer dots. A barcode that will not fit at that size
  uses 0.25 mm (2 dots); one that still will not fit prints its value as text with an on-screen
  warning. A barcode is never squeezed or stretched.
- Every barcode has the blank margins scanners need on both sides.
- The value encoded in the bars is printed underneath, for manufacturer barcodes and HomeConnect
  SKUs alike. The digits are always exactly what the scanner reads.
- Barcode formats are unchanged: EAN-13, UPC-A and EAN-8 for retail codes, CODE128 otherwise.

## Shop barcodes instead of the SKU

A product with no manufacturer barcode now gets its own **13-digit shop barcode**, printed like
the retail barcodes on the boxes, e.g. `2 000000 000015`:

- Format: `200` + a 9-digit running number + the standard EAN-13 check digit. Codes starting
  `200`–`299` are reserved worldwide for in-store use, so they never clash with a real product.
- It is saved in the product's barcode field, so the scanner finds the product, duplicates are
  impossible, and the label prints it instead of the `HC-…` SKU.
- New products get one automatically when saved without a barcode.
- On upgrade, every existing product with an empty barcode is given one. Products that already
  have a manufacturer barcode are not touched. The SKU is unchanged and still identifies the
  product everywhere else.
- At 42.75 mm wide it fits both label types at full bar size.

## Label types

Single-label and bulk-label print settings have a **Label type** choice:

- **Large — with price** — 72 × 50 mm, the full printable width of the 80 mm roll.
- **Small — without price** — 58 × 40 mm.
- **Custom** — the previous free-size settings, unchanged.

Choosing a type prints one label per page at exactly the label size, so the printer driver has
nothing to rescale.

## Secret label pricing preset

The staff code on the `SKU:` line (for example `HC-000288-K380Z`) tells a salesperson the lowest
price they can agree to. It used to be each product's own price before its discount buffer. An
administrator can now choose which pricing preset defines it:

1. Open **Pricing Presets**.
2. On the preset that represents the best price, choose **Use for hidden label price** (key icon)
   and confirm with a reason and your account password.

The staff code is then that preset's cash price for the product's cost. Editing the preset's
percentages updates the code on the next print. The public selling price is never affected.

- Only one preset can hold this role. Archiving it is blocked until the role is cleared.
- With no preset chosen, labels keep the previous code and the print screen says so.
- If the secret price would be above the selling price, or cannot be calculated, no code is printed
  and the print screen names the product.
- The scanned barcode never contains the staff code.

## Printing

In the desktop app, **Print** on a Large, Small or other fixed-size label (and bulk sticker runs)
now prints through the app itself. Each label is exactly one page of its own size, with no margins,
no scaling and no page address or date header, so the roll feeds only the label's length.

Auto-size labels and A4 sheets still open the normal print dialog. When printing from a browser, the
print screen explains the settings to use: untick **Headers and footers**, set **Margins** to
**None** and **Scale** to **100**.

## Data

Two idempotent migrations:

- `20260918120000_add_pricing_preset_label_secret` adds `pricing_presets."isLabelSecret"`
  (default `false`) and a unique index allowing at most one active secret preset.
- `20260918121000_add_internal_product_barcodes` creates `product_internal_barcode_seq` and fills
  `products."barcode"` **only where it is empty** with a shop barcode. Re-running changes nothing.

Rolling back to v2.0.0 needs no down-migration: it ignores the new column, and the filled
barcodes are ordinary barcodes that v2.0.0 already prints and scans. Take the usual backup before
installing, because the barcode fill does change product rows.
