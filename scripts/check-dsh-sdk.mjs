import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the release build pinned to the oldest supported SDK. Test newer SDKs
// in a disposable source copy rather than rewriting the developer's lockfile.
const version = process.argv[2];
assert(['0.2.0-rc.2', '0.2.1-rc.2'].includes(version), 'Specify an explicitly supported DSH SDK');
const source = fileURLToPath(new URL('../', import.meta.url));
const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-sdk-check-')));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: source, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  if (file === 'package-lock.json') continue;
  mkdirSync(dirname(join(root, file)), { recursive: true });
  copyFileSync(join(source, file), join(root, file));
}
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const name of Object.keys(manifest.devDependencies)) {
  if (name.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[name] = version;
}
writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
console.log(`DSH SDK ${version}: isolated source at ${root}`);
const commands = [
  ['npm', ['install', '--no-audit', '--no-fund']],
  [process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--noEmit']],
  [process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.client.json', '--noEmit']],
  ['npm', ['test', '--', '--maxWorkers=1', '--minWorkers=1']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, DSH_TEST_SDK_VERSION: version }, stdio: 'inherit' });
  assert.equal(result.status, 0, `SDK ${version}: ${command} ${args.join(' ')} failed; retained ${root}`);
}
console.log(`DSH SDK ${version}: Host/Client types and full regression suite passed; evidence retained at ${root}`);
