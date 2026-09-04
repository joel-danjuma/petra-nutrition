import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { CustomError } from './error';

// Validation result handler
export const validationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : error.type,
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: formattedErrors,
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  next();
};

/**
 * Case-insensitive membership check.
 *
 * `express-validator`'s `isIn` is case-sensitive, which is what made
 * `POST /pantry` reject every request the mobile app sent: the validator
 * listed 'PRODUCE' and the client sent 'produce'. Services normalise to the
 * canonical form before Prisma, so validation only needs to agree on the
 * vocabulary, not the casing.
 */
const isInAnyCase = (allowed: readonly string[], label: string) => (value: unknown) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || !allowed.includes(value.toUpperCase())) {
    throw new Error(label);
  }
  return true;
};

const ITEM_CATEGORIES = [
  'PRODUCE', 'DAIRY', 'MEAT', 'SEAFOOD', 'GRAINS', 'PANTRY_STAPLES', 'SPICES',
  'CONDIMENTS', 'BEVERAGES', 'FROZEN', 'CANNED', 'SNACKS', 'OTHER',
] as const;

// Common validation rules
export const validators = {
  // User validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),

  // Login only needs a password to be present — complexity rules are for
  // choosing a new password (register/reset), not for checking an existing
  // one, which may predate the current complexity policy.
  loginPassword: body('password')
    .notEmpty()
    .withMessage('Password is required'),

  firstName: body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),

  lastName: body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),

  // ID validation
  uuid: (field: string) => param(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`),

  // Recipe validation
  recipeTitle: body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Recipe title is required and must be less than 200 characters'),

  servings: body('servings')
    .isInt({ min: 1, max: 50 })
    .withMessage('Servings must be a number between 1 and 50'),

  prepTime: body('prepTime')
    .isInt({ min: 0, max: 1440 })
    .withMessage('Prep time must be between 0 and 1440 minutes'),

  cookTime: body('cookTime')
    .isInt({ min: 0, max: 1440 })
    .withMessage('Cook time must be between 0 and 1440 minutes'),

  difficulty: body('difficulty')
    .exists({ checkFalsy: true })
    .withMessage('Difficulty is required')
    .custom(isInAnyCase(['EASY', 'MEDIUM', 'HARD'], 'Difficulty must be easy, medium, or hard')),

  // Pantry validation
  itemName: body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Item name is required and must be less than 100 characters'),

  quantity: body('quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a positive number'),

  category: body('category')
    .exists({ checkFalsy: true })
    .withMessage('Category is required')
    .custom(isInAnyCase(ITEM_CATEGORIES, 'Invalid category')),

  location: body('location')
    .optional()
    .custom(isInAnyCase(['PANTRY', 'FRIDGE', 'FREEZER'], 'Location must be pantry, fridge, or freezer')),

  // Waste/deletion reason
  deleteReason: query('reason')
    .optional()
    .custom(isInAnyCase(['USED', 'WASTED'], 'reason must be "used" or "wasted"')),

  // Onboarding validation
  householdSize: body('householdSize')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Household size must be between 1 and 20'),

  cookingSkill: body('cookingSkill')
    .optional()
    .custom(isInAnyCase(['BEGINNER', 'CONFIDENT', 'EXPERIENCED'], 'cookingSkill must be beginner, confident, or experienced')),

  stringArray: (field: string) => body(field)
    .optional()
    .isArray()
    .withMessage(`${field} must be an array of strings`),

  // Waste-log validation
  wasteAction: body('action')
    .exists({ checkFalsy: true })
    .withMessage('action is required')
    .custom(isInAnyCase(['USED', 'WASTED'], 'action must be "used" or "wasted"')),

  wasteItemName: body('itemName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('itemName is required'),

  wasteCategory: body('category')
    .exists({ checkFalsy: true })
    .withMessage('Category is required')
    .custom(isInAnyCase(ITEM_CATEGORIES, 'Invalid category')),

  wasteQuantity: body('quantity')
    .isFloat({ min: 0 })
    .withMessage('quantity must be a non-negative number'),

  // Meal-completion validation
  mealCalories: body('calories')
    .isFloat({ min: 0, max: 10000 })
    .withMessage('calories must be between 0 and 10000'),

  mealType: body('mealType')
    .optional()
    .custom(isInAnyCase(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], 'Invalid mealType')),

  mealProtein: body('protein')
    .isFloat({ min: 0, max: 1000 })
    .withMessage('protein must be between 0 and 1000 grams'),

  // Date validation
  futureDate: (field: string) => body(field)
    .optional()
    .isISO8601()
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date <= now) {
        throw new Error(`${field} must be a future date`);
      }
      return true;
    }),

  pastDate: (field: string) => body(field)
    .optional()
    .isISO8601()
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date > now) {
        throw new Error(`${field} cannot be in the future`);
      }
      return true;
    }),

  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  // Search validation
  searchQuery: query('query')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters'),

  // File validation
  fileUpload: (fieldName: string, maxSize: number = 10 * 1024 * 1024) => 
    body(fieldName)
      .custom((value, { req }) => {
        const file = req.file || req.files?.[fieldName];
        if (!file) {
          throw new Error(`${fieldName} is required`);
        }
        
        if (file.size > maxSize) {
          throw new Error(`${fieldName} size must be less than ${maxSize / (1024 * 1024)}MB`);
        }
        
        return true;
      }),

  // Nutrition validation
  calories: body('calories')
    .optional()
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Calories must be between 0 and 10000'),

  macroNutrient: (field: string) => body(field)
    .optional()
    .isFloat({ min: 0, max: 1000 })
    .withMessage(`${field} must be between 0 and 1000 grams`),

  // Chat validation
  /**
   * Accepts either a plain string or the block array form. The block array is
   * the richer shape (it leaves room for images), but requiring it meant a
   * client sending an ordinary string got a validation error for what is a
   * perfectly well-formed message — which is exactly what the mobile app was
   * hitting. The controller normalises whichever arrives.
   */
  chatMessage: body('content')
    .custom((value, { req }) => {
      // Either field carries the message; the controller normalises.
      const content = value ?? req.body?.message;
      if (typeof content === 'string') {
        if (!content.trim()) throw new Error('Message cannot be empty');
        return true;
      }
      if (!Array.isArray(content) || content.length === 0) {
        throw new Error('Message must be a non-empty string or content array');
      }
      for (const item of content) {
        if (!item?.type || !['text', 'image'].includes(item.type)) {
          throw new Error('Each content item must have a valid type');
        }
        if (item.type === 'text' && (!item.text || String(item.text).trim().length === 0)) {
          throw new Error('Text content cannot be empty');
        }
      }
      return true;
    }),
};

// Validation chain builder
export const validate = (validations: ValidationChain[]) => {
  return [...validations, validationMiddleware];
};

// Sanitization helpers
export const sanitizers = {
  trim: (field: string) => body(field).trim(),
  escape: (field: string) => body(field).escape(),
  normalizeEmail: (field: string) => body(field).normalizeEmail(),
  toInt: (field: string) => body(field).toInt(),
  toFloat: (field: string) => body(field).toFloat(),
  toBoolean: (field: string) => body(field).toBoolean(),
};

// Custom validators
export const customValidators = {
  isStrongPassword: (value: string) => {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(value);
  },

  isValidBarcode: (value: string) => {
    const cleanBarcode = value.replace(/\D/g, '');
    return [8, 12, 13, 14].includes(cleanBarcode.length);
  },

  isValidImageFormat: (mimetype: string) => {
    const allowedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    return allowedFormats.includes(mimetype);
  },

  isValidNutritionValue: (value: number, type: 'calories' | 'macro' | 'micro') => {
    if (value < 0) return false;
    
    switch (type) {
      case 'calories':
        return value <= 10000;
      case 'macro':
        return value <= 1000;
      case 'micro':
        return value <= 100000;
      default:
        return true;
    }
  },
};
