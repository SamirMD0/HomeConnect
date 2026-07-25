import { NextFunction, Request, Response } from 'express';
import { BackupService } from './backup.service';
import {
  BackupIdParamsInput,
  BackupListQueryInput,
  CreateBackupInput,
  RestoreBackupInput,
  UpdateBackupSettingsInput,
} from './backup.validator';

export class BackupController {
  static async getStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const status = await BackupService.getStatus();
      res.status(200).json({ success: true, data: status, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await BackupService.getSettings();
      res.status(200).json({ success: true, data: settings, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await BackupService.updateSettings(req.body as UpdateBackupSettingsInput);
      res.status(200).json({ success: true, data: settings, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async listBackups(req: Request, res: Response, next: NextFunction) {
    try {
      const backups = await BackupService.listBackups(req.query as unknown as BackupListQueryInput);
      res.status(200).json({ success: true, data: backups, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async createBackup(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as CreateBackupInput;
      const backup = await BackupService.createManualBackup(req.user?.userId ?? null);
      res.status(body.type === 'MANUAL' ? 201 : 200).json({
        success: true,
        data: backup,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async validateRestore(req: Request, res: Response, next: NextFunction) {
    try {
      const params = req.params as BackupIdParamsInput;
      const result = await BackupService.validateRestore(params.backupId);
      res.status(200).json({ success: true, data: result, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async restoreBackup(req: Request, res: Response, next: NextFunction) {
    try {
      const params = req.params as BackupIdParamsInput;
      const body = req.body as RestoreBackupInput;
      const result = await BackupService.restoreBackup(
        params.backupId,
        body.confirmation,
        req.user?.userId ?? null
      );
      res.status(200).json({ success: true, data: result, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }
}
