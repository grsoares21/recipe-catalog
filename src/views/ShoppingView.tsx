import { useMemo } from 'react';
import type { Aisle, Catalog } from '../types';
import { buildShoppingList, type Selection } from '../shopping';
import { useStoredState } from '../storage';

const AISLES: Record<Aisle, string> = {
  produce: 'Fruit & veg',
  'dairy-eggs': 'Dairy & eggs',
  'meat-fish': 'Meat & fish',
  baking: 'Baking',
  pantry: 'Pantry',
  'spices-condiments': 'Spices & condiments',
  frozen: 'Frozen',
  drinks: 'Drinks',
  other: 'Other',
};

interface Props {
  catalog: Catalog;
  selection: Selection;
  setSelection: (s: Selection) => void;
}

export default function ShoppingView({ catalog, selection, setSelection }: Props) {
  const [checked, setChecked] = useStoredState<string[]>('checked', []);
  const [hideStaples, setHideStaples] = useStoredState('hideStaples', true);
  const items = useMemo(() => buildShoppingList(catalog, selection), [catalog, selection]);
  const recipes = catalog.recipes.filter((r) => selection[r.id]);

  // Water and salt are rarely worth buying for a single recipe.
  const visible = items.filter((i) => !hideStaples || !['water', 'salt'].includes(i.ingredient));
  const byAisle = Object.keys(AISLES)
    .map((aisle) => ({
      aisle: aisle as Aisle,
      items: visible
        .filter((i) => catalog.ingredients[i.ingredient].aisle === aisle)
        .sort((a, b) => catalog.ingredients[a.ingredient].name.localeCompare(catalog.ingredients[b.ingredient].name)),
    }))
    .filter((g) => g.items.length);

  const toggle = (id: string) => setChecked(checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id]);
  const clear = () => { setSelection({}); setChecked([]); };

  if (!recipes.length) {
    return (
      <div className="page">
        <header className="top"><h1>Shopping list</h1></header>
        <p className="empty">No recipes yet. Open a recipe and tap “Add to shopping list”.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="top"><h1>Shopping list</h1></header>
      <ul className="selected">
        {recipes.map((r) => (
          <li key={r.id}>
            <a href={`#/r/${r.id}`}>{r.title}</a>
            <span className="meta">{selection[r.id]} serv.</span>
            <button className="link" onClick={() => { const next = { ...selection }; delete next[r.id]; setSelection(next); }} aria-label={`Remove ${r.title}`}>✕</button>
          </li>
        ))}
      </ul>

      {byAisle.map(({ aisle, items }) => (
        <section key={aisle}>
          <h2>{AISLES[aisle]}</h2>
          <ul className="checklist">
            {items.map((i) => (
              <li key={i.ingredient} className={checked.includes(i.ingredient) ? 'checked' : ''}>
                <label>
                  <input type="checkbox" checked={checked.includes(i.ingredient)} onChange={() => toggle(i.ingredient)} />
                  <span className="name">{catalog.ingredients[i.ingredient].name}</span>
                  <span className="amount">{i.amounts.join(' + ')}</span>
                </label>
                {i.recipes.length > 1 && <small>{i.recipes.length} recipes</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="row actions">
        <label className="toggle">
          <input type="checkbox" checked={hideStaples} onChange={(e) => setHideStaples(e.target.checked)} /> Hide water and salt
        </label>
        <button className="link danger" onClick={clear}>Clear list</button>
      </div>
    </div>
  );
}
