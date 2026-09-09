export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Run Setup-HomeConnect.ps1 from the setup bundle to create or repair production.env.`,
    );
  }

  return value;
}

export const MIN_SECRET_LENGTH = 32;

/** Production signing keys must be present and long enough to resist guessing. */
export function requireSecretEnv(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = requireEnv(name);
  if (value.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters. Re-run Setup-HomeConnect.ps1 to replace the weak value safely.`,
    );
  }
  return value;
}
