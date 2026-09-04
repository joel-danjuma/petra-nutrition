import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const analyticsController = new AnalyticsController();

// Get user statistics
router.get('/user-stats',
  asyncHandler(analyticsController.getUserStats.bind(analyticsController))
);

// Get feature usage
router.get('/feature-usage',
  asyncHandler(analyticsController.getFeatureUsage.bind(analyticsController))
);

// Get chat analytics
router.get('/chat',
  asyncHandler(analyticsController.getChatAnalytics.bind(analyticsController))
);

// Get pantry analytics
router.get('/pantry',
  asyncHandler(analyticsController.getPantryAnalytics.bind(analyticsController))
);

// Log a pantry item being used or wasted
router.post('/waste-log',
  validate([
    validators.wasteItemName,
    validators.wasteCategory,
    validators.wasteAction,
    validators.wasteQuantity,
  ]),
  asyncHandler(analyticsController.logWaste.bind(analyticsController))
);

// Get waste-avoided summary
router.get('/waste-summary',
  asyncHandler(analyticsController.getWasteSummary.bind(analyticsController))
);

// Log a completed cook-mode meal
router.post('/meal-completion',
  validate([
    validators.mealCalories,
    validators.mealProtein,
  ]),
  asyncHandler(analyticsController.logMealCompletion.bind(analyticsController))
);

// Get today's logged nutrition vs targets
router.get('/today-nutrition',
  asyncHandler(analyticsController.getTodayNutrition.bind(analyticsController))
);

export default router;
