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
    .isIn(['EASY', 'MEDIUM', 'HARD'])
    .withMessage('Difficulty must be EASY, MEDIUM, or HARD'),

  // Pantry validation
  itemName: body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Item name is required and must be less than 100 characters'),

  quantity: body('quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a positive number'),

  category: body('category')
    .isIn([
      'PRODUCE', 'DAIRY', 'MEAT', 'SEAFOOD', 'GRAINS', 'PANTRY_STAPLES',
      'SPICES', 'CONDIMENTS', 'BEVERAGES', 'FROZEN', 'CANNED', 'SNACKS', 'OTHER'
    ])
    .withMessage('Invalid category'),

  location: body('location')
    .optional()
    .isIn(['PANTRY', 'FRIDGE', 'FREEZER'])
    .withMessage('Location must be PANTRY, FRIDGE, or FREEZER'),

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
  chatMessage: body('content')
    .isArray({ min: 1 })
    .withMessage('Content must be a non-empty array')
    .custom((content) => {
      for (const item of content) {
        if (!item.type || !['text', 'image'].includes(item.type)) {
          throw new Error('Each content item must have a valid type');
        }
        if (item.type === 'text' && (!item.text || item.text.trim().length === 0)) {
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
