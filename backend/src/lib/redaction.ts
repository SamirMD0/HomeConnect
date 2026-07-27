const SECRET_KEY_PATTERN = /(password|accountPassword|currentPassword|newPassword|token|secret|authorization)/i;

export function redactSensitiveData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitiveData(entry),
    ])
  ) as T;
}
