import { Request, Response, NextFunction } from 'express';
import { diagnosticsService } from './diagnostics.service';

export const getHealth = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await diagnosticsService.getHealth();
    res.status(200).json({ success: true, data: health });
  } catch (error) {
    next(error);
  }
};

export const getErrors = (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const errors = diagnosticsService.getErrors(limit);
    res.status(200).json({ success: true, data: errors });
  } catch (error) {
    next(error);
  }
};

export const clearErrors = (_req: Request, res: Response, next: NextFunction) => {
  try {
    diagnosticsService.clearErrors();
    res.status(200).json({ success: true, message: 'Diagnostic logs cleared' });
  } catch (error) {
    next(error);
  }
};

export const reportFrontendError = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { route, message, stack, timestamp, errorCode } = req.body;
    diagnosticsService.logFrontendError({ route, message, stack, timestamp, errorCode });
    res.status(200).json({ success: true, message: 'Error logged' });
  } catch (error) {
    next(error);
  }
};
