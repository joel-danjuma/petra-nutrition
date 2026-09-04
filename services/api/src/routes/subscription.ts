import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const subscriptionController = new SubscriptionController();

// Get subscription status
router.get('/status',
  asyncHandler(subscriptionController.getStatus.bind(subscriptionController))
);

// Upgrade subscription
router.post('/upgrade',
  asyncHandler(subscriptionController.upgrade.bind(subscriptionController))
);

// Cancel subscription
router.post('/cancel',
  asyncHandler(subscriptionController.cancel.bind(subscriptionController))
);

// Get usage statistics
router.get('/usage',
  asyncHandler(subscriptionController.getUsage.bind(subscriptionController))
);

// Stripe webhook endpoint (no auth required)
router.post('/webhook',
  asyncHandler(subscriptionController.handleWebhook.bind(subscriptionController))
);

export default router;
