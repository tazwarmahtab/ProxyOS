import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');

const dirsToClean = [
  'apps/web/.next',
  'apps/web/node_modules',
  'apps',
  'packages',
  'node_modules/.cache',
  '.next',
];

for (const dir of dirsToClean) {
  const fullPath = join(root, dir);
  if (existsSync(fullPath)) {
    try {
      rmSync(fullPath, { recursive: true, force: true });
      console.log(`Cleaned: ${dir}`);
    } catch (err) {
      console.log(`Could not clean ${dir}: ${err.message}`);
    }
  } else {
    console.log(`Skipped (not found): ${dir}`);
  }
}

console.log('Done! Project is clean.');
