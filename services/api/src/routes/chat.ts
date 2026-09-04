import { Router } from 'express';
import { ChatController } from '../controllers/chat';
import { userRateLimit } from '../middleware/auth';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const chatController = new ChatController();

// Get user's chat sessions
router.get('/sessions',
  validate([
    validators.page,
    validators.limit,
    validators.searchQuery,
  ]),
  asyncHandler(chatController.getSessions.bind(chatController))
);

// Get specific chat session
router.get('/sessions/:id',
  validate([validators.uuid('id')]),
  asyncHandler(chatController.getSession.bind(chatController))
);

// Create new chat session
router.post('/sessions',
  asyncHandler(chatController.createSession.bind(chatController))
);

// Update chat session (e.g., title)
router.patch('/sessions/:id',
  validate([validators.uuid('id')]),
  asyncHandler(chatController.updateSession.bind(chatController))
);

// Delete chat session
router.delete('/sessions/:id',
  validate([validators.uuid('id')]),
  asyncHandler(chatController.deleteSession.bind(chatController))
);

// Clear session messages
router.delete('/sessions/:id/messages',
  validate([validators.uuid('id')]),
  asyncHandler(chatController.clearMessages.bind(chatController))
);

// Send message to AI
router.post('/message',
  userRateLimit(30, 60000), // 30 messages per minute
  validate([validators.chatMessage]),
  asyncHandler(chatController.sendMessage.bind(chatController))
);

// Stream message to AI (Server-Sent Events)
router.post('/stream',
  userRateLimit(20, 60000), // 20 streaming requests per minute
  validate([validators.chatMessage]),
  asyncHandler(chatController.streamMessage.bind(chatController))
);

// Generate recipe via chat
router.post('/generate-recipe',
  userRateLimit(10, 60000), // 10 recipe generations per minute
  asyncHandler(chatController.generateRecipe.bind(chatController))
);

// Generate meal plan via chat
router.post('/generate-meal-plan',
  userRateLimit(5, 60000), // 5 meal plan generations per minute
  asyncHandler(chatController.generateMealPlan.bind(chatController))
);

// Get cooking tips
router.post('/cooking-tips',
  userRateLimit(20, 60000),
  asyncHandler(chatController.getCookingTips.bind(chatController))
);

// Analyze nutrition
router.post('/analyze-nutrition',
  userRateLimit(15, 60000),
  asyncHandler(chatController.analyzeNutrition.bind(chatController))
);

export default router;
