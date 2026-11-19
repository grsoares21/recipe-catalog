// Builds compact per-100g nutrition tables from TACO (Brazil) and USDA SR Legacy.
// Usage: node scripts/build-nutrition-db.mjs <taco.xlsx> <sr_legacy_csv_dir>
// Sources:
//   TACO 4a edição (NEPA/Unicamp): https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/Taco-4a-Edicao.xlsx
//   USDA FoodData Central SR Legacy: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const [tacoPath, srDir] = process.argv.slice(2);
const out = path.resolve('data/nutrition');
fs.mkdirSync(out, { recursive: true });

const num = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : 0); // "NA"/"Tr" -> 0

// TACO: columns 0 id, 1 name, 3 kcal, 5 protein, 6 fat, 8 carbs, 9 fiber, 17 sodium (mg)
const sheet = XLSX.readFile(tacoPath).Sheets['CMVCol taco3'];
const taco = {};
for (const r of XLSX.utils.sheet_to_json(sheet, { header: 1 })) {
  if (typeof r[0] !== 'number' || typeof r[1] !== 'string') continue;
  taco[`taco:${r[0]}`] = { name: r[1].trim(), kcal: num(r[3]), protein: num(r[5]), fat: num(r[6]), carbs: num(r[8]), fiber: num(r[9]), sodium: num(r[17]) };
}

// Minimal CSV parser for USDA's fully-quoted files.
function* csv(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const head = JSON.parse(`[${lines[0]}]`);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.match(/"((?:[^"]|"")*)"/g).map((c) => c.slice(1, -1).replace(/""/g, '"'));
    yield Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  }
}

const NUTRIENTS = { 1008: 'kcal', 1003: 'protein', 1004: 'fat', 1005: 'carbs', 1079: 'fiber', 1093: 'sodium' };
const usda = {};
for (const f of csv(path.join(srDir, 'food.csv'))) {
  usda[`usda:${f.fdc_id}`] = { name: f.description, kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sodium: 0, portions: {} };
}
for (const n of csv(path.join(srDir, 'food_nutrient.csv'))) {
  const key = NUTRIENTS[n.nutrient_id];
  const food = usda[`usda:${n.fdc_id}`];
  if (key && food) food[key] = num(Number(n.amount));
}
// Household portions (e.g. "1 cup" -> grams) give densities for volume units.
for (const p of csv(path.join(srDir, 'food_portion.csv'))) {
  const food = usda[`usda:${p.fdc_id}`];
  const label = `${p.amount} ${p.modifier}`.trim();
  if (food && p.gram_weight) food.portions[label] = num(Number(p.gram_weight));
}

fs.writeFileSync(path.join(out, 'taco.json'), JSON.stringify(taco));
fs.writeFileSync(path.join(out, 'usda.json'), JSON.stringify(usda));
console.log(`TACO: ${Object.keys(taco).length} foods, USDA: ${Object.keys(usda).length} foods`);
