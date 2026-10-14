import { build, context } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
await mkdir('dist', { recursive: true });
await mkdir('licenses', { recursive: true });
for (const name of ['web-tree-sitter','sql.js','tree-sitter-wasms']) await copyFile(require.resolve(`${name}/LICENSE`),path.join('licenses',`${name}.txt`));
for (const [source, target] of [
  ['web-tree-sitter/tree-sitter.wasm', 'tree-sitter.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-python.wasm', 'tree-sitter-python.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-html.wasm', 'tree-sitter-html.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-javascript.wasm', 'tree-sitter-javascript.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-typescript.wasm', 'tree-sitter-typescript.wasm'],
  ['tree-sitter-wasms/out/tree-sitter-tsx.wasm', 'tree-sitter-tsx.wasm'],
  ['sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm'],
]) await copyFile(require.resolve(source), path.join('dist', target));
const options = { entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', bundle: true, platform: 'node', format: 'cjs', target: 'node18', external: ['vscode'], sourcemap: false, logLevel: 'info' };
await build({ ...options, entryPoints: ['src/core.ts'], outfile: 'dist/core.cjs' });
if (process.argv.includes('--watch')) { const ctx = await context(options); await ctx.watch(); } else await build(options);
