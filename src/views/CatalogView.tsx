import { useMemo } from 'react';
import type { Catalog, Recipe } from '../types';
import type { Selection } from '../shopping';
import { useStoredState } from '../storage';

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function ingredientIds(r: Recipe) {
  return new Set(r.ingredientGroups.flatMap((g) => g.items.map((i) => i.ingredient)));
}

export default function CatalogView({ catalog, selection }: { catalog: Catalog; selection: Selection }) {
  const [query, setQuery] = useStoredState('query', '');
  const [withIngredients, setWithIngredients] = useStoredState<string[]>('withIngredients', []);
  const [tag, setTag] = useStoredState<string>('tag', '');

  const tags = useMemo(() => [...new Set(catalog.recipes.flatMap((r) => r.tags))].sort(), [catalog]);

  // Ingredient suggestions for the typed query, most-used first.
  const suggestions = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    const uses = new Map<string, number>();
    for (const r of catalog.recipes) for (const id of ingredientIds(r)) uses.set(id, (uses.get(id) ?? 0) + 1);
    return Object.entries(catalog.ingredients)
      .filter(([id, ing]) => !withIngredients.includes(id) && normalize(ing.name).includes(q))
      .sort(([a], [b]) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0))
      .slice(0, 6);
  }, [catalog, query, withIngredients]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return catalog.recipes.filter((r) => {
      const ids = ingredientIds(r);
      if (!withIngredients.every((id) => ids.has(id))) return false;
      if (tag && !r.tags.includes(tag)) return false;
      if (!q) return true;
      const haystack = [r.title, r.creator, ...r.tags, ...[...ids].map((id) => catalog.ingredients[id].name)].map(normalize);
      return haystack.some((h) => h.includes(q));
    });
  }, [catalog, query, withIngredients, tag]);

  return (
    <div className="page">
      <header className="top">
        <h1>Recipes</h1>
        <input
          type="search"
          placeholder="Search recipes or ingredients"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map(([id, ing]) => (
              <button key={id} className="chip add" onClick={() => { setWithIngredients([...withIngredients, id]); setQuery(''); }}>
                + {ing.name}
              </button>
            ))}
          </div>
        )}
        {withIngredients.length > 0 && (
          <div className="chips">
            <span className="chips-label">With</span>
            {withIngredients.map((id) => (
              <button key={id} className="chip on" onClick={() => setWithIngredients(withIngredients.filter((x) => x !== id))}>
                {catalog.ingredients[id]?.name ?? id} ✕
              </button>
            ))}
          </div>
        )}
        <div className="chips scroll">
          <button className={`chip ${tag === '' ? 'on' : ''}`} onClick={() => setTag('')}>All</button>
          {tags.map((t) => (
            <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>
          ))}
        </div>
      </header>

      <p className="count">{results.length} of {catalog.recipes.length}</p>
      <ul className="grid">
        {results.map((r) => (
          <li key={r.id}>
            <a href={`#/r/${r.id}`} className="card">
              {r.photo ? <img src={r.photo} alt="" loading="lazy" /> : <div className="placeholder" aria-hidden="true">🍽️</div>}
              {selection[r.id] && <span className="in-list" title="In shopping list">✓</span>}
              <div className="card-body">
                <h2>{r.title}</h2>
                <p className="meta">
                  {r.kind === 'tip' ? 'Tip' : r.nutrition ? `${r.nutrition.kcal} kcal` : ''}
                  {r.status === 'incomplete' && <span className="warn"> · incomplete</span>}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {results.length === 0 && <p className="empty">No recipes match.</p>}
    </div>
  );
}
