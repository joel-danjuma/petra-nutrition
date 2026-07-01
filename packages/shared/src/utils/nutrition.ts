import { Nutrition } from '../types';

export const calculateTotalNutrition = (nutritionData: Nutrition[]): Nutrition => {
  return nutritionData.reduce(
    (total, current) => ({
      calories: total.calories + current.calories,
      protein: total.protein + current.protein,
      carbs: total.carbs + current.carbs,
      fat: total.fat + current.fat,
      fiber: (total.fiber || 0) + (current.fiber || 0),
      sugar: (total.sugar || 0) + (current.sugar || 0),
      sodium: (total.sodium || 0) + (current.sodium || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
  );
};

export const scaleNutrition = (nutrition: Nutrition, scale: number): Nutrition => {
  return {
    calories: Math.round(nutrition.calories * scale),
    protein: Math.round(nutrition.protein * scale * 10) / 10,
    carbs: Math.round(nutrition.carbs * scale * 10) / 10,
    fat: Math.round(nutrition.fat * scale * 10) / 10,
    fiber: nutrition.fiber ? Math.round(nutrition.fiber * scale * 10) / 10 : undefined,
    sugar: nutrition.sugar ? Math.round(nutrition.sugar * scale * 10) / 10 : undefined,
    sodium: nutrition.sodium ? Math.round(nutrition.sodium * scale) : undefined,
  };
};

export const calculateMacroPercentages = (nutrition: Nutrition) => {
  const { calories, protein, carbs, fat } = nutrition;
  
  const proteinCalories = protein * 4;
  const carbCalories = carbs * 4;
  const fatCalories = fat * 9;
  
  if (calories === 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }
  
  return {
    protein: Math.round((proteinCalories / calories) * 100),
    carbs: Math.round((carbCalories / calories) * 100),
    fat: Math.round((fatCalories / calories) * 100),
  };
};

export const estimateCalorieNeeds = (
  age: number,
  weight: number, // in kg
  height: number, // in cm
  gender: 'male' | 'female',
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active'
): number => {
  // Mifflin-St Jeor Equation for BMR
  let bmr: number;
  
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }
  
  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9,
  };
  
  return Math.round(bmr * activityMultipliers[activityLevel]);
};

export const calculateMacroTargets = (
  totalCalories: number,
  proteinPercentage: number = 25,
  fatPercentage: number = 30
) => {
  const carbPercentage = 100 - proteinPercentage - fatPercentage;
  
  return {
    protein: Math.round((totalCalories * proteinPercentage / 100) / 4),
    carbs: Math.round((totalCalories * carbPercentage / 100) / 4),
    fat: Math.round((totalCalories * fatPercentage / 100) / 9),
  };
};

export const getNutritionGrade = (nutrition: Nutrition, targets?: Nutrition): 'A' | 'B' | 'C' | 'D' | 'F' => {
  if (!targets) {
    // Basic grading based on general health guidelines
    const { calories, protein, fiber, sodium } = nutrition;
    
    let score = 0;
    
    // Protein adequacy (assuming 2000 cal diet)
    if (protein >= 50) score += 2;
    else if (protein >= 30) score += 1;
    
    // Fiber content
    if (fiber && fiber >= 25) score += 2;
    else if (fiber && fiber >= 15) score += 1;
    
    // Sodium content (lower is better)
    if (sodium && sodium <= 1500) score += 2;
    else if (sodium && sodium <= 2300) score += 1;
    
    // Calorie reasonableness
    if (calories >= 1200 && calories <= 2500) score += 2;
    else if (calories >= 800 && calories <= 3000) score += 1;
    
    if (score >= 7) return 'A';
    if (score >= 5) return 'B';
    if (score >= 3) return 'C';
    if (score >= 1) return 'D';
    return 'F';
  }
  
  // Grading based on targets
  const accuracyScore = (
    (1 - Math.abs(nutrition.calories - targets.calories) / targets.calories) +
    (1 - Math.abs(nutrition.protein - targets.protein) / targets.protein) +
    (1 - Math.abs(nutrition.carbs - targets.carbs) / targets.carbs) +
    (1 - Math.abs(nutrition.fat - targets.fat) / targets.fat)
  ) / 4;
  
  if (accuracyScore >= 0.9) return 'A';
  if (accuracyScore >= 0.8) return 'B';
  if (accuracyScore >= 0.7) return 'C';
  if (accuracyScore >= 0.6) return 'D';
  return 'F';
};

export const formatNutritionValue = (value: number | undefined, unit: string): string => {
  if (value === undefined) return '-';
  
  if (unit === 'g') {
    return `${value.toFixed(1)}g`;
  } else if (unit === 'mg') {
    return `${Math.round(value)}mg`;
  } else if (unit === 'kcal') {
    return `${Math.round(value)} kcal`;
  }
  
  return `${value} ${unit}`;
};
