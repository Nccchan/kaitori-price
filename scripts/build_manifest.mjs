import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'images');

const CATS = {
  pokemon: path.join(IMAGES, 'pokemon'),
  onepiece: path.join(IMAGES, 'onepiece'),
  dragonball: path.join(IMAGES, 'dragonball'),
};

const EXTS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.svg']);
const RANK = { '.webp': 0, '.png': 1, '.jpg': 2, '.jpeg': 3, '.svg': 4 };

async function listFiles(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function buildManifest() {
  const out = { pokemon: {}, onepiece: {}, dragonball: {} };
  const bestRank = { pokemon: {}, onepiece: {}, dragonball: {} };

  for (const [cat, dir] of Object.entries(CATS)) {
    const ents = await listFiles(dir);
    for (const ent of ents) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!EXTS.has(ext)) continue;
      const base = path.basename(ent.name, ext);
      const rank = RANK[ext] ?? 999;
      const prev = bestRank[cat][base];
      if (prev == null || rank < prev) {
        bestRank[cat][base] = rank;
        out[cat][base] = `./images/${cat}/${ent.name}`;
      }
    }
  }

  const dest = path.join(IMAGES, 'manifest.json');
  await writeFile(dest, JSON.stringify(out, null, 2) + '\n', 'utf8');
  process.stdout.write(`wrote ${dest}\n`);
}

// CLI
if (process.argv[1] && process.argv[1].endsWith(path.join('scripts', 'build_manifest.mjs'))) {
  await buildManifest();
}
