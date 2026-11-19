import type { Catalog, IngredientLine, Unit } from './types';

/** Recipe id -> servings chosen for the shopping list. */
export type Selection = Record<string, number>;

const WEIGHT: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
const VOLUME: Partial<Record<Unit, number>> = { ml: 1, l: 1000, cup: 240, tbsp: 15, tsp: 5 };

export interface ShoppingItem {
  ingredient: string;
  /** e.g. ["300 g", "2 tbsp", "to taste"] — one part per unit family that couldn't be merged. */
  amounts: string[];
  recipes: string[];
}

export function scaleLine(line: IngredientLine, factor: number): IngredientLine {
  return line.amount === undefined ? line : { ...line, amount: line.amount * factor };
}

/** Merges the selected recipes' ingredients: each ingredient id appears once, with amounts summed per unit family. */
export function buildShoppingList(catalog: Catalog, selection: Selection): ShoppingItem[] {
  const byIngredient = new Map<string, { weight: number; volume: number; counts: Map<Unit, number>; toTaste: boolean; recipes: Set<string> }>();
  for (const recipe of catalog.recipes) {
    const servings = selection[recipe.id];
    if (!servings) continue;
    const factor = servings / recipe.servings;
    for (const raw of recipe.ingredientGroups.flatMap((g) => g.items)) {
      if (raw.optional) continue;
      const line = scaleLine(raw, factor);
      const acc = byIngredient.get(line.ingredient) ?? { weight: 0, volume: 0, counts: new Map(), toTaste: false, recipes: new Set() };
      acc.recipes.add(recipe.title);
      if (line.amount === undefined || line.unit === 'to-taste') acc.toTaste = true;
      else if (WEIGHT[line.unit]) acc.weight += line.amount * WEIGHT[line.unit]!;
      else if (VOLUME[line.unit]) acc.volume += line.amount * VOLUME[line.unit]!;
      else acc.counts.set(line.unit, (acc.counts.get(line.unit) ?? 0) + line.amount);
      byIngredient.set(line.ingredient, acc);
    }
  }
  return [...byIngredient].map(([ingredient, acc]) => {
    const amounts: string[] = [];
    if (acc.weight) amounts.push(acc.weight >= 1000 ? `${round(acc.weight / 1000, 2)} kg` : `${round(acc.weight, 0)} g`);
    if (acc.volume) amounts.push(acc.volume >= 1000 ? `${round(acc.volume / 1000, 2)} l` : `${round(acc.volume, 0)} ml`);
    for (const [unit, n] of acc.counts) amounts.push(formatAmount(n, unit));
    if (acc.toTaste && !amounts.length) amounts.push('to taste');
    return { ingredient, amounts, recipes: [...acc.recipes] };
  });
}

const round = (n: number, digits: number) => Number(n.toFixed(digits)).toString();

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.33': '⅓', '0.5': '½', '0.67': '⅔', '0.75': '¾' };

function formatNumber(n: number): string {
  const whole = Math.floor(n);
  const frac = FRACTIONS[(n - whole).toFixed(2)];
  if (frac) return whole ? `${whole}${frac}` : frac;
  return n >= 10 ? round(n, 0) : round(n, 1);
}

const UNIT_LABEL: Partial<Record<Unit, [string, string]>> = {
  piece: ['', ''], slice: ['slice', 'slices'], clove: ['clove', 'cloves'], sprig: ['sprig', 'sprigs'],
  stick: ['stick', 'sticks'], pinch: ['pinch', 'pinches'], cup: ['cup', 'cups'],
};

export function formatAmount(amount: number | undefined, unit: Unit): string {
  if (amount === undefined || unit === 'to-taste') return 'to taste';
  const label = UNIT_LABEL[unit];
  const unitText = label ? label[amount > 1 ? 1 : 0] : unit;
  return `${formatNumber(amount)}${unitText ? ` ${unitText}` : ''}`;
}
