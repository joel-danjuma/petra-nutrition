import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics';
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

export default router;
