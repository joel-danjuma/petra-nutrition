import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import sharp from 'sharp';

export interface RecognitionResult {
  name: string;
  category: string;
  brand?: string;
  estimatedQuantity?: number;
  unit?: string;
  confidence: number;
  nutritionPer100g?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

export class ImageRecognitionService {
  private geminiApiKey: string;
  private geminiEndpoint: string;

  constructor() {
    this.geminiApiKey = config.GEMINI_API_KEY;
    this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent';
  }

  async recognizeFood(imageBase64: string, context: string = 'pantry_item'): Promise<RecognitionResult> {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // Remove data URL prefix if present
      const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

      const prompt = this.buildPrompt(context);
      
      const response = await axios.post(
        `${this.geminiEndpoint}?key=${this.geminiApiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024,
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const result = this.parseGeminiResponse(response.data);
      
      logger.info('Image recognition completed', {
        context,
        confidence: result.confidence,
        itemName: result.name,
      });

      return result;
    } catch (error) {
      logger.error('Image recognition failed:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error('Image recognition service is temporarily unavailable due to rate limits');
        } else if (error.response?.status === 403) {
          throw new Error('Image recognition service access denied');
        }
      }
      
      throw new Error('Failed to recognize image content');
    }
  }

  async recognizeFromFile(filePath: string, context: string = 'pantry_item'): Promise<RecognitionResult> {
    try {
      // Process image with Sharp for optimization
      const processedImageBuffer = await sharp(filePath)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      const base64Data = processedImageBuffer.toString('base64');
      
      return this.recognizeFood(base64Data, context);
    } catch (error) {
      logger.error('Failed to process image file:', error);
      throw new Error('Failed to process uploaded image');
    }
  }

  private buildPrompt(context: string): string {
    const basePrompt = `Analyze this food image and provide detailed information in JSON format. 

Please identify:
1. The main food item or ingredient
2. The food category (produce, dairy, meat, seafood, grains, pantry_staples, spices, condiments, beverages, frozen, canned, snacks, other)
3. Brand name if visible on packaging
4. Estimated quantity and appropriate unit
5. Basic nutritional information per 100g if possible
6. Your confidence level (0-1)

Return ONLY valid JSON in this exact format:
{
  "name": "item name",
  "category": "category from the list above",
  "brand": "brand name or null",
  "estimatedQuantity": number or null,
  "unit": "appropriate unit or null",
  "confidence": 0.95,
  "nutritionPer100g": {
    "calories": number or null,
    "protein": number or null,
    "carbs": number or null,
    "fat": number or null
  }
}`;

    if (context === 'fresh_produce') {
      return basePrompt + `\n\nFocus on identifying fresh fruits and vegetables. Pay attention to ripeness and quality indicators.`;
    } else if (context === 'packaged_food') {
      return basePrompt + `\n\nFocus on packaged food items. Look for brand names, product names, and nutritional information on labels.`;
    }

    return basePrompt;
  }

  private parseGeminiResponse(responseData: any): RecognitionResult {
    try {
      const content = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        throw new Error('No content in response');
      }

      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.name || !parsed.category) {
        throw new Error('Missing required fields in response');
      }

      // Ensure confidence is within valid range
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

      return {
        name: parsed.name,
        category: parsed.category,
        brand: parsed.brand || undefined,
        estimatedQuantity: parsed.estimatedQuantity || undefined,
        unit: parsed.unit || undefined,
        confidence,
        nutritionPer100g: parsed.nutritionPer100g || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse Gemini response:', error);
      
      // Return fallback result
      return {
        name: 'Unknown Food Item',
        category: 'other',
        confidence: 0.1,
      };
    }
  }

  // Batch recognition for multiple images
  async recognizeBatch(images: string[], context: string = 'pantry_item'): Promise<RecognitionResult[]> {
    const results = [];
    const maxConcurrent = 3; // Limit concurrent requests

    for (let i = 0; i < images.length; i += maxConcurrent) {
      const batch = images.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(image => 
        this.recognizeFood(image, context).catch(error => {
          logger.error('Batch recognition error:', error);
          return {
            name: 'Recognition Failed',
            category: 'other',
            confidence: 0,
          };
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  // Get nutrition information for a food item
  async getNutritionInfo(foodName: string): Promise<any> {
    try {
      const prompt = `Provide detailed nutritional information for "${foodName}" per 100g in JSON format:
      {
        "calories": number,
        "protein": number,
        "carbs": number,
        "fat": number,
        "fiber": number,
        "sugar": number,
        "sodium": number
      }`;

      const response = await axios.post(
        `${this.geminiEndpoint}?key=${this.geminiApiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );

      const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return null;
    } catch (error) {
      logger.error('Failed to get nutrition info:', error);
      return null;
    }
  }
}
