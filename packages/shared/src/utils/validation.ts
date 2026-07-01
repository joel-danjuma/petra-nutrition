import { z } from 'zod';

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailSchema = z.string().email();
  return emailSchema.safeParse(email).success;
};

// Password strength validation
export const validatePassword = (password: string): { 
  isValid: boolean; 
  errors: string[]; 
  strength: 'weak' | 'medium' | 'strong' 
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Calculate strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  const criteria = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    password.length >= 12,
  ];
  
  const metCriteria = criteria.filter(Boolean).length;
  
  if (metCriteria >= 5) strength = 'strong';
  else if (metCriteria >= 3) strength = 'medium';
  
  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
};

// File validation
export const validateImageFile = (file: File): { isValid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  
  if (file.size > maxSize) {
    return { isValid: false, error: 'File size must be less than 10MB' };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'File must be a JPEG, PNG, WebP, or HEIC image' };
  }
  
  return { isValid: true };
};

// Barcode validation
export const isValidBarcode = (barcode: string): boolean => {
  // Remove any non-digit characters
  const cleanBarcode = barcode.replace(/\D/g, '');
  
  // Check common barcode lengths (UPC, EAN, etc.)
  const validLengths = [8, 12, 13, 14];
  
  if (!validLengths.includes(cleanBarcode.length)) {
    return false;
  }
  
  // Basic checksum validation for EAN-13
  if (cleanBarcode.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(cleanBarcode[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(cleanBarcode[12]);
  }
  
  return true; // For other formats, just check length
};

// Nutritional value validation
export const validateNutritionalValue = (value: number, type: 'calories' | 'macro' | 'micro'): boolean => {
  if (value < 0) return false;
  
  switch (type) {
    case 'calories':
      return value <= 10000; // Max reasonable calories per serving
    case 'macro':
      return value <= 1000; // Max reasonable grams of macro per serving
    case 'micro':
      return value <= 100000; // Max reasonable mg of micronutrient
    default:
      return true;
  }
};

// Date validation
export const isValidFutureDate = (date: string | Date): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  
  return dateObj > now && dateObj.getFullYear() <= now.getFullYear() + 10;
};

export const isValidPastDate = (date: string | Date): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const minDate = new Date(1900, 0, 1);
  
  return dateObj <= now && dateObj >= minDate;
};

// Quantity validation
export const validateQuantity = (quantity: number, unit: string): { isValid: boolean; error?: string } => {
  if (quantity <= 0) {
    return { isValid: false, error: 'Quantity must be greater than 0' };
  }
  
  if (quantity > 10000) {
    return { isValid: false, error: 'Quantity seems unusually large' };
  }
  
  // Unit-specific validation
  const unitValidation: Record<string, { max: number; message: string }> = {
    'kg': { max: 100, message: 'Weight seems too large' },
    'lbs': { max: 200, message: 'Weight seems too large' },
    'liters': { max: 50, message: 'Volume seems too large' },
    'gallons': { max: 15, message: 'Volume seems too large' },
  };
  
  const validation = unitValidation[unit.toLowerCase()];
  if (validation && quantity > validation.max) {
    return { isValid: false, error: validation.message };
  }
  
  return { isValid: true };
};

// Recipe validation
export const validateRecipeIngredients = (ingredients: any[]): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (ingredients.length === 0) {
    errors.push('Recipe must have at least one ingredient');
  }
  
  if (ingredients.length > 50) {
    errors.push('Recipe cannot have more than 50 ingredients');
  }
  
  ingredients.forEach((ingredient, index) => {
    if (!ingredient.name || ingredient.name.trim().length === 0) {
      errors.push(`Ingredient ${index + 1} must have a name`);
    }
    
    if (!ingredient.amount || ingredient.amount <= 0) {
      errors.push(`Ingredient ${index + 1} must have a valid amount`);
    }
    
    if (!ingredient.unit || ingredient.unit.trim().length === 0) {
      errors.push(`Ingredient ${index + 1} must have a unit`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateRecipeInstructions = (instructions: any[]): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (instructions.length === 0) {
    errors.push('Recipe must have at least one instruction');
  }
  
  if (instructions.length > 30) {
    errors.push('Recipe cannot have more than 30 instructions');
  }
  
  instructions.forEach((instruction, index) => {
    if (!instruction.instruction || instruction.instruction.trim().length === 0) {
      errors.push(`Instruction ${index + 1} cannot be empty`);
    }
    
    if (instruction.instruction && instruction.instruction.length > 1000) {
      errors.push(`Instruction ${index + 1} is too long (max 1000 characters)`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};
