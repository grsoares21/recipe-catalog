// Searches the nutrition tables, to pick a nutritionRef for an ingredient.
// Usage: node scripts/find-food.mjs "cream cheese" "requeij" ...
import fs from 'node:fs';

const tables = ['taco', 'usda'].map((t) => JSON.parse(fs.readFileSync(`data/nutrition/${t}.json`, 'utf8')));
for (const q of process.argv.slice(2)) {
  const words = q.toLowerCase().split(/\s+/);
  console.log(`== ${q}`);
  for (const table of tables) {
    const hits = Object.entries(table).filter(([, f]) => words.every((w) => f.name.toLowerCase().includes(w)));
    for (const [id, f] of hits.slice(0, 6)) console.log(`  ${id.padEnd(12)} ${f.name.slice(0, 70).padEnd(70)} ${f.kcal} kcal`);
  }
}
