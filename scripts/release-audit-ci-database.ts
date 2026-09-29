import fs from 'fs';
import { PrismaClient } from '@prisma/client';
async function main() {
  const file = 'e2e/.runtime/databases.json';
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const old = state.names.ci;
  if (!/^hc_audit_test_ci_\d{14}$/.test(old))
    throw new Error('Expected initial isolated CI database');
  const name = old.replace('_ci_', '_ci_phase4_phase5_phase6_');
  const url = new URL(state.urls.ci);
  url.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" WITH TEMPLATE "${old}"`);
  } finally {
    await admin.$disconnect();
  }
  url.pathname = `/${name}`;
  state.names.ci = name;
  state.urls.ci = url.toString();
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  console.log(`Isolated CI clone created: ${name}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
