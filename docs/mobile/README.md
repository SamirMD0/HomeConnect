# Home Connect on the phone

The phone app is another screen for the same Home Connect system that runs on the shop PC. It has no data of its own. Every sale, payment, stock change and bill photo is saved on the PC straight away, and the PC shows it immediately.

```
Phone ──shop Wi-Fi──▶ Shop PC, port 3011 (phone connection) ──▶ Home Connect on the PC ──▶ database
```

## What you need

- The shop PC turned on, with **Home Connect open** and the **Mobile Scanner** switch on in **Scanner Hub**.
- A desktop version that includes the phone features (**2.2.0 or later**). On an older PC the app still signs in, but shows "Update HomeConnect on the shop PC to use all mobile features."
- The phone on the **same Wi-Fi** as the PC.
- A normal Home Connect user account. The phone shows only what that user may do on the PC: admins see admin actions, employees do not.

## Install

1. Open the install link from the Expo build page (the `preview` build) on the phone and install the APK. Allow "install unknown apps" for the browser if Android asks.
2. Version 2.0.0 installs **over** the old "HomeConnect Mobile Scanner" app (same Android package), so there is no need to uninstall it first.
3. The app is now called **Home Connect**.

## First start

1. **Connect to the PC:** scan the QR code shown in Scanner Hub, or type the PC address and port `3011`.
2. **Sign in** with your Home Connect username and password.
3. **Choose your branch.** The header always shows the current branch; switch it from **More → Switch branch**.

The phone stays signed in: it renews the login in the background. Losing Wi-Fi does not sign you out; it shows an offline banner and carries on when Wi-Fi returns.

## What is where

| Tab | What you can do |
| --- | --- |
| **Home** | Shop figures (unless hidden on the PC), quick actions, pending bill uploads |
| **Sell** | New order (scan or search), customers and statements, take a payment and share the receipt, sales orders, prepaid items |
| **Stock** | Products and shared stock, price check, receive goods, stock count (admins), adjust stock from a product |
| **Suppliers** | Bills inbox, photograph a bill, pending uploads, supplier invoice, supplier payment, each supplier's statement, purchases and bills |
| **More** | Reports, account, PC connection, branch, sign out, app version and updates |

The **Scan** button is on every tab.

**Stock** is one shared quantity per product for all branches, exactly as on the PC.

**Saved drafts:** orders, payments, stock counts and receivings are saved on the phone while you work, so closing the app does not lose them. Passwords are never saved.

## Troubleshooting

| Problem | Check |
| --- | --- |
| "Cannot reach the Home Connect server" | The phone and PC are on the same Wi-Fi; Home Connect is open on the PC; Scanner Hub has Mobile Scanner on; the PC address has not changed. |
| Works on one Wi-Fi but not another | Some routers block phone-to-PC traffic ("AP isolation" or "client isolation"). Turn it off on the router, or use a network without it. |
| Still cannot connect | Windows Firewall on the PC must allow Home Connect on **private** networks for port 3011. Make sure the Wi-Fi is set to *Private* in Windows, not *Public*. |
| "Update the app" screen | The PC requires a newer phone app. Install the latest `preview` build. |
| "Update HomeConnect on the shop PC…" banner | The PC runs a desktop version older than 2.2.0. Update the PC. |
| "Account password is incorrect" on a stock change | Corrections ask for **your own** password again. It is checked by the PC and is not saved on the phone. A mistake does not sign you out. |
| A bill photo stays in Pending uploads | Open **Suppliers → Pending uploads** and tap Retry. If it says it was rejected, the message says why (for example, wrong supplier). |

## Releasing a new phone version

There are two ways to update the phones:

| Change | How it reaches phones |
| --- | --- |
| Only app code (screens, text, logic) | **Over-the-air update.** Phones download it at the next launch, or from More → tap the version row. No new install. |
| A new or upgraded native package (`npx expo install …`), or a change to `app.json` permissions, icon or plugins | **New build** (APK), and the app version must go up. |

Over-the-air updates only reach phones on the **same app version** (`runtimeVersion` follows the app version). Whenever you raise the version, ship a new build too.

### Commands (in `Mobile Scanner/`)

Preview, which is the internal APK used in the shop:

```bash
eas build --platform android --profile preview
```

Over-the-air update to preview phones:

```bash
eas update --channel preview --message "Describe the change"
```

Production (Play Store app bundle), only if the app is ever published:

```bash
eas build --platform android --profile production
```

Before any build or update, run the [release checklist](release-checklist.md).

### Versions

- **Phone app:** `version` and `android.versionCode` in `Mobile Scanner/app.json`. Raise `versionCode` by one for every build.
- **Minimum phone version the PC accepts:** `MIN_MOBILE_VERSION` in `backend/src/features/system/system.routes.ts`.
- **PC version the phone needs for every feature:** `REQUIRED_API_VERSION` in `Mobile Scanner/src/api/system-api.ts` (currently 2.2.0).
