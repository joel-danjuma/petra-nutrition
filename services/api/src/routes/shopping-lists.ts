import { Router } from 'express';
import { ShoppingListController } from '../controllers/shopping-list';
import { requirePremium } from '../middleware/auth';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const shoppingListController = new ShoppingListController();

// Shopping lists are a premium feature
router.use(requirePremium);

// Get user's shopping lists
router.get('/',
  validate([
    validators.page,
    validators.limit,
    validators.searchQuery,
  ]),
  asyncHandler(shoppingListController.getShoppingLists.bind(shoppingListController))
);

// Get shopping list by ID
router.get('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.getById.bind(shoppingListController))
);

// Create new shopping list
router.post('/',
  asyncHandler(shoppingListController.create.bind(shoppingListController))
);

// Update shopping list
router.patch('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.update.bind(shoppingListController))
);

// Delete shopping list
router.delete('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.delete.bind(shoppingListController))
);

// Generate shopping list from meal plan
router.post('/generate',
  asyncHandler(shoppingListController.generateFromMealPlan.bind(shoppingListController))
);

// Update shopping list items (bulk update)
router.patch('/:id/items',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.updateItems.bind(shoppingListController))
);

// Mark shopping list as complete
router.post('/:id/complete',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.markComplete.bind(shoppingListController))
);

// Share shopping list
router.post('/:id/share',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.share.bind(shoppingListController))
);

// Export shopping list
router.get('/:id/export',
  validate([validators.uuid('id')]),
  asyncHandler(shoppingListController.export.bind(shoppingListController))
);

export default router;
