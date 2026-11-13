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

  const argv = ['git', 'rev-parse', 'HEAD'];

  it.each([127, 255])('opens after exit %i and permits one recovery probe', async exitCode => {
    let now = 1_000;
    const circuit = new RemoteGitProbeFailureCircuit(2_000, () => now);
    const first = handle(Promise.resolve({ exitCode, signal: null }));
    circuit.observe(circuit.begin(cwd, argv), first);
    await first.done; await settle();
    expect(() => circuit.begin(cwd, argv)).toThrow(RemoteGitProbeCooldownError);
    now += 1_999;
    expect(() => circuit.begin(cwd, argv)).toThrow(/suppressed/u);
    now++;
    const retry = circuit.begin(cwd, argv);
    expect(retry).toBeTypeOf('function');
    expect(() => circuit.begin(cwd, argv)).toThrow(/still running/u);
    retry?.('healthy');
    expect(() => circuit.begin(cwd, argv)).not.toThrow();
  });

  it.each([0, 1, 128])('keeps ordinary Git exit %i outside the circuit', async exitCode => {
    const circuit = new RemoteGitProbeFailureCircuit();
    circuit.observe(circuit.begin(cwd, argv), handle(Promise.resolve({ exitCode, signal: null })));
    await settle();
    expect(() => circuit.begin(cwd, argv)).not.toThrow();
  });

  it('opens after a typed transport launch failure but not generic teardown', async () => {
    const circuit = new RemoteGitProbeFailureCircuit();
    circuit.observe(circuit.begin(cwd, argv), handle(Promise.reject(new Error('provider disposed'))));
    await settle();
    const failure = Object.assign(new Error('ssh spawn failed'), { code: 'ENOENT' });
    circuit.observe(circuit.begin(cwd, argv), handle(Promise.reject(failure)));
    await settle();
    expect(() => circuit.begin(cwd, argv)).toThrow(/SSH or executable failure/u);
    expect(() => circuit.begin('ssh://other/repo', argv)).not.toThrow();
  });

  it('neither opens nor clears an existing failure on cancellation or teardown', async () => {
    const circuit = new RemoteGitProbeFailureCircuit();
    const early = circuit.begin(cwd, argv);
    const cancelled = circuit.begin(cwd, argv);
    const teardown = circuit.begin(cwd, argv);
    early?.('open');
    const controller = new AbortController(); controller.abort();
    circuit.observe(cancelled, handle(Promise.resolve({ exitCode: 255, signal: null })), controller.signal);
    circuit.observe(teardown, handle(Promise.reject(new Error('provider disposed'))));
    await settle();
    expect(() => circuit.begin(cwd, argv)).toThrow(/suppressed/u);
    expect(circuit.begin(cwd, argv, undefined, controller.signal)).toBeUndefined();
  });

  it('clears an open circuit when a newer already-running probe succeeds', () => {
    const circuit = new RemoteGitProbeFailureCircuit();
    const failed = circuit.begin(cwd, argv), newer = circuit.begin(cwd, argv);
    failed?.('open');
    expect(() => circuit.begin(cwd, argv)).toThrow(/suppressed/u);
    newer?.('healthy');
    expect(() => circuit.begin(cwd, argv)).not.toThrow();
  });

  it('bounds retained entries and fences completions of evicted entries', () => {
    const circuit = new RemoteGitProbeFailureCircuit();
    const evicted = circuit.begin(cwd, argv);
    for (let index = 0; index < 65; index++) circuit.begin('ssh://host-' + index + '/repo', argv)?.('open');
    const replacement = circuit.begin(cwd, argv);
    evicted?.('open');
    expect(() => circuit.begin(cwd, argv)).not.toThrow();
    replacement?.('healthy');
    expect(() => circuit.begin('ssh://host-64/repo', argv)).toThrow(/suppressed/u);
  });

  it('does not extend a cooldown for late failures from the same burst', () => {
    let now = 0;
    const circuit = new RemoteGitProbeFailureCircuit(2_000, () => now);
    const a = circuit.begin(cwd, argv), b = circuit.begin(cwd, argv);
    a?.('open');
    now = 1_900; b?.('open');
    now = 2_000;
    expect(() => circuit.begin(cwd, argv)).not.toThrow();
  });

  it('releases a cancelled recovery slot without erasing the failure', () => {
    let now = 0;
    const circuit = new RemoteGitProbeFailureCircuit(2_000, () => now);
    circuit.begin(cwd, argv)?.('open'); now = 2_000;
    const cancelled = circuit.begin(cwd, argv);
    expect(() => circuit.begin(cwd, argv)).toThrow(/still running/u);
    cancelled?.('ignore');
    const retry = circuit.begin(cwd, argv);
    retry?.('open');
    expect(() => circuit.begin(cwd, argv)).toThrow(/suppressed/u);
  });

  it('keeps argv and environment changes independent and canonicalizes env order', () => {
    const circuit = new RemoteGitProbeFailureCircuit();
    circuit.begin(cwd, argv, { PATH: '/old', LANG: 'C' })?.('open');
    expect(() => circuit.begin(cwd, argv, { LANG: 'C', PATH: '/old' })).toThrow();
    expect(() => circuit.begin(cwd, argv, { PATH: '/new', LANG: 'C' })).not.toThrow();
    expect(() => circuit.begin(cwd, ['git', 'status'], { PATH: '/old', LANG: 'C' })).not.toThrow();
  });

  it('stops retaining outcomes after disposal', () => {
    const circuit = new RemoteGitProbeFailureCircuit();
    const late = circuit.begin(cwd, argv); circuit.dispose(); late?.('open');
    expect(circuit.begin(cwd, argv)).toBeUndefined();
  });
});
