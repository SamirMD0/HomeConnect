import { z } from 'zod';

export const createBackupSchema = z
  .object({
    type: z.enum(['MANUAL']).optional().default('MANUAL'),
  })
  .strict();

export const backupListQuerySchema = z.object({
  type: z.enum(['MANUAL', 'AUTO', 'PRE_RESTORE', 'PRE_REPAIR']).optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'FAILED', 'DELETED', 'RESTORED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  sortOrder: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

export const updateBackupSettingsSchema = z
  .object({
    backupDirectory: z.string().trim().min(1).optional(),
    automaticBackupsEnabled: z.boolean().optional(),
    automaticBackupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    automaticRetentionCount: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]).optional(),
    pgDumpPath: z.string().trim().min(1).nullable().optional(),
    pgRestorePath: z.string().trim().min(1).nullable().optional(),
    psqlPath: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const backupIdParamsSchema = z.object({
  backupId: z.string().uuid('Invalid backup ID'),
});

export const importBackupSchema = z
  .object({
    backupPath: z.string().trim().min(1),
  })
  .strict();

export const restoreBackupSchema = z
  .object({
    confirmation: z.literal('RESTORE'),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export type CreateBackupInput = z.infer<typeof createBackupSchema>;
export type BackupListQueryInput = z.infer<typeof backupListQuerySchema>;
export type UpdateBackupSettingsInput = z.infer<typeof updateBackupSettingsSchema>;
export type BackupIdParamsInput = z.infer<typeof backupIdParamsSchema>;
export type ImportBackupInput = z.infer<typeof importBackupSchema>;
export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;
