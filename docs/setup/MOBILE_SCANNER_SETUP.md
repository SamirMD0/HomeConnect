# Mobile Scanner Setup

A phone on the shop Wi-Fi can scan product barcodes and have the product open on the business PC. The phone is only a scanner: it holds no data, has no login, and cannot see prices, cost, stock, customers, debts, or payments.

The database stays on the business PC. Nothing goes to the internet.

## How it works

```
Phone browser  ->  business PC, port 3011  ->  PostgreSQL on the PC
```

Port 3011 serves **only** the scanner page and its pairing endpoints. The main HomeConnect application stays on `127.0.0.1` and is never reachable from the Wi-Fi.

Mobile scanner mode is **off every time the app starts**. It is never remembered. If the PC restarts, it is off again.

## One-time PC setup

Both steps need Windows administrator rights, and both are needed only once.

### 1. Set the network to Private

Settings → Network & Internet → Wi-Fi → click the network name → select **Private network**.

On a Public network Windows refuses incoming connections before any rule is consulted, so the phone cannot reach the PC at all.

This changes nothing about the Wi-Fi itself and affects no other device. It applies only to this PC on this named network.

### 2. Allow the port through the firewall

Open PowerShell as administrator (Start → type `PowerShell` → right-click → **Run as administrator**) and run:

```powershell
New-NetFirewallRule -DisplayName "HomeConnect Scanner" -Direction Inbound -LocalPort 3011 -Protocol TCP -Action Allow -Profile Private
```

### 3. Recommended: reserve the PC's address

The scanner address contains the PC's network address, for example `http://192.168.0.178:3011/mobile-scanner`. If the router hands out a different address later, that link stops working and a new one has to be read off the Scanner Hub.

Setting a DHCP reservation for the business PC in the router keeps the address, and therefore the link, stable.

## Daily use

1. On the PC, open **Scanner Hub / مركز المسح**.
2. Press **Turn On**. The phone address appears.
3. Press **Generate Code**. A six-digit code appears with a five-minute countdown.
4. On the phone, open the address shown. Type it once; the phone will remember it afterwards.
5. Enter the six-digit code and a device name, then press **Pair phone**.
6. The phone shows **Connected**. Scan by typing a barcode or SKU, or with the camera if it is available (see below).
7. Found products open on the PC. Scans appear under **Recent Scans** on both the Scanner Hub and the Products page.

Press **Turn Off** when finished. This disconnects every paired phone.

### Codes and sessions

- A pairing code lasts **five minutes**, works **once**, and generating a new one cancels the previous one.
- Five wrong codes from the same device blocks that device for fifteen minutes.
- A paired phone stays paired for up to **twelve hours** of use, and never more than twenty-four hours.
- At most **three** phones can be paired at once. Pairing a fourth disconnects the one that has been idle longest.
- Mobile scanner mode **turns itself off after eight hours** with no scanner activity, so it is never left open overnight by accident.
- Only an administrator can turn the scanner on or off, generate codes, or disconnect a phone. Other staff can see the status and use a phone that is already paired.

## Camera scanning

The phone page always supports typing a code by hand. That path always works.

The camera is offered **only when the phone's browser allows it**. Browsers block camera access on pages served over plain `http` to a network address, which is what this is. On most phones the camera button will therefore not appear, and typing the code is the normal workflow.

If you want to try the camera on a specific Android phone, Chrome can be told to trust this one address:

1. In Chrome on the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Add `http://192.168.0.178:3011` (using your own PC address)
3. Enable the flag and restart Chrome
4. Reopen the scanner page — a **Use camera** button appears if the phone also supports barcode detection

This is a per-phone testing workaround, not part of the normal setup. Do not apply it to shared or customer devices.

## Troubleshooting

**The phone says the site refused to connect.**

Nearly always the network or firewall, not the app. Check in this order:

1. Is mobile scanner mode **on** in the Scanner Hub? It is off after every restart.
2. Is the network profile set to **Private**? A Public profile blocks the connection regardless of firewall rules.
3. Does the firewall rule exist? Re-run the command above; it is harmless to run twice.
4. Is the phone on the **same Wi-Fi** as the PC, not mobile data and not a guest network?
5. Is the address right? The Scanner Hub may list several. Try the one starting `192.168.` first — the others usually belong to virtual adapters and never work.

A blocked port and a broken app look identical from the phone. To tell them apart, open the same address in a browser **on the PC itself**. If it loads there but not on the phone, the app is fine and the problem is the network or firewall.

**The pairing code is not accepted.**

Codes expire after five minutes and work only once. Generate a fresh one. After five failed attempts a device is blocked for fifteen minutes.

**The phone was working and stopped.**

The session may have expired, been revoked, or mobile scanner mode may have turned itself off after eight idle hours. The phone will say to pair again. Generate a new code.

**Scans do not open on the PC.**

Open the Products page and turn on **Scanner Mode**, or use the Scanner Hub, which always listens. Scans still record either way and appear in Recent Scans.

## What the phone cannot do

By design, and enforced on the server:

- It cannot see prices, cost, the internal price code, stock, specifications, notes, or product images.
- It cannot create, edit, archive, or re-price a product.
- It cannot see or touch customers, debts, payments, installments, suppliers, sales orders, or the ledger.
- It cannot reach any part of HomeConnect other than the scanner page and its own pairing endpoints.

A scan returns the product name, model, SKU, barcode, brand, and whether the product is archived. Nothing else.
