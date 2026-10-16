import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const documents = ['README.md', 'README.en.md', 'CHANGELOG.md', 'docs/TECHNICAL.md', 'docs/TROUBLESHOOTING.md', 'docs/RELEASING.md'];
for (const name of documents) {
  const content = await readFile(resolve(root, name), 'utf8');
  for (const [, target] of content.matchAll(/\]\(([^\s)]+)\)/gu)) {
    if (/^(?:[a-z]+:|#)/iu.test(target)) continue;
    await access(resolve(root, dirname(name), decodeURIComponent(target.split('#')[0])));
  }
  if (name.startsWith('README')) {
    assert(content.includes(`/releases/download/v${manifest.version}/${manifest.name}-${manifest.version}.tgz`));
    assert(content.includes(`github:CrazyShout/dsh-ssh-remote#v${manifest.version}`));
    assert(content.indexOf(name.endsWith('.en.md') ? '## Install' : '## 安装') < 2000, 'Installation must stay near the top');
  }
}
console.log('Documentation versions and local links verified.');
