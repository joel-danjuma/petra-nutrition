import { Application } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import recipeRoutes from './recipes';
import pantryRoutes from './pantry';
import mealPlanRoutes from './meal-plans';
import shoppingListRoutes from './shopping-lists';
import chatRoutes from './chat';
import subscriptionRoutes from './subscription';
import analyticsRoutes from './analytics';
import { logger } from '../utils/logger';

export const setupRoutes = (app: Application): void => {
  // API version prefix
  const API_PREFIX = '/api';

  // Mount routes
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/users`, userRoutes);
  app.use(`${API_PREFIX}/recipes`, recipeRoutes);
  app.use(`${API_PREFIX}/pantry`, pantryRoutes);
  app.use(`${API_PREFIX}/meal-plans`, mealPlanRoutes);
  app.use(`${API_PREFIX}/shopping-lists`, shoppingListRoutes);
  app.use(`${API_PREFIX}/chat`, chatRoutes);
  app.use(`${API_PREFIX}/subscription`, subscriptionRoutes);
  app.use(`${API_PREFIX}/analytics`, analyticsRoutes);

  logger.info('Routes configured successfully');
};
