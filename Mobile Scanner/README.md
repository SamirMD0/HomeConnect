# HomeConnect Mobile Scanner

A small, read-only Expo app that turns an Android or iPhone camera into a barcode scanner for HomeConnect. It talks directly to the business PC over the shop LAN.

The app is a scanner peripheral, not an ERP client. It cannot view or change customers, debts, payments, orders, prices, costs, or stock. It stores no product data and performs no offline synchronization.

## Requirements

- The phone and business PC must be on the same non-guest Wi-Fi network.
- HomeConnect 1.6.0 or newer must be running on the PC.
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

## Connect and pair

1. On the PC, open **Scanner Hub / مركز المسح**.
2. Press **Turn On**. Note the PC IPv4 address and scanner port. The default port is `3011`.
3. In the phone app, enter the PC IP and port and press **Test connection and continue**.
4. On the PC, press **Generate Code**.
5. Enter the six-digit code in the phone app. It expires after five minutes and works once.
6. Optionally name the phone, then press **Pair phone**.
7. The session token is stored only in the operating system's secure credential storage. Connection settings use the same secure store.

If the app cannot reach the PC, confirm that Scanner Hub is turned on, both devices are on the same Wi-Fi, the PC network profile is Private, and the Windows firewall rule exists.

## Scanning

- Press **Open camera**, grant camera permission, and point the target at a product barcode.
- Manual barcode or SKU entry is always available.
- The app sends only `{ "code": "…" }`; HomeConnect decides whether and how it matches.
- A found result contains only product ID, name, model, SKU, barcode, brand, and active/archive state.
- Repeated scans of the same code inside 2.5 seconds are suppressed.
- Unknown products and invalid codes are normal results, not application failures.
- A revoked or expired session returns the app to pairing.
- HTTP 429 responses show a slow-down message. Network failures explain that Wi-Fi or the PC listener may be unavailable.

The app never queues a scan. If the PC is unreachable, scan again after connectivity is restored.

## Security and privacy

- The scanner session uses `x-scanner-session`, never a HomeConnect user token.
- The session token is stored with `expo-secure-store`; there is no insecure fallback.
- There is no analytics, telemetry, crash reporting, remote logging, phone database, or product cache.
- Communication stays on the local network. The current backend listener uses plain HTTP, so use it only on the trusted shop LAN.
- Changing the PC address clears the scanner session and requires pairing again.

## Manual real-phone verification checklist

- [ ] Phone and PC are on the same LAN; mobile data and guest Wi-Fi are not being used.
- [ ] An admin enables Mobile Scanner in Scanner Hub.
- [ ] Setup accepts the PC IPv4 address and defaults the port to `3011`.
- [ ] Connection test succeeds against the address displayed by Scanner Hub.
- [ ] A wrong IP, disabled listener, or Wi-Fi outage produces a clear connection message rather than a crash.
- [ ] A valid six-digit pairing code succeeds.
- [ ] A wrong, expired, or already-used code shows the same generic pairing failure.
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
- [ ] Revoking the phone from Scanner Hub sends the phone back to pairing on its next request.
- [ ] Turning off Mobile Scanner on the PC produces the same clear unreachable-PC guidance.
- [ ] Sending more than 60 event requests in one minute produces a readable slow-down message, not a crash.
- [ ] Pressing **Pair again** removes the saved token and requires a new code.
- [ ] Pressing **Change PC** removes the saved token and returns to connection setup.

This checklist requires a real phone and the shop LAN. It is not replaced by simulator or unit-test results.
