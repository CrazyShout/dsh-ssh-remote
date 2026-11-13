import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess';
import { describe, expect, it, vi } from 'vitest';
import {
  isReadOnlyGitProbeArgv,
  RemoteGitProbeCooldownError,
  RemoteGitProbeFailureCircuit,
} from '../src/git-probe-circuit.js';

function handle(outcome: Promise<SubprocessOutcome>): SubprocessHandle {
  return {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    control: undefined,
    collected: {},
    done: outcome,
    terminate: vi.fn(),
    waitForExit: vi.fn(async () => true),
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('remote Git probe failure circuit', () => {
  const cwd = 'ssh://gpu/home/atlas/project';

  it.each([
    ['git', 'rev-parse', 'HEAD'],
    ['C:\\Program Files\\Git\\cmd\\git.EXE', '--no-optional-locks', 'rev-parse', '--show-toplevel'],
    ['git', '-C', '/repo', 'status', '--short'],
    ['git', '-C', 'remote', 'remote', '-v'],
    ['git', '-c', 'core.quotePath=false', 'diff', '--stat'],
    ['git', 'remote', '-v'],
    ['git', 'remote', 'get-url', 'origin'],
    ['git', 'config', '--null', '--name-only', '--get-regexp', '^filter\\.'],
    ['git', 'hash-object', '-t', 'tree', '--stdin'],
  ])('recognizes a read-only Git probe: %j', (...argv) => {
    expect(isReadOnlyGitProbeArgv(argv)).toBe(true);
  });

  it.each([
    [
      'C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe',
      'C:\\app\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js',
      '--workspace', 'C:\\anchor',
      '--mode', 'workspace-write',
      '--', 'C:\\Program Files\\Git\\cmd\\git.EXE', 'rev-parse', 'HEAD',
    ],
    ['bwrap', '--ro-bind', '/', '/', '--dev', '/dev', '--', 'git', 'rev-parse', 'HEAD'],
    ['sandbox-exec', '-p', '(version 1)', '--', 'git', 'status', '--short'],
  ])('recognizes Git inside a sandbox: %j', (...argv) => {
    expect(isReadOnlyGitProbeArgv(argv)).toBe(true);
  });

  it.each([
    ['git', 'commit', '-m', 'message'],
    ['git', 'remote', 'add', 'upstream', 'https://example.invalid/repo.git'],
    ['git', 'config', 'user.name', 'Changed'],
    ['git', 'hash-object', '-w', 'file'],
    ['rg', 'rev-parse'],
    ['/usr/bin/not-git', 'status'],
  ])('does not classify a mutating or unrelated command: %j', (...argv) => {
    expect(isReadOnlyGitProbeArgv(argv)).toBe(false);
  });

  it.each([127, 255])('opens after exit %i and allows one probe after the cooldown', async exitCode => {
    let now = 1_000;
    const circuit = new RemoteGitProbeFailureCircuit(30_000, () => now);
    const first = handle(Promise.resolve({ exitCode, signal: null }));
    circuit.assertAllowed(cwd, ['git', 'rev-parse', 'HEAD']);
    circuit.observe(cwd, ['git', 'rev-parse', 'HEAD'], first);
    await first.done;
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'status', '--short']))
      .toThrow(RemoteGitProbeCooldownError);
    now += 29_999;
    expect(() => circuit.assertAllowed(cwd, ['git', 'status', '--short'])).toThrow(/suppressed/u);
    now += 1;
    expect(() => circuit.assertAllowed(cwd, ['git', 'status', '--short'])).not.toThrow();
  });

  it('keeps expected Git exits and unrelated hosts outside the circuit', async () => {
    const circuit = new RemoteGitProbeFailureCircuit(30_000, () => 1_000);
    const expected = handle(Promise.resolve({ exitCode: 128, signal: null }));
    circuit.observe(cwd, ['git', 'rev-parse', 'HEAD'], expected);
    await expected.done;
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'rev-parse', 'HEAD'])).not.toThrow();
    expect(() => circuit.assertAllowed('ssh://other/home/atlas/project', ['git', 'status'])).not.toThrow();
  });

  it('opens after a transport launch failure', async () => {
    const circuit = new RemoteGitProbeFailureCircuit(30_000, () => 1_000);
    const failure = Object.assign(new Error('ssh spawn failed'), { code: 'ENOENT' });
    const failed = handle(Promise.reject(failure));
    circuit.observe(cwd, ['git', 'log', '-1'], failed);
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'log', '-1'])).toThrow(/SSH or executable failure/u);
  });

  it('does not open or clear for cancellation and generic teardown errors', async () => {
    const circuit = new RemoteGitProbeFailureCircuit(30_000, () => 1_000);
    const aborted = new AbortController();
    aborted.abort();
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError', code: 'ABORT_ERR' });
    const cancelled = handle(Promise.reject(abortError));
    circuit.observe(cwd, ['git', 'status'], cancelled, aborted.signal);
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'status'])).not.toThrow();
    const teardown = handle(Promise.reject(new Error('provider disposed')));
    circuit.observe(cwd, ['git', 'log', '-1'], teardown);
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'log', '-1'])).not.toThrow();

    const failed = handle(Promise.resolve({ exitCode: 127, signal: null }));
    circuit.observe(cwd, ['git', 'rev-parse', 'HEAD'], failed);
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'status'])).toThrow(/suppressed/u);
    circuit.observe(cwd, ['git', 'status'], cancelled, aborted.signal);
    circuit.observe(cwd, ['git', 'log', '-1'], teardown);
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'status'])).toThrow(/suppressed/u);
  });

  it('clears an open circuit after an in-flight probe succeeds', async () => {
    const circuit = new RemoteGitProbeFailureCircuit(30_000, () => 1_000);
    const failed = handle(Promise.resolve({ exitCode: 127, signal: null }));
    circuit.observe(cwd, ['git', 'rev-parse', 'HEAD'], failed);
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'status'])).toThrow(/suppressed/u);
    const success = handle(Promise.resolve({ exitCode: 0, signal: null }));
    circuit.observe(cwd, ['git', 'status'], success);
    await success.done;
    await settle();
    expect(() => circuit.assertAllowed(cwd, ['git', 'remote', '-v'])).not.toThrow();
  });

  it('bounds retained host circuits', () => {
    const circuit = new RemoteGitProbeFailureCircuit(30_000, () => 1_000);
    for (let index = 0; index < 65; index += 1) {
      circuit.recordFailure(`ssh://host-${index}/repo`, ['git', 'status']);
    }
    expect(() => circuit.assertAllowed('ssh://host-0/repo', ['git', 'status'])).not.toThrow();
    expect(() => circuit.assertAllowed('ssh://host-64/repo', ['git', 'status'])).toThrow(/suppressed/u);
  });
});
