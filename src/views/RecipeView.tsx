import { useState } from 'react';
import type { Catalog, Recipe } from '../types';
import { formatAmount, scaleLine, type Selection } from '../shopping';

interface Props {
  recipe: Recipe;
  catalog: Catalog;
  selection: Selection;
  setSelection: (s: Selection) => void;
}

export default function RecipeView({ recipe: r, catalog, selection, setSelection }: Props) {
  const inList = selection[r.id];
  const [servings, setServings] = useState(inList ?? r.servings);
  const factor = servings / r.servings;
  const n = r.nutrition;

  const changeServings = (next: number) => {
    const s = Math.max(1, next);
    setServings(s);
    if (inList) setSelection({ ...selection, [r.id]: s });
  };
  const toggleList = () => {
    const next = { ...selection };
    if (inList) delete next[r.id];
    else next[r.id] = servings;
    setSelection(next);
  };

  return (
    <article className="page recipe">
      <a href="#/" className="back">‹ Recipes</a>
      <img className="hero" src={r.photo} alt="" />
      <h1>{r.title}</h1>
      <p className="meta">
        <a href={r.reelUrl} target="_blank" rel="noreferrer">@{r.creator} on Instagram ↗</a>
        {r.sourceUrl && <> · <a href={r.sourceUrl} target="_blank" rel="noreferrer">written recipe ↗</a></>}
      </p>
      {r.status === 'incomplete' && <p className="notice">{r.statusNote ?? 'Some details are missing from this recipe.'}</p>}

      {r.kind === 'recipe' && (
        <div className="row">
          <div className="stepper" aria-label="Servings">
            <button onClick={() => changeServings(servings - 1)} aria-label="Fewer servings">−</button>
            <span>{servings} {servings === 1 ? 'serving' : 'servings'}{r.servingsEstimated && servings === r.servings ? ' (est.)' : ''}</span>
            <button onClick={() => changeServings(servings + 1)} aria-label="More servings">+</button>
          </div>
          <button className={`primary ${inList ? 'done' : ''}`} onClick={toggleList}>
            {inList ? '✓ In shopping list' : 'Add to shopping list'}
          </button>
        </div>
      )}
      {r.yield && <p className="meta">Makes {r.yield}</p>}

      {n && (
        <section className="nutrition">
          <div><strong>{n.kcal}</strong><span>kcal</span></div>
          <div><strong>{n.protein} g</strong><span>protein</span></div>
          <div><strong>{n.carbs} g</strong><span>carbs</span></div>
          <div><strong>{n.fat} g</strong><span>fat</span></div>
          <p>
            Per serving · {n.source === 'creator' ? `from the creator${r.creatorNutrition ? ` (per ${r.creatorNutrition.per})` : ''}` : 'estimated from the ingredients'}
            {n.missing.length > 0 && ` · not counted: ${n.missing.join(', ')}`}
          </p>
        </section>
      )}

      <h2>Ingredients</h2>
      {r.ingredientGroups.map((g, i) => (
        <section key={i}>
          {g.name && <h3>{g.name}</h3>}
          <ul className="ingredients">
            {g.items.map((raw, j) => {
              const line = scaleLine(raw, factor);
              const ing = catalog.ingredients[line.ingredient];
              return (
                <li key={j}>
                  <span className="amount">{line.assumed ? '≈ ' : ''}{formatAmount(line.amount, line.unit)}</span>
                  <span>
                    {ing.name}
                    {ing.description && <small> ({ing.description})</small>}
                    {line.note && <small>, {line.note}</small>}
                    {line.optional && <small> (optional)</small>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {r.ingredientGroups.some((g) => g.items.some((i) => i.assumed)) && (
        <p className="meta">≈ The creator didn't give this amount. It's an estimate.</p>
      )}

      <h2>{r.kind === 'tip' ? 'How to' : 'Method'}</h2>
      <ol className="steps">
        {r.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {r.notes && <p className="notes">{r.notes}</p>}
    </article>
  );
}
