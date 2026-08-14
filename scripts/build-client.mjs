#!/usr/bin/env node
/**
 * Client bundle build: emits the closure-factory artifact the DSH web loader
 * consumes — `window.__ModuleLoader__.load({ id, factory: (require) => {
 * ... return module.exports; } })`. Externals resolve through the loader
 * module table; everything else inlines. The web shell serves this artifact
 * at `/plugins/<id>/client.js` and executes it as a CLASSIC <script>, so the
 * emitted text must contain NO `import.meta` and no top-level ESM statements.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const ID = 'dsh-ssh-remote';
const ENTRY = 'client/index.tsx';
const OUT_FILE = 'lib/client.js';

/** Loader module table (platform seed entries + runtime/client exemption). */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
];

const result = await build({
  entryPoints: [ENTRY],
  outfile: OUT_FILE,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
});

if (result.errors.length > 0) {
  throw new Error(`client bundle build failed:\n${result.errors.map((e) => e.text).join('\n')}`);
}

const text = readFileSync(OUT_FILE, 'utf8');
if (!text.includes('window.__ModuleLoader__.load(') || !text.includes(JSON.stringify(ID))) {
  throw new Error('client bundle contract: closure-factory load handoff with the plugin id is missing');
}
if (text.includes('import.meta') || /(^|\n)\s*(import|export)\s/.test(text)) {
  throw new Error('client bundle contract: emitted bundle contains import.meta / ESM statements');
}

// Flat type re-export the loader-facing `exports["./client"].types` points at.
writeFileSync('lib/client.d.ts', `export * from './client/index.js';\n`);
console.log(`built ${OUT_FILE} (closure-factory, id=${ID}, ${text.length} bytes) + lib/client.d.ts`);
