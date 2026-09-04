import { Router } from 'express';
import { MealPlanController } from '../controllers/meal-plan';
import { requirePremium } from '../middleware/auth';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const mealPlanController = new MealPlanController();

// Get user's meal plans
router.get('/',
  validate([
    validators.page,
    validators.limit,
    validators.searchQuery,
  ]),
  asyncHandler(mealPlanController.getMealPlans.bind(mealPlanController))
);

// Get meal plan by ID
router.get('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(mealPlanController.getById.bind(mealPlanController))
);

// Create new meal plan
router.post('/',
  asyncHandler(mealPlanController.create.bind(mealPlanController))
);

// Update meal plan
router.patch('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(mealPlanController.update.bind(mealPlanController))
);

// Delete meal plan
router.delete('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(mealPlanController.delete.bind(mealPlanController))
);

// Generate meal plan with AI (premium feature for multi-day plans)
router.post('/generate',
  asyncHandler(mealPlanController.generateMealPlan.bind(mealPlanController))
);

// Quick meal suggestion
router.post('/quick-suggestion',
  asyncHandler(mealPlanController.quickSuggestion.bind(mealPlanController))
);

// Duplicate meal plan
router.post('/:id/duplicate',
  validate([validators.uuid('id')]),
  asyncHandler(mealPlanController.duplicate.bind(mealPlanController))
);

// Save meal plan as template (premium feature)
router.post('/:id/template',
  requirePremium,
  validate([validators.uuid('id')]),
  asyncHandler(mealPlanController.saveAsTemplate.bind(mealPlanController))
);

// Get nutrition summary for meal plan
router.get('/:id/nutrition',
  validate([validators.uuid('id')]),
  asyncHandler(mealPlanController.getNutritionSummary.bind(mealPlanController))
);

export default router;
