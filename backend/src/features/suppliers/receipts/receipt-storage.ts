import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../../lib/prisma';

export interface ReceiptFile {
  id: string;
  filename: string;
}
export interface ReceiptStorage {
  put(file: ReceiptFile, bytes: Buffer): Promise<void>;
  get(file: ReceiptFile): Promise<Buffer>;
  delete(file: ReceiptFile): Promise<void>;
}

export function receiptsDir(): string {
  const configured = process.env.RECEIPTS_DIR?.trim();
  if (configured) return configured;
  const userData = process.env.HOME_CONNECT_USER_DATA?.trim();
  return userData ? path.join(userData, 'receipts') : path.join(process.cwd(), 'receipts-dev');
}

export class DiskReceiptStorage implements ReceiptStorage {
  constructor(private readonly directory = receiptsDir()) {}
  private location(file: ReceiptFile) {
    // Only server-generated filenames, including those from existing rows.
    if (!/^[0-9a-f-]{36}\.(jpg|png|heic|heif|webp)$/.test(file.filename))
      throw new Error('Invalid receipt filename');
    return path.join(this.directory, file.filename);
  }
  async put(file: ReceiptFile, bytes: Buffer) {
    const location = this.location(file);
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(location, bytes, { flag: 'wx' });
  }
  async get(file: ReceiptFile) {
    return fs.readFile(this.location(file));
  }
  async delete(file: ReceiptFile) {
    await fs.rm(this.location(file), { force: true });
  }
}

export class DbReceiptStorage implements ReceiptStorage {
  constructor(private readonly db: Pick<typeof prisma, 'supplierReceiptBlob'> = prisma) {}
  async put(file: ReceiptFile, bytes: Buffer) {
    await this.db.supplierReceiptBlob.create({ data: { receiptId: file.id, data: bytes } });
  }
  async get(file: ReceiptFile) {
    const blob = await this.db.supplierReceiptBlob.findUnique({ where: { receiptId: file.id } });
    if (!blob) throw Object.assign(new Error('Receipt image not found'), { code: 'ENOENT' });
    return Buffer.from(blob.data);
  }
  async delete(file: ReceiptFile) {
    await this.db.supplierReceiptBlob.deleteMany({ where: { receiptId: file.id } });
  }
}

export function receiptStorage(): ReceiptStorage {
  return process.env.HOSTED_MODE === 'true' || process.env.RECEIPT_STORAGE === 'db'
    ? new DbReceiptStorage()
    : new DiskReceiptStorage();
}
