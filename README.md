# Recipe catalog

A personal list of recipes saved from public Instagram reels, packaged as a small web app I use on my phone. Each recipe has a photo, a link to the original reel, ingredients, a method and an estimate of its nutrition. Recipes can be added to a shopping list that merges shared ingredients.

**This is a personal bookmark list, not a recipe site.** Every recipe belongs to its creator and links back to the original reel. Please go watch, follow and support them there. Ingredients and steps are summarised and translated into English for my own cooking. If you're a creator and want your recipe removed, open an issue and I'll remove it.

## What's in the repo (and what isn't)

- Only public information about each reel: its link, the creator's public username, a small thumbnail, and the recipe written up in my own words.
- No personal data: no messages, no names of who shared what, no dates, no account details.
- The shopping list and ticked items are stored only in the browser on my phone (`localStorage`). They never reach this repo.

## How it works

```
data/
  ingredients.json      ingredient catalog: one id per ingredient, shared by all recipes
  recipes/<reel-id>.json  one file per recipe
  nutrition/            per-100 g nutrition tables (TACO and USDA), built by a script
public/photos/          480 px thumbnails, one per recipe
scripts/                data tools (see below)
src/                    the app (React + Vite)
```

`npm run build` validates the data, writes `public/catalog.json` and builds the app into `dist/`. Every push to `main` deploys it to GitHub Pages with `.github/workflows/deploy.yml`.

### Shared ingredients

Every ingredient line points to an id in `data/ingredients.json`, so "egg" is the same `egg` in every recipe. That is what lets the shopping list merge ingredients across recipes (amounts are summed when the units can be converted) and lets the catalog filter recipes by ingredient. Country-specific ingredients keep their local name, like *Requeijão* or *Polvilho azedo*, with a short English description.

### Nutrition

If the creator published nutrition, the app shows it. Otherwise it's estimated: each ingredient is linked to an entry in a food composition table, amounts are converted to grams (volume units use the ingredient's density), summed and divided by the number of servings. The app always labels which kind it is.

- [TACO, 4th edition](https://nepa.unicamp.br/publicacoes/tabelas-de-composicao-de-alimentos/) (NEPA/Unicamp) for Brazilian ingredients
- [USDA FoodData Central, SR Legacy](https://fdc.nal.usda.gov/) for everything else

Rebuild the tables with `node scripts/build-nutrition-db.mjs <taco.xlsx> <sr-legacy-csv-dir>`, and look up entries with `node scripts/find-food.mjs "cream cheese"`.

### Adding a recipe

1. `scripts/fetch-reel.sh <reel-url> <work-dir>` downloads the reel **logged out** (no cookies or account), saves its thumbnail, transcribes the audio and saves a strip of frames, then deletes the video. It needs `brew install yt-dlp ffmpeg whisper-cpp` and a Whisper model in `WHISPER_MODEL`.
2. Write `data/recipes/<reel-id>.json` from the caption, transcript and frames, adding any new ingredients to `data/ingredients.json`.
3. `scripts/add-photo.sh <thumbnail.jpg> <reel-id>`
4. `npm run catalog` to validate and check the nutrition, then commit and push.

Recipes marked `incomplete` had something reconstructed from the video (e.g. the creator only sends the method by DM). Amounts marked `assumed` weren't given by the creator, so they're estimates and are shown with ≈.

## Development

```sh
npm install
npm run dev
```

## Installing on an iPhone

Open the GitHub Pages URL in Safari, tap Share → **Add to Home Screen**. It opens full-screen and works offline after the first visit.
