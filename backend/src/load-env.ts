import dotenv from 'dotenv';
import path from 'path';

/**
 * Loads the env file as an import side effect rather than from a statement in
 * `index.ts`. Imports are hoisted above ordinary statements, so a loop written
 * below the imports would run only after `./app` — and everything it pulls in —
 * had already been evaluated. Modules such as `auth.service.ts` read
 * `JWT_SECRET` at module scope, so the values have to be on `process.env`
 * before the first application import is evaluated. Importing this module first
 * is what guarantees that ordering.
 *
 * Kept alongside `index.ts` so the `__dirname` fallbacks below resolve from the
 * same directory they always have.
 *
 * `dotenv` never overwrites a variable that is already set, so the order here is
 * the precedence order: an explicit `BACKEND_ENV_FILE` wins over the installed
 * config directory, which wins over the developer checkout's `backend/.env`.
 */
for (const envPath of [
  process.env.BACKEND_ENV_FILE,
  process.env.HOME_CONNECT_CONFIG_DIR
    ? path.join(process.env.HOME_CONNECT_CONFIG_DIR, 'production.env')
    : undefined,
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../backend/.env'),
  path.resolve(__dirname, '../../../../backend/.env'),
]) {
  if (envPath) dotenv.config({ path: envPath, quiet: true });
}
