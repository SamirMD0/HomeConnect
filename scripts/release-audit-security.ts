import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
for (const production of [false, true]) {
  const result = spawnSync(
    process.execPath,
    [npm, 'audit', '--json', ...(production ? ['--omit=dev'] : [])],
    { encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 8 * 1024 * 1024 }
  );
  const label = production ? 'production' : 'all';
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = { error: result.error?.message, stderr: result.stderr };
  }
  fs.writeFileSync(
    `.claude/pre-release-audit/evidence/security-${label}.json`,
    JSON.stringify(
      { checkedAt: new Date().toISOString(), exitCode: result.status, report },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      scope: label,
      exitCode: result.status,
      vulnerabilities: report.metadata?.vulnerabilities,
      error: report.error,
    })
  );
}
