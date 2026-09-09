import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const setup = fs.readFileSync(path.resolve(__dirname, '../../../scripts/Setup-HomeConnect.ps1'), 'utf8');
const packagedFiles = fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8');

describe('production secret provisioning policy', () => {
  it('uses a cryptographic RNG and writes both independent secrets to the installed config', () => {
    expect(setup).toContain('RandomNumberGenerator');
    expect(setup).toContain('[byte[]]::new(48)');
    expect(setup).toContain('JWT_SECRET=$jwtSecret');
    expect(setup).toContain('JWT_REFRESH_SECRET=$jwtRefresh');
    expect(setup).toContain('$jwtRefresh -eq $jwtSecret');
  });

  it('repairs missing or weak existing values without printing secret material', () => {
    expect(setup).toContain('Test-StrongSecret');
    expect(setup).toContain('.Length -ge 32');
    expect(setup).not.toMatch(/Write-(?:Host|Ok|Warn).*\$jwtSecret/);
    expect(setup).not.toMatch(/Write-(?:Host|Ok|Warn).*\$jwtRefresh/);
  });

  it('never packages checkout env files', () => {
    expect(packagedFiles).toContain('!backend/.env');
    expect(packagedFiles).toContain('!**/.env');
  });
});
