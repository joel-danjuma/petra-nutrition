import { Router, type Application, type Request, type Response } from 'express';
import {
  analyzeNutritionRequestSchema,
  chatRequestSchema,
  cookingTipsRequestSchema,
  enrichRecipeRequestSchema,
  generateMealPlanRequestSchema,
  generateRecipeRequestSchema,
  retrieveRequestSchema,
  visionRequestSchema,
} from '@petra/agent-contract';
import { ValidationError, asyncHandler } from '@petra/service-kit';

import { aiChatService, runChatTurn } from '../orchestrator';
import { enrichRecipe } from '../llm/enrich';
import { retrievalService } from '../retrieval';
import { ImageRecognitionService } from '../vision';
import { internalAuth } from '../middleware/internal-auth';
import { streamChat } from './stream';
import { logger } from '../utils/logger';

const visionService = new ImageRecognitionService();

/**
 * Parse a body against its contract schema, or fail with the same 400 shape the
 * API produces. Validating here rather than trusting the gateway means a
 * contract mismatch surfaces as a precise field error instead of a confusing
 * failure deeper in a model call.
 */
const parse = <T>(schema: { safeParse: (v: unknown) => any }, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid agent request body', result.error.flatten());
  }
  return result.data as T;
};

export const setupRoutes = (app: Application): void => {
  const router = Router();

  router.use(internalAuth);

  router.post(
    '/chat',
    asyncHandler(async (req: Request, res: Response) => {
      const request = parse<import('@petra/agent-contract').ChatRequest>(
        chatRequestSchema,
        req.body
      );

      const started = Date.now();
      const response = await runChatTurn(request);

      logger.info('Chat turn served', {
        userId: request.user.id,
        model: response.model,
        tokensUsed: response.tokensUsed,
        recipeId: response.recipeId,
        durationMs: Date.now() - started,
      });

      res.json({ success: true, data: response });
    })
  );

  router.post('/chat/stream', streamChat);

  router.post(
    '/recipes/retrieve',
    asyncHandler(async (req: Request, res: Response) => {
      const request = parse<import('@petra/agent-contract').RetrieveRequest>(
        retrieveRequestSchema,
        req.body
      );
      const recipes = await retrievalService.search(request);
      res.json({ success: true, data: { recipes } });
    })
  );

  router.post(
    '/recipes/generate',
    asyncHandler(async (req: Request, res: Response) => {
      const { ingredients, preferences } = parse<
        import('@petra/agent-contract').GenerateRecipeRequest
      >(generateRecipeRequestSchema, req.body);
      const response = await aiChatService.generateRecipe(ingredients, preferences);
      res.json({ success: true, data: response });
    })
  );

  /**
   * Structured extraction over an imported recipe. Returns fields; writes
   * nothing. The API owns the `recipes` table and persists the result itself.
   */
  router.post(
    '/recipes/enrich',
    asyncHandler(async (req: Request, res: Response) => {
      const recipe = parse<import('@petra/agent-contract').EnrichRecipeRequest>(
        enrichRecipeRequestSchema,
        req.body
      );
      res.json({ success: true, data: await enrichRecipe(aiChatService, recipe) });
    })
  );

  router.post(
    '/meal-plans/generate',
    asyncHandler(async (req: Request, res: Response) => {
      const { days, preferences, context } = parse<
        import('@petra/agent-contract').GenerateMealPlanRequest
      >(generateMealPlanRequestSchema, req.body);

      const response = await aiChatService.generateMealPlan(days, preferences, {
        userPreferences: context?.userPreferences,
        currentPantryItems: context?.currentPantryItems ?? [],
        dietaryRestrictions: context?.dietaryRestrictions ?? [],
        healthGoals: context?.healthGoals ?? [],
        allergies: context?.allergies ?? [],
      });

      res.json({ success: true, data: response });
    })
  );

  router.post(
    '/cooking-tips',
    asyncHandler(async (req: Request, res: Response) => {
      const { topic } = parse<import('@petra/agent-contract').CookingTipsRequest>(
        cookingTipsRequestSchema,
        req.body
      );
      res.json({ success: true, data: await aiChatService.getCookingTips(topic) });
    })
  );

  router.post(
    '/nutrition/analyze',
    asyncHandler(async (req: Request, res: Response) => {
      const { foodItems } = parse<import('@petra/agent-contract').AnalyzeNutritionRequest>(
        analyzeNutritionRequestSchema,
        req.body
      );
      res.json({ success: true, data: await aiChatService.analyzeNutrition(foodItems) });
    })
  );

  router.post(
    '/vision/pantry-items',
    asyncHandler(async (req: Request, res: Response) => {
      const { image, context } = parse<import('@petra/agent-contract').VisionRequest>(
        visionRequestSchema,
        req.body
      );
      const result = await visionService.recognizeFood(image, context);
      res.json({ success: true, data: result });
    })
  );

  /** Rebuild the semantic index. Also available as `pnpm --filter @petra/agent embed`. */
  router.post(
    '/index/rebuild',
    asyncHandler(async (_req: Request, res: Response) => {
      retrievalService.invalidate();
      res.json({ success: true, data: { invalidated: true } });
    })
  );

  app.use('/v1', router);

  logger.info('Agent routes configured');
};
