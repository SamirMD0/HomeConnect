# ERP Module Map

`frontend/src/features/dashboard/config/module-registry.ts` is the source of module names, Arabic labels, Lucide icons, routes, status, and accents.

```mermaid
graph TB
  subgraph LIVE
    Customers --> Debts
    Customers --> Payments
    Debts --> Ledger
    Payments --> Ledger
    Suppliers --> SupplierLedger
    Products --> Pricing
    Customers --> Service
    Customers --> SalesOrders
    Products --> SalesOrders
    SalesOrders --> Debts
    SalesOrders --> InstallmentPlans
    Reports
  end
  subgraph NEXT
    Inventory
  end
  subgraph PLANNED
    Sales
    Finance
  end
  Inventory -. future stock ownership .-> SalesOrders
  SalesOrders --> Sales
  Ledger --> Finance
```

| Status | Behavior |
|---|---|
| LIVE | Full-color, routed, and optionally displays a live count |
| NEXT | Muted, outlined, non-interactive, marked Coming next |
| PLANNED | Muted, outlined, and non-interactive |

## Adding A Module

1. Add or change one registry entry with a Lucide icon and route.
2. Add an isolated backend analytics slice if dashboard metrics are required.
3. Add one dashboard section and hook without changing unrelated sections.

Future modules remain non-clickable until their workflow exists.

Sales Orders is a live commercial and fulfillment module at `/sales-orders`. It snapshots customer/product details, owns order totals and counter-sale cash facts, and may link to exactly one Debt or Installment Plan. Receivable balances and allocations remain owned by the financial modules; v1 sales never writes stock.
