import { privateIpv4Candidates, mobileScannerUrls } from '../backend/src/features/scanner/lan-address';

/**
 * Prints where the dev servers can be reached, before `npm run dev` starts them.
 *
 * The distinction it exists to make clear: the app itself is loopback-only and
 * the phone scanner is not. Those are different ports with deliberately
 * different exposure, so the URL that works from a phone is not the URL that
 * works on this PC.
 */
const BACKEND_PORT = process.env.PORT || '3001';
const FRONTEND_PORT = process.env.VITE_PORT || '3002';
const SCANNER_PORT = process.env.SCANNER_LAN_PORT || '3011';

const addresses = privateIpv4Candidates();
const [primary, ...others] = mobileScannerUrls(addresses, Number(SCANNER_PORT));

const lines = [
  '',
  '  HomeConnect dev',
  '  ---------------',
  `  App             http://127.0.0.1:${FRONTEND_PORT}`,
  `  API             http://127.0.0.1:${BACKEND_PORT}/api/v1`,
  '                  this PC only, by design - the ERP is never served to the LAN',
  '',
];

if (primary) {
  lines.push(
    `  Phone scanner   ${primary}`,
    `                  needs LAN mode enabled by an admin, and inbound TCP ${SCANNER_PORT}`,
    '                  allowed on the Windows Private network profile',
  );
  if (others.length) {
    lines.push('                  other adapters (usually Hyper-V/WSL - try only if the first fails):');
    for (const url of others) lines.push(`                    ${url}`);
  }
} else {
  lines.push('  Phone scanner   no private network address found - is this PC on Wi-Fi?');
}

lines.push('');
console.log(lines.join('\n'));
