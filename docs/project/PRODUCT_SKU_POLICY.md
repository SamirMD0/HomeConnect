# Product SKU Policy

Product SKUs use `HC-` followed by a sequence number padded to at least six digits, for example `HC-000124`.

- PostgreSQL sequence `product_sku_seq` is the only generator.
- Sequence gaps are valid and must not be repaired or reused.
- SKU never contains price, year, product category, or customer information.
- SKU is unique, scanner-safe, and stable for the product's lifetime.
- Manual changes and regeneration require an administrator password and reason.
- Changing a SKU invalidates previously printed labels. Reprint them immediately.
- Manufacturer barcode remains a separate optional field and is never overwritten by SKU.
- Internal price code is derived, non-unique, and must never be used as an identifier or search key.

Stock fields are preparatory metadata only. HomeConnect does not automatically deduct, receive, or move stock. The protected stock endpoint is the only writer of recorded stock quantity.
