export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Run Setup-HomeConnect.ps1 from the setup bundle to create or repair production.env.`,
    );
  }

  return value;
}
