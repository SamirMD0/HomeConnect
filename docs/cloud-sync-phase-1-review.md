# Phase 1 cloud sync review

The original additive migration installs an independent `sync_changes` log and 31 row triggers. The follow-up `20261114180000_sync_change_log_fanout` migration replaces seven functions with `CREATE OR REPLACE FUNCTION`. Each trigger uses OLD for deletes and NEW otherwise. Ownership changes also invalidate the former owner. Parent hard deletes use `delete`, while child deletes invalidate the parent with `upsert`. Targets use set queries without financial calculations.

| Triggered tables | Entity invalidated |
| --- | --- |
| `products` | `product`, affected `category` counts on assignment changes or insert/delete |
| `stock_movements` | `product` |
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
| `branches` | `branch` on every write. Name/code updates also invalidate orders with that branch ID. |
| `categories` | Insert/delete invalidate the category and parent. Updates invalidate the category. Name/parent changes also invalidate descendant categories and products in that subtree, selected by a recursive CTE. Reparenting invalidates both parents for counts. |
| `users` | `user`, plus actor metadata in `product`, `supplier`, and `sales_order` when names change |
| `user_branch_access` | `user` |
| `pricing_presets` | Products explicitly referencing the preset and automatic/custom-priced products using its active default. Updates require a change to name, pricing inputs, calculation/rounding modes, default/active state or archival state. |
| `tax_profiles` | Products explicitly referencing the profile and consumers of its active default. Updates require a change to code, tax rate, default/active state. |
| `tax_rates` | Products whose explicit profile uses that rate, plus consumers of an active default profile using that rate. Updates require a change to rate percentage, effective dates or active state. |

The schema currently stores catalog stock globally on `products` and `stock_movements`. It has no per-branch stock table.

| Feed entity | Existing read implementation |
| --- | --- |
| `product` | `ProductsService.getCatalogRecord`, using the catalog repository include, existing `serializeProduct`, and existing inventory-state helper |
| `customer` | `CustomersService.getCustomerWithFinancial`, using scoped `getCustomer` and `ReceivablesService.computeReceivableProjections` |
| `sales_order` | Existing scope guard, `SalesOrdersService.get`, and `documentBranch`, with live product inventory/cost fields omitted from sync lines |
| `supplier` | `SuppliersService.get`, including its existing balance and summary |
| `supplier_bill` | `getUnlinkedBill`, using the inbox's active/unlinked filters, supplier-name metadata and `groupPages` |
| `branch` | Scoped Prisma read with the existing `branchSelect` representation |
| `category` | `CategoriesService.get` |
| `user` | Explicit selection of `id`, `username`, `fullName`, `role`, `isActive` |

Products use the regular employee catalog presentation. Their image metadata is selected separately from image bytes. Bill records represent the unlinked inbox returned by `GET /supplier-bills`, with a stable group ID in the sync envelope. Linking, deleting, or removing the last active page produces a tombstone. Product, category and user reads follow the PC's global visibility. Customer, supplier, order, bill and branch reads use the accessible branch IDs. A transferred record produces a tombstone for its former branch, including when several changes collapse in one batch.

Synced order lines retain the PC's posted prices, amounts, product snapshots, fulfillment facts and convenient product identity/name/SKU fields. The phone resolves current product details through its product records. Product stock, cost, name and SKU edits therefore produce product updates independently of historical orders. The sync projection omits line `inventory` and nested product `trackStock`, `stockQuantity`, `lowStockThreshold` and `costPrice`. Category non-path updates and pricing/tax metadata-only updates avoid product fan-out. Branch order invalidation follows the reviewed name/code condition.

`readChanges` reads at most the requested raw-row limit, collapses to the last entity change, and advances over filtered rows. `nextSeq` is a decimal string so JSON clients retain bigint precision. Unexpected read failures fail the request before a caller can persist a new cursor.

Producers acquire shared transaction advisory lock `(74103, 1)` before allocating sequence values. Before requesting the exclusive lock, the feed executes `SET LOCAL lock_timeout = '2s'`. PostgreSQL lock timeout `55P03`, including Prisma's `P2010` wrapper, returns `{ records: [], nextSeq: <after unchanged>, hasMore: false, busy: true }`. The caller retries later. The aborted transaction releases its queued exclusive request so it cannot keep counter writes waiting. The successful transaction holds the lock only while reading the log batch and checking for another page, then releases it before loading business records. READ COMMITTED preserves visibility of writers that committed during the wait. Rollbacks can leave numeric sequence gaps, which cursor comparisons handle.

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

Verification covers both migration structures, bounded fan-out, last-change collapsing, tombstones, branch filtering/transfers, bigint pagination, user-field selection, order stock/price independence, and lock-timeout recovery. The isolated PostgreSQL tests cover three historical orders sharing a product, empty category insertion, subtree renaming/reparenting/deletion, pricing/tax targeting and metadata-only writes, branch targeting, real two-second timeout recovery, financial parity, concurrent commit ordering and rollback gaps. `RUN_SYNC_DB_TESTS=1` also requires a test/CI database name. Review validation passed all 81 tests in the four sync test files, including all nine database tests on a fresh migrated test database. `npm run typecheck:backend` passes.

Two future-worker considerations remain. The log begins recording writes when the migration is installed, so an initial snapshot must supply existing records. Date-derived overdue figures and effective tax dates can change without a database write, so a later worker needs a business-date refresh policy. Branch-access changes also require reconciling the consumer's scope. These behaviors belong to the later snapshot/worker phases.
