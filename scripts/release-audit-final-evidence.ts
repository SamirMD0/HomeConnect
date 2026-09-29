import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
const dir = '.claude/pre-release-audit/evidence';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const hash = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tests = JSON.parse(fs.readFileSync(`${dir}/vitest-report.json`, 'utf8'));
const failures = tests.testResults.flatMap((suite: any) =>
  suite.assertionResults
    .filter((t: any) => t.status === 'failed')
    .map((t: any) => ({
      file: path.relative(process.cwd(), suite.name),
      test: t.fullName,
      message: t.failureMessages?.join('\n'),
    }))
);
const files = git('ls-files', '--cached', '--others', '--exclude-standard')
  .split('\n')
  .filter(
    (f) =>
      !f.startsWith('.claude/pre-release-audit/evidence/') &&
      fs.existsSync(f) &&
      fs.statSync(f).isFile()
  );
const source = {
  capturedAt: new Date().toISOString(),
  head: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  base: git('merge-base', 'main', 'HEAD'),
  status: git('status', '--short'),
  hashes: Object.fromEntries(files.map((f) => [f, hash(f)])),
};
fs.writeFileSync(`${dir}/final-source-checkpoint.json`, JSON.stringify(source, null, 2));
fs.writeFileSync(
  `${dir}/test-summary.json`,
  JSON.stringify(
    {
      total: tests.numTotalTests,
      passed: tests.numPassedTests,
      failed: tests.numFailedTests,
      pending: tests.numPendingTests,
      failures,
    },
    null,
    2
  )
);
const artifact = 'release/audit-production-20260927/HomeConnect-Setup-2.0.1.exe';
fs.writeFileSync(
  `${dir}/installer-checksum.json`,
  JSON.stringify(
    { path: artifact, bytes: fs.statSync(artifact).size, sha256: hash(artifact) },
    null,
    2
  )
);
for (const kind of [
  'compiled',
  'packaged',
  'dev-missing',
  'db-retry',
  'jwt-missing',
  'port-conflict',
]) {
  const logs = `e2e/.runtime/electron-${kind}/logs`;
  if (!fs.existsSync(logs)) continue;
  const timelines = fs
    .readdirSync(logs)
    .filter((f) => /^startup-\d+\.jsonl$/.test(f))
    .map((file) => ({
      file,
      events: fs
        .readFileSync(path.join(logs, file), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    }));
  fs.writeFileSync(`${dir}/startup-timelines-${kind}.json`, JSON.stringify(timelines, null, 2));
}
console.log(
  JSON.stringify({
    head: source.head,
    tests: {
      total: tests.numTotalTests,
      passed: tests.numPassedTests,
      failed: tests.numFailedTests,
      pending: tests.numPendingTests,
    },
    sourceFiles: files.length,
    installerBytes: fs.statSync(artifact).size,
  })
);
