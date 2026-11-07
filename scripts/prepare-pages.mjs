import { copyFileSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.local/pages-release');
if (!existsSync(resolve(output, 'index.html'))) throw new Error('Build the browser demo before preparing Pages.');
copyFileSync(resolve(root, 'docs/preview.html'), resolve(output, 'gallery.html'));
cpSync(resolve(root, 'docs/screenshots'), resolve(output, 'screenshots'), { recursive: true });
writeFileSync(resolve(output, '.nojekyll'), '');
console.log('Browser demo and synthetic screenshot gallery: .local/pages-release');
