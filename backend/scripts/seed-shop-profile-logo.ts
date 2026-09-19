import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const logoPath = resolve(process.cwd(), 'homeconnects-logo.webp');
const bytes = readFileSync(logoPath);
const encoded = bytes.toString('base64');

process.stdout.write([
  'UPDATE "shop_profiles"',
  `SET "logoBytes" = decode('${encoded}', 'base64'), "logoMimeType" = 'image/webp', "logoByteSize" = ${bytes.length}`,
  "WHERE \"id\" = '4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21' AND \"logoBytes\" IS NULL AND \"logoMimeType\" IS NULL AND \"logoByteSize\" IS NULL;",
  '',
].join('\n'));
