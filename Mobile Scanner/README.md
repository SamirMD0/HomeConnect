# HomeConnect Mobile Scanner

A shop-floor Expo app that scans products and handles supplier invoices, payments, statements, and receipt photos. It talks directly to the business PC over the shop LAN.

The app is not an offline ERP client. Supplier actions are sent to the HomeConnect backend; receipt photos can be queued locally until the PC is reachable. The app does not manage customer debts or sales.

## Requirements

- The phone and business PC must be on the same non-guest Wi-Fi network.
- The PC must run a HomeConnect build that includes the authenticated mobile LAN gateway.
- An administrator must open **Scanner Hub / مركز المسح** and turn on Mobile Scanner.
- Windows must allow the scanner port through the Private-network firewall, as described in `../docs/setup/MOBILE_SCANNER_SETUP.md`.
- Node.js and Expo Go are needed only for development testing.

## Development setup

From `Mobile Scanner/`:

```powershell
npm install
npm start
```

Open the project in Expo Go by scanning the QR code printed by Expo. No APK or IPA is produced by these commands.

Quality checks:

```powershell
npm run typecheck
npm run lint
npm test
```

## Installable Android test build

The `internal` EAS profile produces a signed APK for direct installation on a shop phone. From `Mobile Scanner/`, sign in to the intended Expo account, then run:

```powershell
npx eas-cli build --platform android --profile internal
```

The mobile app uses the Scanner Hub LAN port (normally `3011`). That listener exposes only scanner routes and the exact authenticated API operations required for product lookup and supplier workflows; the full desktop API remains private. Do not treat an APK as shop-ready until the real-phone checks below pass.

Record the build URL, APK checksum, build date, and tested phone model in the release notes. Keep the download link private: an internal build URL may be accessible to anyone who has it. The build needs Expo account/project setup and network access; this repository does not contain signing credentials. Do not publish a desktop release until the APK is installed and the following real-phone checks pass.

### Supplier workflow on a real shop phone

- [ ] Sign in, reconnect after force-closing the app, and confirm an expired session returns to sign-in.
- [ ] Record an invoice using an existing product and a manual line; check quantity, unit cost, total, and resulting supplier balance on the PC. No payment should be recorded during invoice creation.
- [ ] Record a supplier payment with the correct method; check the balance and statement entry on the PC. Avoid duplicate submission after a slow response.
- [ ] Capture and upload a receipt photo for the new purchase; verify it appears on the PC. Turn Wi-Fi off, queue another photo, reconnect, and verify the queued photo uploads exactly once.
- [ ] Open the supplier statement and compare its opening balance, entries, and closing balance with the PC.
- [ ] Take a manual backup and confirm its matching `.receipts` folder contains the captured photo and `manifest.json`; validate and restore only in a disposable test environment.
- [ ] Test wrong file type, oversized image, deleted receiving, and offline/error states without crashing or creating partial records.

## Connect and sign in

1. On the PC, open **Scanner Hub / مركز المسح**.
2. Press **Turn On**. Note the PC IPv4 address and scanner port. The default port is `3011`.
3. In the phone app, enter the PC IP and port and press **Test connection and continue**.
4. Sign in with an active HomeConnect username and password. The phone uses the account's normal permissions; an admin account is required to record supplier invoices and payments. No scanner pairing code is needed for this app.
5. The access token and connection settings are stored in the phone's secure credential storage.

If the app cannot reach the PC, confirm that Scanner Hub is turned on, both devices are on the same Wi-Fi, the PC network profile is Private, and the Windows firewall rule exists.

## Scanning

- Press **Open camera**, grant camera permission, and point the target at a product barcode.
- Manual barcode or SKU entry is always available.
- The barcode lookup sends the code to the authenticated product-scan endpoint; HomeConnect decides whether and how it matches.
- A found result contains only product ID, name, model, SKU, barcode, brand, and active/archive state.
- Repeated scans of the same code inside 2.5 seconds are suppressed.
- Unknown products and invalid codes are normal results, not application failures.
- An expired or revoked account session returns the app to sign-in.
- HTTP 429 responses show a slow-down message. Network failures explain that Wi-Fi or the PC listener may be unavailable.

The app never queues a scan. If the PC is unreachable, scan again after connectivity is restored.

## Security and privacy

- This native app uses the account's authenticated backend session for barcode lookup and supplier workflows. The legacy scanner web page uses a separate pairing session.
- Session credentials use `expo-secure-store`. Pending receipt photos are stored locally until upload succeeds; protect the phone with a screen lock.
- There is no analytics, telemetry, crash reporting, remote logging, or product cache.
- Communication stays on the local network. The current backend listener uses plain HTTP, so use it only on the trusted shop LAN.
- Changing the PC address clears the account session and requires sign-in again.

## Manual real-phone verification checklist

- [ ] Phone and PC are on the same LAN; mobile data and guest Wi-Fi are not being used.
- [ ] An admin enables Mobile Scanner in Scanner Hub.
- [ ] Setup accepts the PC IPv4 address and defaults the port to `3011`.
- [ ] Connection test succeeds against the address displayed by Scanner Hub.
- [ ] A wrong IP, disabled listener, or Wi-Fi outage produces a clear connection message rather than a crash.
- [ ] Valid account credentials sign in; wrong credentials show a clear failure.
- [ ] An expired or revoked account session returns to sign-in.
- [ ] The secure session survives fully closing and reopening the app.
- [ ] Camera permission can be granted and a real EAN/UPC/Code 128 barcode scans.
- [ ] Denying camera permission leaves manual entry usable.
- [ ] Manual SKU entry returns the same product as a matching physical label.
- [ ] A found result shows only ID, name, model, SKU, barcode, brand, and active/archive state.
- [ ] Verify by eye that price, cost, stock, notes, specifications, customers, and payments never appear.
- [ ] An unknown barcode shows **Not found**, not a generic error.
- [ ] A malformed code shows **Invalid code**.
- [ ] Repeated scanning of the same barcode within 2.5 seconds sends only one lookup.
- [ ] Turning Wi-Fi off mid-session shows the local-network error; restoring Wi-Fi allows a new scan without replaying the failed scan.
- [ ] Turning off Mobile Scanner on the PC produces the same clear unreachable-PC guidance.
- [ ] Repeated failed sign-ins are rate-limited without exposing account details.
- [ ] Pressing **Sign out** removes the saved account token.
- [ ] Pressing **Change PC** removes the saved account token and returns to connection setup.

This checklist requires a real phone and the shop LAN. It is not replaced by simulator or unit-test results.
