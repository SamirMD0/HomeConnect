export interface NormalizedFinancialError {
  message: string;
  fieldErrors: Record<string, string>;
  status?: number;
}

export function normalizeFinancialError(error: unknown): NormalizedFinancialError {
  if (!isObject(error) || !('response' in error)) {
    return { message: 'The request failed. Check the connection and try again.', fieldErrors: {} };
  }

  const response = (error as { response?: { status?: number; data?: unknown } }).response;
  const data = response?.data;
  const serverMessage = extractServerMessage(data);
  const status = response?.status;

  if (status === 403) {
    return { message: 'Admin permission is required for this action.', fieldErrors: {}, status };
  }

  if (status === 404) {
    return { message: serverMessage || 'The selected record no longer exists.', fieldErrors: {}, status };
  }

  if (status === 409) {
    return { message: serverMessage || 'This action conflicts with the current financial record state.', fieldErrors: {}, status };
  }

  if (status === 400) {
    return {
      message: serverMessage || 'Some fields need correction.',
      fieldErrors: extractFieldErrors(data),
      status,
    };
  }

  return { message: serverMessage || 'Something went wrong. Try again.', fieldErrors: {}, status };
}

function extractServerMessage(data: unknown): string | null {
  if (!isObject(data)) return null;
  const error = data.error;
  if (isObject(error) && typeof error.message === 'string') return error.message;
  if (typeof data.message === 'string') return data.message;
  return null;
}

function extractFieldErrors(data: unknown): Record<string, string> {
  if (!isObject(data)) return {};
  const error = data.error;
  const details = isObject(error) ? error.details : undefined;
  if (!Array.isArray(details)) return {};

  const fieldErrors: Record<string, string> = {};
  for (const detail of details) {
    if (!isObject(detail)) continue;
    const path = Array.isArray(detail.path) ? detail.path.join('.') : null;
    if (path && typeof detail.message === 'string') fieldErrors[path] = detail.message;
  }
  return fieldErrors;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
