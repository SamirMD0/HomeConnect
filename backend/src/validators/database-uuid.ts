import { z } from 'zod';

// PostgreSQL's uuid type accepts canonical UUID text even when the version nibble is not one of
// the RFC-assigned versions. Legacy HomeConnect product imports used that valid database shape.
const DATABASE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function databaseUuidSchema(message = 'Invalid ID') {
  return z.string().regex(DATABASE_UUID_PATTERN, message);
}
