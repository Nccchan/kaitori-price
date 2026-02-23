#!/usr/bin/env node
/**
 * images/ フォルダをスキャンして manifest.json を自動生成します。
 * 使い方: node scripts/update-manifest.mjs
 *
 * 同名ファイルが複数形式ある場合の優先順位: png > webp > svg
 */

import { readdirSync, writeFileSync } from 'fs';
import { extname, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'images');
const MANIFEST_PATH = join(IMAGES_DIR, 'manifest.json');

const CATEGORIES = ['pokemon', 'onepiece', 'dragonball'];
const EXT_PRIORITY = ['.png', '.webp', '.svg'];
const ALLOWED_EXTS = new Set(EXT_PRIORITY);

function scanCategory(category) {
  const dir = join(IMAGES_DIR, category);
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    console.warn(`  ⚠ ${category}/ フォルダが見つかりません`);
    return {};
  }

  // key → { ext, priority } の形で最優先ファイルを選ぶ
  const best = {};
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    const key = basename(file, ext);
    const priority = EXT_PRIORITY.indexOf(ext);
    if (!(key in best) || priority < best[key].priority) {
      best[key] = { ext, priority };
    }
  }

  // ソートしてオブジェクト化
  const result = {};
  for (const key of Object.keys(best).sort()) {
    result[key] = `./images/${category}/${key}${best[key].ext}`;
  }
  return result;
}

const manifest = {};
for (const cat of CATEGORIES) {
  manifest[cat] = scanCategory(cat);
  const count = Object.keys(manifest[cat]).length;
  console.log(`  ${cat}: ${count} 件`);
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n✓ manifest.json を更新しました: ${MANIFEST_PATH}`);
