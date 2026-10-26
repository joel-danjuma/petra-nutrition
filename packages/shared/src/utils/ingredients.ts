/**
 * Ingredient identity, for the apps.
 *
 * Re-exported rather than reimplemented: the recipe screen's Have / Buy
 * column, the API's pantry match and the agent's retrieval must all agree
 * that "Unsalted butter" covers butter, "Olive oil" does not cover sesame oil,
 * and salt is never something to buy. One copy in `@petra/food-measures` is
 * how they agree.
 */
export {
  covers,
  ingredientKey,
  isStaple,
  sameIngredient,
} from '@petra/food-measures';
