import { spawnSync } from 'child_process';

const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://homeconnect:password@localhost:5432/homeconnect',
};

const result = spawnSync(
  'npx',
  ['prisma', 'validate', '--schema', 'backend/prisma/schema.prisma'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  }
);

process.exit(result.status ?? 1);
