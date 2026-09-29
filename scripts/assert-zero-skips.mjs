import fs from 'node:fs';

const report = JSON.parse(fs.readFileSync('node_modules/.cache/home-connect/vitest-report.json', 'utf8'));
const skippedFiles = report.testResults.filter((file) => ['skipped', 'pending', 'todo'].includes(file.status));
const skippedTests = report.numPendingTests + report.numTodoTests;
if (!report.success || skippedFiles.length || skippedTests) {
  console.error(`CI gate failed: ${skippedFiles.length} skipped files; ${skippedTests} skipped/todo tests; success=${report.success}`);
  process.exit(1);
}
console.log(`CI gate passed: ${report.testResults.length} files, ${report.numPassedTests} tests, 0 skipped files, 0 skipped tests.`);
