import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

export interface BarcodeResult {
  name: string;
  category: string;
  brand?: string;
  confidence: number;
  nutritionPer100g?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  imageUrl?: string;
  description?: string;
}

export class BarcodeService {
  private openFoodFactsEndpoint = 'https://world.openfoodfacts.org/api/v0/product';
  private upcDatabaseEndpoint = 'https://api.upcitemdb.com/prod/trial/lookup';

  async lookupBarcode(barcode: string): Promise<BarcodeResult | null> {
    // Clean barcode (remove any non-digit characters)
    const cleanBarcode = barcode.replace(/\D/g, '');
    
    if (!this.isValidBarcode(cleanBarcode)) {
      throw new Error('Invalid barcode format');
    }

    // Check cache first
    const cacheKey = `barcode:${cleanBarcode}`;
    const cached = await cache.get<BarcodeResult>(cacheKey);
    
    if (cached) {
      logger.info('Barcode lookup cache hit', { barcode: cleanBarcode });
      return cached;
    }

    try {
      // Try OpenFoodFacts first (free and comprehensive for food items)
      let result = await this.lookupOpenFoodFacts(cleanBarcode);
      
      // If not found, try UPC Database as fallback
      if (!result) {
        result = await this.lookupUPCDatabase(cleanBarcode);
      }

      if (result) {
        // Cache successful results for 24 hours
        await cache.set(cacheKey, result, 86400);
        
        logger.info('Barcode lookup successful', {
          barcode: cleanBarcode,
          productName: result.name,
          confidence: result.confidence,
        });
      } else {
        // Cache negative results for 1 hour to avoid repeated API calls
        await cache.set(cacheKey, null, 3600);
        
        logger.info('Barcode lookup failed - product not found', {
          barcode: cleanBarcode,
        });
      }

      return result;
    } catch (error) {
      logger.error('Barcode lookup error:', error);
      throw new Error('Failed to lookup barcode');
    }
  }

  private async lookupOpenFoodFacts(barcode: string): Promise<BarcodeResult | null> {
    try {
      const response = await axios.get(`${this.openFoodFactsEndpoint}/${barcode}.json`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Petra-AI/1.0 (contact@petra-ai.com)',
        },
      });

      const product = response.data.product;
      
      if (!product || response.data.status === 0) {
        return null;
      }

      const result: BarcodeResult = {
        name: product.product_name || product.product_name_en || 'Unknown Product',
        category: this.mapOpenFoodFactsCategory(product.categories),
        brand: product.brands?.split(',')[0]?.trim(),
        confidence: 0.9, // OpenFoodFacts is generally reliable
        imageUrl: product.image_url,
        description: product.generic_name || product.generic_name_en,
      };

      // Extract nutrition information if available
      const nutriments = product.nutriments;
      if (nutriments) {
        result.nutritionPer100g = {
          calories: nutriments['energy-kcal_100g'] || nutriments.energy_100g ? Math.round(nutriments.energy_100g / 4.184) : undefined,
          protein: nutriments.proteins_100g,
          carbs: nutriments.carbohydrates_100g,
          fat: nutriments.fat_100g,
        };
      }

      return result;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null; // Product not found
      }
      
      logger.error('OpenFoodFacts API error:', error);
      return null;
    }
  }

  private async lookupUPCDatabase(barcode: string): Promise<BarcodeResult | null> {
    try {
      const response = await axios.get(this.upcDatabaseEndpoint, {
        params: { upc: barcode },
        timeout: 10000,
        headers: {
          'User-Agent': 'Petra-AI/1.0',
        },
      });

      const data = response.data;
      
      if (!data.items || data.items.length === 0) {
        return null;
      }

      const item = data.items[0];
      
      return {
        name: item.title || 'Unknown Product',
        category: this.mapUPCDatabaseCategory(item.category),
        brand: item.brand,
        confidence: 0.7, // UPC Database is less reliable for food-specific data
        imageUrl: item.images?.[0],
        description: item.description,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null; // Product not found
      }
      
      logger.error('UPC Database API error:', error);
      return null;
    }
  }

  private isValidBarcode(barcode: string): boolean {
    // Check common barcode lengths
    const validLengths = [8, 12, 13, 14];
    
    if (!validLengths.includes(barcode.length)) {
      return false;
    }

    // Basic checksum validation for EAN-13
    if (barcode.length === 13) {
      return this.validateEAN13(barcode);
    }

    // For other formats, just check if it's all digits
    return /^\d+$/.test(barcode);
  }

  private validateEAN13(barcode: string): boolean {
    if (barcode.length !== 13) return false;

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(barcode[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(barcode[12]);
  }

  private mapOpenFoodFactsCategory(categories: string): string {
    if (!categories) return 'other';

    const categoryLower = categories.toLowerCase();
    
    if (categoryLower.includes('fruit') || categoryLower.includes('vegetable')) {
      return 'produce';
    } else if (categoryLower.includes('dairy') || categoryLower.includes('milk') || categoryLower.includes('cheese')) {
      return 'dairy';
    } else if (categoryLower.includes('meat') || categoryLower.includes('poultry')) {
      return 'meat';
    } else if (categoryLower.includes('fish') || categoryLower.includes('seafood')) {
      return 'seafood';
    } else if (categoryLower.includes('bread') || categoryLower.includes('cereal') || categoryLower.includes('pasta')) {
      return 'grains';
    } else if (categoryLower.includes('spice') || categoryLower.includes('herb')) {
      return 'spices';
    } else if (categoryLower.includes('sauce') || categoryLower.includes('condiment')) {
      return 'condiments';
    } else if (categoryLower.includes('beverage') || categoryLower.includes('drink')) {
      return 'beverages';
    } else if (categoryLower.includes('frozen')) {
      return 'frozen';
    } else if (categoryLower.includes('canned') || categoryLower.includes('preserved')) {
      return 'canned';
    } else if (categoryLower.includes('snack') || categoryLower.includes('candy') || categoryLower.includes('chocolate')) {
      return 'snacks';
    }
    
    return 'pantry_staples';
  }

  private mapUPCDatabaseCategory(category: string): string {
    if (!category) return 'other';

    const categoryLower = category.toLowerCase();
    
    // Map UPC Database categories to our categories
    if (categoryLower.includes('food') || categoryLower.includes('grocery')) {
      return 'pantry_staples';
    } else if (categoryLower.includes('beverage')) {
      return 'beverages';
    } else if (categoryLower.includes('health') || categoryLower.includes('beauty')) {
      return 'other';
    }
    
    return 'other';
  }

  // Batch barcode lookup
  async lookupBarcodes(barcodes: string[]): Promise<(BarcodeResult | null)[]> {
    const results = [];
    const maxConcurrent = 5; // Limit concurrent requests to avoid rate limits

    for (let i = 0; i < barcodes.length; i += maxConcurrent) {
      const batch = barcodes.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(barcode => 
        this.lookupBarcode(barcode).catch(error => {
          logger.error('Batch barcode lookup error:', error);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add small delay between batches to be respectful to APIs
      if (i + maxConcurrent < barcodes.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  // Get product suggestions based on partial barcode
  async getBarcodeSuggestions(partialBarcode: string): Promise<string[]> {
    // This would typically involve a more sophisticated search
    // For now, return empty array as most APIs don't support partial lookups
    return [];
  }
}
