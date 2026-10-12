import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const probe = fileURLToPath(new URL('./fixtures/helper_concurrency.py', import.meta.url));

describe('helper concurrent resource lifetimes', () => {
  it.each([
    'read-close-explicit', 'read-close-session', 'read-close-cached', 'workspace-borrow',
  ])('%s', scenario => {
    const result = spawnSync('python3', [probe, helper, scenario], {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    expect(result.status, result.stderr || String(result.error)).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ case: scenario, passed: true });
  }, 20_000);
});
