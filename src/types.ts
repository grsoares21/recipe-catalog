// Source data (data/ingredients.json, data/recipes/*.json) and the built catalog (public/catalog.json).

export type Aisle =
  | 'produce'
  | 'dairy-eggs'
  | 'meat-fish'
  | 'baking'
  | 'pantry'
  | 'spices-condiments'
  | 'frozen'
  | 'drinks'
  | 'other';

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export type Unit =
  | 'g' | 'kg' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'oz' | 'lb'
  | 'piece' | 'slice' | 'clove' | 'sprig' | 'stick' | 'pinch' | 'to-taste';

export interface Ingredient {
  /** English name, or the local name for country-specific ingredients (e.g. "Requeijão"). */
  name: string;
  /** Short English explanation, for local names. */
  description?: string;
  aisle: Aisle;
  /** Key into data/nutrition/{taco,usda}.json, e.g. "taco:468" or "usda:173418". */
  nutritionRef?: string;
  /** Per-100 g values when no table entry fits (e.g. xylitol); always cite the source. */
  nutrition?: Macros & { source: string };
  /** grams per ml, for volume units; defaults to 1. */
  density?: number;
  /** grams per piece/slice/clove/sprig/stick. */
  unitWeights?: Partial<Record<'piece' | 'slice' | 'clove' | 'sprig' | 'stick', number>>;
}

export interface IngredientLine {
  ingredient: string;
  amount?: number;
  unit: Unit;
  /** English preparation note, e.g. "grated" or "50% cocoa". */
  note?: string;
  optional?: boolean;
  /** The creator gave no amount; this one is our estimate (used for nutrition, shown as ≈). */
  assumed?: boolean;
}

export interface RecipeSource {
  id: string;
  kind: 'recipe' | 'tip';
  /** Original-language title. */
  title: string;
  language: string;
  creator: string;
  reelUrl: string;
  /** YYYY-MM-DD the reel was first shared (in the DMs, or to the recipe bot). Date only: the repo is public. */
  addedAt: string;
  /** Creator's own written recipe, when the reel points to one. */
  sourceUrl?: string;
  servings: number;
  servingsEstimated?: boolean;
  /** e.g. "10 × 23 cm pan" or "about 20 small rolls". */
  yield?: string;
  tags: string[];
  /** complete: amounts and method come from the creator; incomplete: something had to be reconstructed or is missing. */
  status: 'complete' | 'incomplete';
  statusNote?: string;
  ingredientGroups: { name?: string; items: IngredientLine[] }[];
  steps: string[];
  /** Only when the creator published nutrition; otherwise it is estimated from the ingredients. */
  creatorNutrition?: Macros & { per: string };
  notes?: string;
}

export interface Nutrition extends Macros {
  source: 'creator' | 'estimated';
  /** Ingredients that could not be counted (no amount or no data). */
  missing: string[];
}

export interface Recipe extends RecipeSource {
  /** Missing when the reel's thumbnail couldn't be fetched. */
  photo?: string;
  nutrition?: Nutrition;
}

export interface Catalog {
  builtAt: string;
  ingredients: Record<string, Ingredient>;
  recipes: Recipe[];
}
