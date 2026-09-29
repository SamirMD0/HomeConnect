import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { requireServiceAdmin } from '../service/authorization/service-policy';
import { CategoriesController } from './categories.controller';
import {
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from './categories.validator';

export const categoriesRoutes = Router();
categoriesRoutes.get('/', CategoriesController.list);
categoriesRoutes.get(
  '/:categoryId',
  validate(categoryParamsSchema, 'params'),
  CategoriesController.get
);
categoriesRoutes.post(
  '/',
  requireServiceAdmin,
  validate(createCategorySchema),
  CategoriesController.create
);
categoriesRoutes.patch(
  '/:categoryId',
  requireServiceAdmin,
  validate(categoryParamsSchema, 'params'),
  validate(updateCategorySchema),
  CategoriesController.update
);
categoriesRoutes.delete(
  '/:categoryId',
  requireServiceAdmin,
  validate(categoryParamsSchema, 'params'),
  CategoriesController.remove
);
