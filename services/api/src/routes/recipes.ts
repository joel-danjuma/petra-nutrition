import { Router } from 'express';
import { RecipeController } from '../controllers/recipe';
import { optionalAuth } from '../middleware/auth';
import { validate, validators } from '../middleware/validation';
import { asyncHandler } from '../middleware/error';

const router = Router();
const recipeController = new RecipeController();

// Public recipe search (no auth required)
router.get('/search',
  optionalAuth, // Optional auth to personalize results
  validate([
    validators.searchQuery,
    validators.page,
    validators.limit,
  ]),
  asyncHandler(recipeController.searchRecipes.bind(recipeController))
);

// Get public recipe by ID
router.get('/:id',
  optionalAuth,
  validate([validators.uuid('id')]),
  asyncHandler(recipeController.getById.bind(recipeController))
);

// All routes below require authentication
router.use((req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      },
    });
  }
  next();
});

// Create new recipe
router.post('/',
  validate([
    validators.recipeTitle,
    validators.servings,
    validators.prepTime,
    validators.cookTime,
    validators.difficulty,
  ]),
  asyncHandler(recipeController.create.bind(recipeController))
);

/**
 * Save a recipe the assistant composed.
 *
 * Separate from `POST /` because the payload is a different shape — it is the
 * `generatedRecipe` block from a chat response, echoed back — and because it is
 * validated against the shared contract schema rather than the field-by-field
 * validators a hand-written recipe goes through. Routing both through one
 * endpoint would mean one of the two shapes being loosely checked.
 */
router.post('/generated',
  asyncHandler(recipeController.saveGenerated.bind(recipeController))
);

// Update recipe
router.patch('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(recipeController.update.bind(recipeController))
);

// Delete recipe
router.delete('/:id',
  validate([validators.uuid('id')]),
  asyncHandler(recipeController.delete.bind(recipeController))
);

// Generate recipe with AI
router.post('/generate',
  asyncHandler(recipeController.generateRecipe.bind(recipeController))
);

// Add to favorites
router.post('/:id/favorite',
  validate([validators.uuid('id')]),
  asyncHandler(recipeController.addToFavorites.bind(recipeController))
);

// Remove from favorites
router.delete('/:id/favorite',
  validate([validators.uuid('id')]),
  asyncHandler(recipeController.removeFromFavorites.bind(recipeController))
);

// Get user's favorite recipes
router.get('/favorites',
  validate([
    validators.page,
    validators.limit,
  ]),
  asyncHandler(recipeController.getFavorites.bind(recipeController))
);

// Rate recipe
router.post('/:id/rate',
  validate([validators.uuid('id')]),
  asyncHandler(recipeController.rateRecipe.bind(recipeController))
);

// Get user's created recipes
router.get('/my-recipes',
  validate([
    validators.page,
    validators.limit,
  ]),
  asyncHandler(recipeController.getMyRecipes.bind(recipeController))
);

export default router;
