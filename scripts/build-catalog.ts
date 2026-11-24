// Validates data/ and writes public/catalog.json, estimating nutrition from the ingredients
// when the creator didn't publish it. Run: npm run catalog
import fs from 'node:fs';
import path from 'node:path';
import type { Catalog, Ingredient, IngredientLine, Macros, Recipe, RecipeSource } from '../src/types';

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));

const ingredients = read<Record<string, Ingredient>>('data/ingredients.json');
const tables: Record<string, Record<string, Macros & { name: string }>> = {
  taco: read('data/nutrition/taco.json'),
  usda: read('data/nutrition/usda.json'),
};

// Volume units in ml; weight units in g.
const ML: Record<string, number> = { ml: 1, l: 1000, cup: 240, tbsp: 15, tsp: 5 };
const G: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6, pinch: 0.5 };

const errors: string[] = [];

function grams(line: IngredientLine, ing: Ingredient): number | undefined {
  if (line.amount === undefined || line.unit === 'to-taste') return undefined;
  if (line.unit in G) return line.amount * G[line.unit];
  if (line.unit in ML) return line.amount * ML[line.unit] * (ing.density ?? 1);
  const w = ing.unitWeights?.[line.unit as keyof NonNullable<Ingredient['unitWeights']>];
  return w === undefined ? undefined : line.amount * w;
}

function per100g(id: string, ing: Ingredient): Macros | undefined {
  if (ing.nutrition) return ing.nutrition;
  if (!ing.nutritionRef) return undefined;
  const [table] = ing.nutritionRef.split(':');
  const food = tables[table]?.[ing.nutritionRef];
  if (!food) errors.push(`ingredient ${id}: unknown nutritionRef ${ing.nutritionRef}`);
  return food;
}

const round = (n: number) => Math.round(n);

function estimate(r: RecipeSource): Recipe['nutrition'] {
  const total: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const missing: string[] = [];
  let counted = 0;
  for (const line of r.ingredientGroups.flatMap((g) => g.items)) {
    const ing = ingredients[line.ingredient];
    if (line.optional || line.unit === 'to-taste') continue;
    const g = grams(line, ing);
    const n = per100g(line.ingredient, ing);
    if (g === undefined || n === undefined) {
      // Colourings and the like have no meaningful nutrition; only flag real gaps.
      if (ing.nutritionRef || ing.nutrition || g === undefined) missing.push(ing.name);
      continue;
    }
    for (const k of Object.keys(total) as (keyof Macros)[]) total[k] += (n[k] * g) / 100;
    counted++;
  }
  // Nothing measurable (e.g. a board assembled "to taste"): no estimate beats a fake 0 kcal.
  if (!counted) return undefined;
  const s = r.servings;
  return {
    source: 'estimated',
    kcal: round(total.kcal / s), protein: round(total.protein / s), carbs: round(total.carbs / s),
    fat: round(total.fat / s), fiber: round(total.fiber / s), missing,
  };
}

const recipes: Recipe[] = [];
for (const file of fs.readdirSync('data/recipes').filter((f) => f.endsWith('.json')).sort()) {
  const r = read<RecipeSource>(path.join('data/recipes', file));
  if (r.id !== path.basename(file, '.json')) errors.push(`${file}: id ${r.id} doesn't match file name`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.addedAt ?? '')) errors.push(`${file}: addedAt must be a YYYY-MM-DD date`);
  for (const line of r.ingredientGroups.flatMap((g) => g.items)) {
    if (!ingredients[line.ingredient]) errors.push(`${file}: unknown ingredient ${line.ingredient}`);
    else if (line.unit !== 'to-taste' && line.amount !== undefined && grams(line, ingredients[line.ingredient]) === undefined)
      errors.push(`${file}: can't convert ${line.unit} of ${line.ingredient} to grams (add unitWeights/density)`);
  }
  // Some reels can't be fetched logged out; those recipes show a placeholder instead of a photo.
  const photoPath = `photos/${r.id}.jpg`;
  const photo = fs.existsSync(path.join('public', photoPath)) ? photoPath : undefined;
  if (!photo) console.warn(`${file}: no photo, using placeholder`);
  const nutrition = r.creatorNutrition
    ? { source: 'creator' as const, kcal: r.creatorNutrition.kcal, protein: r.creatorNutrition.protein, carbs: r.creatorNutrition.carbs, fat: r.creatorNutrition.fat, fiber: r.creatorNutrition.fiber, missing: [] }
    : r.kind === 'recipe' ? estimate(r) : undefined;
  recipes.push({ ...r, photo, nutrition });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

// Only ship ingredients that are used.
const used = new Set(recipes.flatMap((r) => r.ingredientGroups.flatMap((g) => g.items.map((i) => i.ingredient))));
const catalog: Catalog = {
  builtAt: new Date().toISOString(),
  ingredients: Object.fromEntries(Object.entries(ingredients).filter(([id]) => used.has(id))),
  recipes,
};
fs.writeFileSync('public/catalog.json', JSON.stringify(catalog));
console.log(`${recipes.length} recipes, ${used.size} ingredients`);
for (const r of recipes) {
  const n = r.nutrition;
  console.log(`  ${r.id.padEnd(12)} ${r.title.slice(0, 40).padEnd(40)} ${n ? `${n.kcal} kcal P${n.protein} C${n.carbs} F${n.fat} (${n.source}${n.missing.length ? `, missing: ${n.missing.join(', ')}` : ''})` : '-'}`);
}
