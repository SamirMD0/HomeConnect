# Cloud relay setup

Use these steps when Phase 2 is ready to deploy. Keep the worker secret in your password manager for the shop PC.

1. Open the Neon Console, choose **New project**, select the **Free** plan and a Frankfurt region, and name the project **home-connect-relay**. Open **Connect**, turn **Connection pooling** off, and copy the PostgreSQL connection string. The same connection is used by the automatic Prisma migration during deployment. [Neon project setup](https://neon.com/docs/manage/projects), [Neon migration connections](https://neon.com/docs/connect/connection-errors)

2. Run this command once on your computer. Save the worker secret securely and copy its SHA-256 value for Render.

   ```sh
   node -e "const c=require('node:crypto'); const secret=c.randomBytes(32).toString('hex'); console.log('Worker secret = '+secret); console.log('RELAY_WORKER_TOKEN_SHA256 = '+c.createHash('sha256').update(secret).digest('hex'));"
   ```

3. In Render, open the repository's existing **Blueprint** and select **Manual Sync**. For a first Blueprint, choose **New → Blueprint**, connect this repository, select **main**, and use **render.yaml**. Review the **home-connect-relay** service with **Free**, **Frankfurt**, and automatic deploys disabled. [Render Blueprints](https://render.com/docs/infrastructure-as-code)

4. Set **RELAY_DATABASE_URL** to the Neon connection string and **RELAY_WORKER_TOKEN_SHA256** to the hash from step 2. Existing Blueprints accept these in the relay service's **Environment** page. First-time Blueprint creation prompts for them. [Render secret settings](https://render.com/docs/configure-environment-variables)

5. Apply the Blueprint and wait for the deploy to finish. The build generates the relay client, applies its migrations and compiles the relay. Open the service's HTTPS URL followed by **/relay/v1/health**. It should show `{"ok":true}`.

The shop PC will later use the saved worker secret as its bearer token. The PC will generate a separate token for each paired phone and register its hash through the worker API. Health checks allow Neon to sleep between real API requests.
