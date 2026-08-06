export interface NormalizedProductError {
  message: string;
  fieldErrors: Record<string, string>;
  status?: number;
}

export function normalizeProductError(error: unknown): NormalizedProductError {
  if (!isObject(error) || !('response' in error)) {
    return { message: 'The request failed. Check the connection and try again.', fieldErrors: {} };
  }
  const response = (error as { response?: { status?: number; data?: unknown } }).response;
  const data = response?.data;
  const status = response?.status;
  const message = serverMessage(data);
  const fieldErrors = extractFieldErrors(data);

  if (status === 403) return { message: 'Administrator permission is required.', fieldErrors, status };
  if (status === 404) return { message: message || 'The selected product no longer exists.', fieldErrors, status };
  if (status === 409) return { message: message || 'A product with this barcode already exists.', fieldErrors, status };
  if (status === 400) return { message: message || 'Some product fields need correction.', fieldErrors, status };
  return { message: message || 'Something went wrong. Try again.', fieldErrors, status };
}

export function firstUnrenderedProductFieldError(
  fieldErrors: Record<string, string>,
  renderedFields: ReadonlySet<string>
): string | null {
  const hidden = Object.entries(fieldErrors).find(([field]) => !renderedFields.has(field));
  return hidden ? hidden[1] : null;
}

function serverMessage(data: unknown): string | null {
  if (!isObject(data)) return null;
  const error = data.error;
  return isObject(error) && typeof error.message === 'string' ? error.message : null;
}

function extractFieldErrors(data: unknown): Record<string, string> {
  if (!isObject(data) || !isObject(data.error)) return {};
  const details = data.error.details;
  if (isObject(details) && typeof details.field === 'string') {
    return { [details.field]: serverMessage(data) ?? 'This value is not available.' };
  }
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.flatMap((detail) => {
    if (!isObject(detail) || !Array.isArray(detail.path) || typeof detail.message !== 'string') return [];
    return [[detail.path.join('.'), detail.message]];
  }));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
