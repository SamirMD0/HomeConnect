import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { PricingCalculatorController } from './pricing-calculator.controller';
import { pricingCalculateSchema } from './pricing-calculator.validator';

export const pricingCalculatorRoutes = Router();
pricingCalculatorRoutes.post('/calculate', validate(pricingCalculateSchema), PricingCalculatorController.calculate);
