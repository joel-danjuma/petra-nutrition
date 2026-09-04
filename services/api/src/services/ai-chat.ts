import Groq from 'groq-sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  userPreferences?: any;
  currentPantryItems?: string[];
  activeMealPlan?: string;
  lastRecipeSearch?: string;
  dietaryRestrictions?: string[];
  healthGoals?: string[];
}

export interface ChatResponse {
  content: string;
  type: 'text' | 'recipe_suggestion' | 'meal_plan_suggestion' | 'pantry_update' | 'shopping_list_generation';
  structuredData?: any;
  suggestions?: string[];
  confidence?: number;
}

export class AIChatService {
  private groq: Groq;
  private model8B = 'llama3-8b-8192';
  private model70B = 'llama3-70b-8192';

  constructor() {
    if (!config.GROQ_API_KEY) {
      throw new Error('GroqAPI key not configured');
    }

    this.groq = new Groq({
      apiKey: config.GROQ_API_KEY,
    });
  }

  async sendMessage(
    messages: ChatMessage[],
    context?: ChatContext,
    useAdvancedModel: boolean = false
  ): Promise<ChatResponse> {
    try {
      const systemMessage = this.buildSystemMessage(context);
      const fullMessages = [systemMessage, ...messages];

      const model = useAdvancedModel ? this.model70B : this.model8B;

      const response = await this.groq.chat.completions.create({
        messages: fullMessages as any,
        model,
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 0.9,
        stream: false,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Parse response to determine type and extract structured data
      const chatResponse = this.parseResponse(content);

      logger.info('AI chat response generated', {
        model,
        messageCount: messages.length,
        responseType: chatResponse.type,
        tokensUsed: response.usage?.total_tokens,
      });

      return chatResponse;
    } catch (error) {
      logger.error('AI chat service error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          throw new Error('AI service is temporarily busy. Please try again in a moment.');
        } else if (error.message.includes('quota')) {
          throw new Error('AI service quota exceeded. Please try again later.');
        }
      }
      
      throw new Error('AI service is currently unavailable');
    }
  }

  async streamMessage(
    messages: ChatMessage[],
    context?: ChatContext,
    onChunk?: (chunk: string) => void,
    useAdvancedModel: boolean = false
  ): Promise<string> {
    try {
      const systemMessage = this.buildSystemMessage(context);
      const fullMessages = [systemMessage, ...messages];

      const model = useAdvancedModel ? this.model70B : this.model8B;

      const stream = await this.groq.chat.completions.create({
        messages: fullMessages as any,
        model,
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 0.9,
        stream: true,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk?.(content);
        }
      }

      logger.info('AI chat stream completed', {
        model,
        messageCount: messages.length,
        contentLength: fullContent.length,
      });

      return fullContent;
    } catch (error) {
      logger.error('AI chat stream error:', error);
      throw new Error('AI streaming service is currently unavailable');
    }
  }

  private buildSystemMessage(context?: ChatContext): ChatMessage {
    let systemPrompt = `You are Petra, an intelligent AI kitchen assistant. You help users with:

1. Recipe discovery and generation based on ingredients, preferences, and dietary restrictions
2. Meal planning for individuals and families
3. Pantry management and inventory tracking
4. Smart shopping list creation
5. Nutritional guidance and cooking tips
6. Food storage and safety advice

Guidelines:
- Be friendly, helpful, and encouraging
- Always consider dietary restrictions and allergies
- Provide practical, actionable advice
- When suggesting recipes, include prep time, cook time, and difficulty level
- For meal planning, consider nutritional balance and variety
- Be mindful of food waste and suggest ways to use existing pantry items
- If asked about medical advice, recommend consulting healthcare professionals

Response Format:
- For recipe suggestions, structure your response with clear ingredients and instructions
- For meal plans, organize by days and meals
- For pantry advice, be specific about storage methods and timeframes
- Always provide follow-up suggestions when appropriate`;

    if (context) {
      if (context.currentPantryItems && context.currentPantryItems.length > 0) {
        systemPrompt += `\n\nUser's Current Pantry Items: ${context.currentPantryItems.join(', ')}`;
      }

      if (context.dietaryRestrictions && context.dietaryRestrictions.length > 0) {
        systemPrompt += `\n\nDietary Restrictions: ${context.dietaryRestrictions.join(', ')}`;
      }

      if (context.healthGoals && context.healthGoals.length > 0) {
        systemPrompt += `\n\nHealth Goals: ${context.healthGoals.join(', ')}`;
      }

      if (context.userPreferences) {
        const prefs = context.userPreferences;
        if (prefs.cuisinePreferences && prefs.cuisinePreferences.length > 0) {
          systemPrompt += `\n\nPreferred Cuisines: ${prefs.cuisinePreferences.join(', ')}`;
        }
        if (prefs.cookingSkillLevel) {
          systemPrompt += `\n\nCooking Skill Level: ${prefs.cookingSkillLevel}`;
        }
      }

      if (context.activeMealPlan) {
        systemPrompt += `\n\nUser has an active meal plan. Consider this when making suggestions.`;
      }
    }

    return {
      role: 'system',
      content: systemPrompt,
    };
  }

  private parseResponse(content: string): ChatResponse {
    // Analyze content to determine response type
    const lowerContent = content.toLowerCase();
    
    let type: ChatResponse['type'] = 'text';
    let structuredData: any = undefined;
    let suggestions: string[] = [];

    // Check for recipe suggestions
    if (lowerContent.includes('recipe') || lowerContent.includes('ingredients:') || lowerContent.includes('instructions:')) {
      type = 'recipe_suggestion';
      structuredData = this.extractRecipeData(content);
    }
    
    // Check for meal plan suggestions
    else if (lowerContent.includes('meal plan') || lowerContent.includes('breakfast:') || lowerContent.includes('lunch:') || lowerContent.includes('dinner:')) {
      type = 'meal_plan_suggestion';
      structuredData = this.extractMealPlanData(content);
    }
    
    // Check for pantry-related advice
    else if (lowerContent.includes('pantry') || lowerContent.includes('storage') || lowerContent.includes('expir')) {
      type = 'pantry_update';
    }
    
    // Check for shopping list generation
    else if (lowerContent.includes('shopping') || lowerContent.includes('grocery') || lowerContent.includes('buy:')) {
      type = 'shopping_list_generation';
      structuredData = this.extractShoppingListData(content);
    }

    // Extract follow-up suggestions
    suggestions = this.extractSuggestions(content);

    return {
      content,
      type,
      structuredData,
      suggestions,
      confidence: 0.8,
    };
  }

  private extractRecipeData(content: string): any {
    // Simple regex-based extraction - could be enhanced with more sophisticated parsing
    const ingredientsMatch = content.match(/ingredients?:?\s*([\s\S]*?)(?=instructions?:|directions?:|method:|$)/i);
    const instructionsMatch = content.match(/(?:instructions?|directions?|method):?\s*([\s\S]*?)(?=notes?:|tips?:|$)/i);
    
    return {
      hasIngredients: !!ingredientsMatch,
      hasInstructions: !!instructionsMatch,
      rawIngredients: ingredientsMatch?.[1]?.trim(),
      rawInstructions: instructionsMatch?.[1]?.trim(),
    };
  }

  private extractMealPlanData(content: string): any {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    
    const foundDays = days.filter(day => content.toLowerCase().includes(day));
    const foundMeals = meals.filter(meal => content.toLowerCase().includes(meal));
    
    return {
      daysFound: foundDays,
      mealsFound: foundMeals,
      isWeeklyPlan: foundDays.length >= 5,
    };
  }

  private extractShoppingListData(content: string): any {
    // Look for bullet points or numbered lists
    const listItems = content.match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*([^\n]+)/gm);
    
    return {
      hasListItems: !!listItems,
      itemCount: listItems?.length || 0,
      rawItems: listItems?.map(item => item.replace(/^[\s\-*•\d.]+/, '').trim()),
    };
  }

  private extractSuggestions(content: string): string[] {
    const suggestions: string[] = [];
    
    // Look for common suggestion patterns
    const suggestionPatterns = [
      /would you like me to[^?]*\?/gi,
      /i can also[^.]*\./gi,
      /you might want to[^.]*\./gi,
      /consider[^.]*\./gi,
    ];

    suggestionPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        suggestions.push(...matches.map(match => match.trim()));
      }
    });

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  // Generate recipe based on ingredients
  async generateRecipe(ingredients: string[], preferences?: any): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Please create a recipe using these ingredients: ${ingredients.join(', ')}. ${
          preferences?.difficulty ? `Make it ${preferences.difficulty} difficulty.` : ''
        } ${
          preferences?.cuisine ? `I prefer ${preferences.cuisine} cuisine.` : ''
        } ${
          preferences?.maxTime ? `I have about ${preferences.maxTime} minutes to cook.` : ''
        }`,
      },
    ];

    return this.sendMessage(messages, undefined, true); // Use advanced model for recipe generation
  }

  // Generate meal plan
  async generateMealPlan(days: number, preferences?: any, context?: ChatContext): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Please create a ${days}-day meal plan for me. ${
          preferences?.targetCalories ? `Target about ${preferences.targetCalories} calories per day.` : ''
        } ${
          preferences?.mealsPerDay ? `Include ${preferences.mealsPerDay.join(', ')} each day.` : 'Include breakfast, lunch, and dinner.'
        } ${
          preferences?.complexity ? `Keep recipes ${preferences.complexity}.` : ''
        }`,
      },
    ];

    return this.sendMessage(messages, context, true); // Use advanced model for meal planning
  }

  // Get cooking tips
  async getCookingTips(topic: string): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Can you give me some cooking tips about ${topic}?`,
      },
    ];

    return this.sendMessage(messages);
  }

  // Analyze nutrition
  async analyzeNutrition(foodItems: string[]): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Can you analyze the nutritional value of these foods and suggest how to make a balanced meal: ${foodItems.join(', ')}?`,
      },
    ];

    return this.sendMessage(messages, undefined, true);
  }
}
