import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperStatus } from '../src/helper/manager.js';
import { expect, it } from 'vitest';
import { isReadOnlyGitProbeArgv, RemoteGitProbeFailureCircuit } from '../src/git-probe-circuit.js';

const cwd = 'ssh://host/project';
const argv = ['git', 'rev-parse', 'HEAD'];
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function pending() {
  let resolve!: (outcome: SubprocessOutcome) => void;
  const done = new Promise<SubprocessOutcome>(r => { resolve = r; });
  return { handle: { done } as SubprocessHandle, resolve };
}

it('does not treat symbolic-ref mutation or file output as a read-only probe', () => {
  for (const command of [
    ['git', 'symbolic-ref', 'HEAD', 'refs/heads/other'],
    ['git', 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD'],
    ['git', 'diff', '--output=report.patch'],
    ['git', 'diff', '--out=report.patch'],
    ['git', 'log', '--output', 'report.txt'],
  ]) expect(isReadOnlyGitProbeArgv(command), command.join(' ')).toBe(false);
});

it('uses a two-second default even without a helper recovery notification', () => {
  let now = 0;
  const circuit = new RemoteGitProbeFailureCircuit(undefined, () => now);
  circuit.begin(cwd, argv)?.('open');
  now = 1_999; expect(() => circuit.begin(cwd, argv)).toThrow();
  now = 2_000; expect(() => circuit.begin(cwd, argv)).not.toThrow();
});

it('does not let an old failure re-block a newer successful probe', async () => {
  const circuit = new RemoteGitProbeFailureCircuit();
  const old = pending(), fresh = pending();
  circuit.observe(circuit.begin(cwd, argv), old.handle);
  circuit.observe(circuit.begin(cwd, argv), fresh.handle);
  fresh.resolve({ exitCode: 0, signal: null }); await settle();
  old.resolve({ exitCode: 255, signal: null }); await settle();
  expect(() => circuit.begin(cwd, argv)).not.toThrow();
});

it('does not open on an aborted process that eventually exits 255', async () => {
  const circuit = new RemoteGitProbeFailureCircuit();
  const controller = new AbortController(), process = pending();
  circuit.observe(circuit.begin(cwd, argv), process.handle, controller.signal);
  controller.abort();
  process.resolve({ exitCode: 255, signal: null }); await settle();
  expect(() => circuit.begin(cwd, argv)).not.toThrow();
});

it('does not block a different workspace on the same SSH host', () => {
  const circuit = new RemoteGitProbeFailureCircuit();
  circuit.begin(cwd, argv)?.('open');
  expect(() => circuit.begin('ssh://host/other-project', argv)).not.toThrow();
});

it('clears on reconnection without letting old handles reopen it', async () => {
  let status: RemoteHelperStatus = { alias: 'host', state: 'connected', attempt: 0, sessionId: 'one', lastConnectedAt: 10 };
  const circuit = new RemoteGitProbeFailureCircuit(2_000, () => 100, () => status);
  const old = pending();
  const failure = circuit.begin(cwd, argv);
  circuit.observe(circuit.begin(cwd, argv), old.handle);
  failure?.('open');
  circuit.connectionChanged({ ...status, lastHealthAt: 20 });
  expect(() => circuit.begin(cwd, argv)).toThrow(/suppressed/u);
  circuit.connectionChanged({ ...status, state: 'reconnecting' });
  status = { ...status, lastConnectedAt: 30 };
  circuit.connectionChanged(status);
  expect(() => circuit.begin(cwd, argv)).not.toThrow();
  old.resolve({ exitCode: 255, signal: null }); await settle();
  expect(() => circuit.begin(cwd, argv)).not.toThrow();
});

it('recognizes resumed connections with the same session and timestamp, not normal health refresh', () => {
  const status: RemoteHelperStatus = { alias: 'host', state: 'degraded', attempt: 0, sessionId: 'resumed', lastConnectedAt: 10 };
  const circuit = new RemoteGitProbeFailureCircuit(2_000, () => 100, () => status);
  circuit.begin(cwd, argv)?.('open');
  circuit.connectionChanged({ ...status, state: 'connected' });
  expect(() => circuit.begin(cwd, argv)).toThrow();
  circuit.connectionChanged({ ...status, state: 'connecting' });
  circuit.connectionChanged(status);
  expect(() => circuit.begin(cwd, argv)).not.toThrow();
});

it('ignores another alias recovering and a stale successful result after a newer failure', () => {
  const circuit = new RemoteGitProbeFailureCircuit();
  const old = circuit.begin(cwd, argv), newer = circuit.begin(cwd, argv);
  newer?.('open'); old?.('healthy');
  circuit.connectionChanged({ alias: 'other', state: 'connected', attempt: 0 });
  expect(() => circuit.begin(cwd, argv)).toThrow();
});

it('keeps explicit user/port routes separate from a helper alias recovery', () => {
  const circuit = new RemoteGitProbeFailureCircuit();
  circuit.begin('ssh://user@host:2222/project', argv)?.('open');
  circuit.connectionChanged({ alias: 'host', state: 'connected', attempt: 0 });
  expect(() => circuit.begin('ssh://user@host:2222/project', argv)).toThrow();
  expect(() => circuit.begin(cwd, argv)).not.toThrow();
});

it('skips ambiguous wrappers and custom executable names', () => {
  for (const command of [
    ['/bin/echo', '/node_modules/dsh-sandbox-windows-acl/lib/runner.js', '--', 'git', 'status'],
    ['git.exe', 'status'], ['/opt/git.EXE', 'status'], ['Git', 'status'],
    ['git', '-c', 'alias.status=!touch file', 'status'],
    ['git', 'config', '--file', '--get', 'user.name', 'Changed'],
    ['git', 'hash-object', '-wt', 'blob', 'file'],
  ]) expect(isReadOnlyGitProbeArgv(command), command.join(' ')).toBe(false);
});
