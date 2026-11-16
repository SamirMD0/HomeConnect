import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { requireSecretEnv } from '../../../lib/env';

const key = () => createHash('sha256').update('home-connect:sync-worker:v1:').update(requireSecretEnv('JWT_SECRET')).digest();

export function encryptWorkerSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const bytes = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), bytes.toString('base64')].join('.');
}

export function decryptWorkerSecret(encrypted: string): string {
  const [version, iv, tag, data] = encrypted.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted worker secret');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
