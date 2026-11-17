# Cloud relay setup — clicks only

Install **PC 2.4.0 with cloud sync disabled** first, so its new secret button is available. Then deploy the **relay**, enable PC cloud sync only after it is healthy, and install **phone APK 2.3.0 last**. All relay migrations must be deployed before any new phone connects. No terminal, SQL editor or operator migration commands are needed.

Before starting: on the shop PC, open **Settings → Create backup now**, wait for success and keep the backup. Install the reviewed **HomeConnect 2.4.0** desktop update. Its additive PC migrations run automatically. Sign in as an administrator and leave **Enable phone cloud sync** off. Shop-Wi-Fi mode continues working while cloud setup is unfinished. This disabled-PC preparation step resolves the first-install dependency on the new secret button.

## 1. Create the Neon database

1. Open the [Neon Console](https://console.neon.tech), choose **New project**, name it **home-connect-relay**, choose **Free**, and select **Frankfurt**. Keep this database separate from the shop PC database.
2. Open the project's branch and **Compute → Edit**. Set compute size to **Fixed, 0.25 CU**. If the console shows an autoscaling range, set **minimum 0.25 and maximum 0.25**. Save. Keep **Scale to zero / Suspend after inactivity** at **5 minutes**; Free may show this as fixed rather than editable. [Neon compute settings](https://neon.com/docs/manage/computes)
3. Click **Connect**, select the relay database and its owner role, turn **Connection pooling on**, and copy the PostgreSQL connection string. It normally has `-pooler` in its hostname. Save it privately; it contains a database password. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

## 2. Create the Render service and worker secret

1. On the shop PC 2.4.0, open **Settings → Phone cloud sync**. Leave **Enable phone cloud sync** off. Click **Create worker secret**.
2. Click **Copy worker secret** and save it in the shop password manager. It has already been encrypted and saved in that installation's worker settings. The displayed secret disappears on **Close secret**, after five minutes, or when Settings closes; it cannot be read back. Keep the display open until the next step is complete.
3. In [Render](https://dashboard.render.com), open the repository's existing **Blueprint → Manual Sync**. For first setup, choose **New → Blueprint**, connect the repository, select **main**, and use **render.yaml**. Review **home-connect-relay**: **Free**, **Frankfurt**, automatic deploys off. Preserve the existing staging service. [Render Blueprints](https://render.com/docs/infrastructure-as-code)
4. Supply **RELAY_DATABASE_URL** with the pooled Neon string from step 1. Click **Copy SHA-256** in the PC app and paste that value into Render's **RELAY_WORKER_TOKEN_SHA256**. Render gets the hash, never the worker secret. First Blueprint creation prompts for these values; on an existing service open **Environment → Edit**, then save them. [Render environment settings](https://render.com/docs/configure-environment-variables)
5. Close the secret display after saving both values. Do not create another secret to show the old one: that replaces it. Replacement requires updating the hash on Render too; the app asks for confirmation.

The relay build automatically uses the matching direct Neon endpoint for Prisma migrations, while the running relay keeps the pooled connection. No second connection string or migration command is needed. Non-Neon URLs are unchanged. [Neon Prisma connection guidance](https://neon.com/docs/guides/prisma)

## 3. Deploy the relay and check it

1. Apply the Blueprint or choose the relay's **Manual Deploy → Deploy latest commit**. Wait for **Live**. The build generates the relay client, applies **all six relay migrations**, and compiles the relay, including device role, snapshot visibility and PIN-status support.
2. Open the service's HTTPS address with **/relay/v1/health** appended, for example `https://home-connect-relay.onrender.com/relay/v1/health`. The page must show `{"ok":true}`. The actual service name may have a suffix; copy the address Render displays. A sleeping free service can take about a minute to wake.
3. If deployment fails, leave the shop worker disabled and check the Render deploy log and the two Environment values. Do not edit database tables, remove migration history, or distribute the APK to bypass a failure.

## 4. Update and connect the shop PC

1. Confirm the prepared shop PC is on **HomeConnect 2.4.0** and the relay is **Live**, with the health result from step 3. Keep the existing backup.
2. Sign in as an administrator. Open **Settings → Phone cloud sync**. Paste the relay's HTTPS service address, without `/relay/v1/health` or another path.
3. The generated **worker secret** is already saved, so leave the Worker secret field blank. If moving from another PC, paste the saved **worker secret**, not its SHA-256. Set opening/closing times, check **Enable phone cloud sync**, and click **Save sync settings**.
4. Click **Sync now**. Wait for **Last sync** to show a recent time with no error. An initial copy can take several cycles on a large shop. The PC must remain running for phone actions to be applied. If the relay rejects the secret, verify the saved secret and Render hash belong together; do not generate a replacement unless you also update Render.

## 5. Install and pair the phone

1. Only after the relay is healthy and PC sync succeeds, install the reviewed **phone app 2.3.0, Android versionCode 13** over the existing app. This is a new native APK, not an OTA update: SQLCipher and local biometric authentication need the native modules.
2. On the PC, **Settings → Phone cloud sync → Pair a phone**: choose the current user, permitted branches and phone name; click **Create pairing QR**.
3. On the phone, scan that cloud QR. Create a matching **4–6 digit PIN twice**; optionally enable enrolled fingerprint/face unlock. Wait for the first data copy. Keep the QR private; close it after scanning.
4. Compare a product, customer balance and Home figures with the PC. Follow the [phone release smoke checklist](../mobile/release-checklist.md#cloud-release-230-with-pc-240). Use **Refresh phones** on the PC to check **PIN set: Yes** and the reported **Last unlock** after the next phone sync.

## 6. Check the first week of usage

Open the Neon project's **Overview / Usage** and the account's **Billing / Usage** every day for the first week. Record the date, compute CU-hours, storage and transfer shown, plus how many phones and hours the shop used cloud sync. Confirm compute remains fixed at **0.25 CU** and suspends after **5 minutes**. Compare the console's current Free allowance with actual usage, then review the week with Claude before broader release. Request/body measurements from the local test are not measured Neon compute usage. [Neon usage dashboard](https://neon.com/docs/introduction/monitor-usage)

To pause or roll back, uncheck **Enable phone cloud sync** and click **Save sync settings** on the PC. This stops PC cloud processing; phones can retain cached records and continue contacting the relay until switched to shop-Wi-Fi mode or revoked. Switch each phone to its existing shop-Wi-Fi connection and sign in there. Check pending cloud actions on the PC before entering them again. Do not delete a phone's local data or uninstall it while unsent work still needs review.
