# Phase 1 cloud sync review

The additive migration installs an independent `sync_changes` log and 31 row triggers. Each trigger uses OLD for deletes and NEW otherwise. Ownership changes also invalidate the former owner. Parent hard deletes use `delete`, while child deletes invalidate the parent with `upsert`. Each affected entity is inserted through a set query, with no SELECT loops or financial calculations.

| Triggered tables | Entity invalidated |
| --- | --- |
| `products` | `product`, related `sales_order`, affected `category` counts |
| `stock_movements` | `product`, related `sales_order` inventory presentations |
| `product_images`, `product_pricing_card_features` | `product` |
| `customers` | `customer`, related `sales_order` customer details |
| `debts`, `installment_plans` | `customer`, linked `sales_order` |
| `installments` | `customer`, linked `sales_order`, through the plan |
| `prepaid_purchases` | `customer`, linked `sales_order`, through the debt |
| `payments` | `customer`, associated `sales_order` |
| `payment_allocations` | `customer`, `sales_order`, through payment and debt/installment targets |
| `sales_orders` | `sales_order`, `customer` |
| `sales_order_items`, `sales_order_stock_fulfillments` | `sales_order` |
| `sales_returns`, `sales_return_items` | `sales_order`, `customer` |
| `sales_return_receivable_allocations` | `customer`, `sales_order`, through return and receivable targets |
| `cash_refunds`, `customer_credits` | `customer`, return's `sales_order` |
| `customer_credit_applications` | `customer`, `sales_order`, including receivable targets |
| `suppliers` | `supplier`, active `supplier_bill` groups with supplier-name metadata |
| `supplier_transactions`, `supplier_receivings` | `supplier` |
| `supplier_receiving_receipts` | `supplier_bill`, keyed by `COALESCE(billGroupId, id)` |
| `branches` | `branch`, all `sales_order` branch display metadata |
| `categories` | `category`, related category paths/counts, all `product` category paths |
| `users` | `user`, plus actor metadata in `product`, `supplier`, and `sales_order` when names change |
| `user_branch_access` | `user` |
| `pricing_presets`, `tax_profiles`, `tax_rates` | All `product` pricing presentations |

The schema currently stores catalog stock globally on `products` and `stock_movements`. It has no per-branch stock table.

| Feed entity | Existing read implementation |
| --- | --- |
| `product` | `ProductsService.getCatalogRecord`, using the catalog repository include, existing `serializeProduct`, and existing inventory-state helper |
| `customer` | `CustomersService.getCustomerWithFinancial`, using scoped `getCustomer` and `ReceivablesService.computeReceivableProjections` |
| `sales_order` | Existing scope guard, `SalesOrdersService.get`, and `documentBranch`, matching the detail controller |
| `supplier` | `SuppliersService.get`, including its existing balance and summary |
| `supplier_bill` | `getUnlinkedBill`, using the inbox's active/unlinked filters, supplier-name metadata and `groupPages` |
| `branch` | Scoped Prisma read with the existing `branchSelect` representation |
| `category` | `CategoriesService.get` |
| `user` | Explicit selection of `id`, `username`, `fullName`, `role`, `isActive` |

Products use the regular employee catalog presentation. Their image metadata is selected separately from image bytes. Bill records represent the unlinked inbox returned by `GET /supplier-bills`, with a stable group ID in the sync envelope. Linking, deleting, or removing the last active page produces a tombstone. Product, category and user reads follow the PC's global visibility. Customer, supplier, order, bill and branch reads use the accessible branch IDs. A transferred record produces a tombstone for its former branch, including when several changes collapse in one batch.

`readChanges` reads at most the requested raw-row limit, collapses to the last entity change, and advances over filtered rows. `nextSeq` is a decimal string so JSON clients retain bigint precision. Unexpected read failures fail the request before a caller can persist a new cursor.

Producers acquire shared transaction advisory lock `(74103, 1)` before allocating sequence values. The feed briefly acquires the same lock exclusively while reading the log batch and checking for another page, then releases it before loading business records. READ COMMITTED ensures the log query sees writers that committed while the lock was waiting. This allows concurrent producers and prevents skipping an earlier unfinished transaction. PostgreSQL rollbacks can leave numeric sequence gaps. The integration test verifies cursor continuity across those gaps and deliberately out-of-order writer commits.

The remaining schema tables are omitted for the following reasons.

| Tables without triggers | Reason |
| --- | --- |
| `customer_imports`, `customer_import_accounts`, `product_imports`, `product_external_identifiers` | Import and external-identity metadata is absent from these feed records. Committed customer, debt and product writes are captured on their own tables. |
| `activity_logs`, `financial_correction_audits`, `admin_verification_logs`, `service_audits`, `sales_audits`, `supplier_audits`, `supplier_receiving_audits`, `repair_history` | Audit and maintenance history is absent from the selected payloads. Underlying business mutations have triggers. |
| `shop_profiles`, `brand_logos`, `pricing_card_feature_icons`, `pricing_card_templates`, `pricing_card_prints`, `label_secret_settings`, `label_secret_encoding_presets` | Branding and print configuration is absent from the selected payloads. Product-owned feature values have their own trigger. |
| `business_settings`, `exchange_rates` | These records are absent from the selected payloads. Financial amounts use the existing stored transaction exchange rates and PC services. |
| `service_jobs` | Phase 1 has no service-job entity, and the customers receivables projection does not load service jobs. |
| `supplier_receiving_items`, `supplier_purchase_lines` | Supplier balances come from supplier transactions. Stock effects are captured through products and movements. These lines are absent from supplier profile records. |
| `supplier_receipt_blobs` | Binary image storage. Bill metadata is captured through receipt rows. |
| `sync_changes` | The log has no recursive trigger. |

The admin inspection route validates nonnegative PostgreSQL bigint cursors and limits of 1–500. Authentication, ADMIN authorization and the existing branch middleware protect it. The phone gateway denies the `/api/v1/sync` prefix, including encoded paths.

Verification covers migration structure, last-change collapsing, tombstones, branch filtering and transfers, bigint pagination, user-field selection, helper parity, route authorization/validation and gateway denial. Validation used a fresh PostgreSQL database with all migrations applied. The integration test exercises product, debt, payment and allocation insert/update/delete operations, image metadata, HTTP financial parity, concurrent commit ordering and rollback gaps. All 156 tests across the eight targeted files passed with the database tests enabled. `npm run typecheck:backend` passes. `RUN_SYNC_DB_TESTS=1` is registered in `test:ci` and also requires a test/CI database name.

Two future-worker considerations remain. The log begins recording writes when the migration is installed, so an initial snapshot must supply existing records. Date-derived overdue figures and effective tax dates can change without a database write, so a later worker needs a business-date refresh policy. Branch-access changes also require reconciling the consumer's scope. These behaviors belong to the later snapshot/worker phases.
