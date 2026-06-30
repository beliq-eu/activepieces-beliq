import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Assemble the publishable package in dist/. Activepieces' engine loads a
// community piece from `<package>/src/index.js`, so the published package root
// must expose `src/index.js`. tsc emits the compiled code to dist/src/, and
// this writes a dist/package.json whose entry points there.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const published = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  keywords: pkg.keywords,
  license: pkg.license,
  homepage: pkg.homepage,
  author: pkg.author,
  repository: pkg.repository,
  main: './src/index.js',
  engines: pkg.engines,
  files: ['src'],
  publishConfig: pkg.publishConfig,
  dependencies: pkg.dependencies,
};

writeFileSync(join(dist, 'package.json'), JSON.stringify(published, null, 2) + '\n');
for (const file of ['README.md', 'LICENSE']) {
  copyFileSync(join(root, file), join(dist, file));
}
