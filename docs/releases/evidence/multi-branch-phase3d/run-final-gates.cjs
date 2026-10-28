'use strict';
// Run from the worktree root; credentials are passed only through child env.
const fs = require('node:fs');
const cp = require('node:child_process');
const env = { ...process.env, ...require('dotenv').parse(fs.readFileSync('backend/.env')) };
const name = decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1));
if (name !== 'homeconnect_test_phase4_phase5_phase6' || name === 'homeconnect') throw new Error('Unsafe database');
console.log('Confirmed command database: ' + name);
let args;
if (process.argv[2] === 'ci') {
  env.NODE_ENV = 'test'; // The developer .env may otherwise force development mode.
  args = ['run', 'test:ci'];
} else if (process.argv[2] === 'rehearsal') {
  env.REHEARSAL_DB = process.argv[3];
  if (!/^homeconnect_test_mb_[a-z0-9_]+$/.test(env.REHEARSAL_DB || '')) throw new Error('Unsafe rehearsal database');
  console.log('Confirmed fresh rehearsal target: ' + env.REHEARSAL_DB);
  args = ['run', 'rehearse:migrations', '--', '--confirm-scratch'];
} else throw new Error('Expected ci or rehearsal <homeconnect_test_mb_...>');
const result = cp.spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { env, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
process.exit(result.status ?? 1);
