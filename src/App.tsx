import { useEffect, useState } from 'react';
import type { Catalog } from './types';
import { useStoredState } from './storage';
import type { Selection } from './shopping';
import CatalogView from './views/CatalogView';
import RecipeView from './views/RecipeView';
import ShoppingView from './views/ShoppingView';

// Hash routes: #/ catalog, #/r/<id> recipe, #/list shopping list.
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState(false);
  const [selection, setSelection] = useStoredState<Selection>('selection', {});
  const route = useRoute();
  useEffect(() => {
    scrollTo(0, 0);
  }, [route[0], route[1]]);

  useEffect(() => {
    // no-cache: always revalidate, so new app code never runs against an older cached catalog.
    fetch('./catalog.json', { cache: 'no-cache' })
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="empty">Couldn't load the recipes. Check your connection and reopen the app.</p>;
  if (!catalog) return <p className="empty">Loading…</p>;

  const listCount = Object.keys(selection).length;
  const [page, id] = route;
  const recipe = page === 'r' ? catalog.recipes.find((r) => r.id === id) : undefined;

  return (
    <>
      <main>
        {recipe ? (
          <RecipeView recipe={recipe} catalog={catalog} selection={selection} setSelection={setSelection} />
        ) : page === 'list' ? (
          <ShoppingView catalog={catalog} selection={selection} setSelection={setSelection} />
        ) : (
          <CatalogView catalog={catalog} selection={selection} />
        )}
      </main>
      <nav className="tabbar">
        <a href="#/" className={page !== 'list' ? 'active' : ''}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z" /></svg>
          Recipes
        </a>
        <a href="#/list" className={page === 'list' ? 'active' : ''}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h1M9 7h10M5 12h1M9 12h10M5 17h1M9 17h10" /></svg>
          Shopping list{listCount > 0 && <span className="badge">{listCount}</span>}
        </a>
      </nav>
    </>
  );
}
