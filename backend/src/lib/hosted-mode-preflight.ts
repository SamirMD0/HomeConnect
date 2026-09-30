export function assertHostedModeEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.HOSTED_MODE !== 'true') return;

  const missing: string[] = [];
  const check = (name: string, expected?: string) => {
    const value = env[name];
    if (!value || (expected && value !== expected)) {
      missing.push(expected ? `${name}=${expected}` : name);
    }
  };

  check('DATABASE_URL');
  check('JWT_SECRET');
  check('JWT_REFRESH_SECRET');
  check('FRONTEND_URL');
  check('COOKIE_SECURE', 'true');
  check('HOST', '0.0.0.0');

  if (missing.length) {
    throw new Error(`HOSTED_MODE=true but required env is not correct:\n  ${missing.join('\n  ')}`);
  }
}
