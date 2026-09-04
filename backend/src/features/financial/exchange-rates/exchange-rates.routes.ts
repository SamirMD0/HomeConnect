import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { ExchangeRatesController } from './exchange-rates.controller';
import { createExchangeRateSchema } from './exchange-rates.validator';

export const exchangeRatesRoutes = Router();

exchangeRatesRoutes.use(requireRole([Role.ADMIN]));
exchangeRatesRoutes.get('/', ExchangeRatesController.list);
exchangeRatesRoutes.post('/', validate(createExchangeRateSchema), ExchangeRatesController.create);
