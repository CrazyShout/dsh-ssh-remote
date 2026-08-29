import { createInterface } from 'node:readline';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeProcess from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));

class RpcClient {
  readonly child: ChildProcessWithoutNullStreams;
  readonly hello: Promise<Record<string, unknown>>;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  private resolveHello!: (value: Record<string, unknown>) => void;
  private rejectHello!: (error: Error) => void;
  private helloSettled = false;
  private stderr = '';

  constructor(options: { direct?: boolean; runtimeDir?: string; extraEnv?: Record<string, string> } = {}) {
    this.hello = new Promise((resolve, reject) => { this.resolveHello = resolve; this.rejectHello = reject; });
    const args = [helper, 'connect', '--stdio'];
    if (options.direct !== false) args.push('--direct');
    this.child = spawn('python3', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.extraEnv, DSH_REMOTE_HELPER_RUNTIME_DIR: options.runtimeDir,
        DSH_REMOTE_HELPER_ALLOW_SHUTDOWN: options.runtimeDir ? '1' : undefined },
    });
    this.child.stderr.on('data', (chunk) => { this.stderr += String(chunk); });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const message = JSON.parse(line) as any;
      if (message.method === 'server/hello') {
        this.helloSettled = true;
        this.resolveHello(message.params);
        return;
      }
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) {
        const error = Object.assign(new Error(message.error.message), { code: message.error.code });
        waiter.reject(error);
      } else {
        waiter.resolve(message.result);
      }
    });
    this.child.on('exit', (code) => {
      if (!this.helloSettled) this.rejectHello(new Error(`helper exited ${code}: ${this.stderr}`));
      for (const waiter of this.pending.values()) {
        waiter.reject(new Error(`helper exited ${code}: ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.child.stdin.write(`${JSON.stringify({ dshRpc: '1', id, method, params })}\n`);
    return response;
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => this.child.once('exit', () => resolve()));
    this.child.stdin.end();
    await exited;
  }
}

const clients: RpcClient[] = [];
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('Python remote helper v1', () => {
  it('enforces daemon session and connector ceilings without allocating resources past the limit', () => {
    const program = [
      'import importlib.util,json,sys',
      'spec=importlib.util.spec_from_file_location("dsh_helper",sys.argv[1])',
      'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)',
      'state=m.DaemonState(600)',
      'opened=[state.open_connection() for _ in range(m.MAX_CONNECTIONS+1)]',
      'error=None',
      'for_i=range(m.MAX_SESSIONS)',
      'servers=[state.acquire({"clientId":f"client-{i}"}) for i in for_i]',
      'try:\n state.acquire({"clientId":"client-overflow"})\nexcept m.RpcError as exc:\n error=exc.code',
      'print(json.dumps({"connections":opened,"sessions":len(state.sessions),"error":error}))',
      '[server.close() for server in servers]',
    ].join('\n');
    const result = spawnSync('python3', ['-c', program, helper], {
      encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    expect(result.status, result.stderr).toBe(0);
    const observed = JSON.parse(result.stdout);
    expect(observed.connections.slice(0, -1).every((value: boolean) => value)).toBe(true);
    expect(observed.connections.at(-1)).toBe(false);
    expect(observed).toMatchObject({ sessions: 16, error: 'E_RESOURCE_LIMIT' });
  });

  it('serves bounded JSONL and performs confined, version-guarded file operations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-helper-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'dsh-helper-outside-'));
    temporary.push(root, outside);
    const rpc = new RpcClient();
    clients.push(rpc);

    const hello = await rpc.hello;
    expect(hello).toMatchObject({ protocol: { min: 1, max: 1 }, limits: {
      maxFrameBytes: 1_048_576, maxSessions: 16, maxConnections: 64,
      maxProcesses: 32, maxProcessOutputBytes: 2 * 1024 * 1024,
    } });
    const initialized = await rpc.request('initialize', {
      clientId: 'vitest', protocol: { min: 1, max: 1 },
    });
    expect(initialized.capabilities.filesystem).toMatchObject({
      confinement: 'dirfd-no-follow',
      guardedWrite: { helperLinearizable: true, externalWriterRaceFree: false },
    });
    await expect(rpc.request('health/ping', { nonce: 'n1' })).resolves.toEqual({ nonce: 'n1', ok: true });

    const openWorkspace = { path: root, access: 'workspace-write',
      workspaceId: 'fs-workspace', operationId: 'open-fs-workspace' };
    const workspace = await rpc.request('workspace/open', openWorkspace);
    await expect(rpc.request('workspace/open', openWorkspace)).resolves.toEqual(workspace);
    const workspaceId = workspace.workspaceId as string;
    await rpc.request('fs/mkdir', {
      workspaceId, path: 'src/nested', recursive: true, operationId: 'mkdir-1',
    });
    const created = await rpc.request('fs/write', {
      workspaceId, path: 'src/nested/value.txt', data: Buffer.from('first').toString('base64'),
      encoding: 'base64', intent: { kind: 'create-if-absent' }, operationId: 'write-1',
    });
    const read = await rpc.request('fs/read', { workspaceId, path: 'src/nested/value.txt' });
    expect(Buffer.from(read.data, 'base64').toString()).toBe('first');
    expect(read.version).toBe(created.version);
    expect(read.statVersion).toMatch(/^s1:/u);
    const opened = await rpc.request('fs/readOpen', {
      workspaceId, path: 'src/nested/value.txt', handleId: 'read-value', operationId: 'open-read-value',
    });
    let streamed = '';
    let streamVersion: string | undefined;
    let afterSeq = '0';
    for (let attempt = 0; attempt < 10 && streamVersion === undefined; attempt += 1) {
      const next = await rpc.request('fs/readNext', { handleId: opened.handleId, afterSeq, maxBytes: 2 });
      if (attempt === 0) {
        await expect(rpc.request('fs/readNext', { handleId: opened.handleId, afterSeq, maxBytes: 2 }))
          .resolves.toEqual(next);
      }
      streamed += Buffer.from(next.data, 'base64').toString();
      afterSeq = next.seq;
      streamVersion = next.version;
    }
    expect(streamed).toBe('first');
    expect(streamVersion).toBe(read.version);
    await rpc.request('fs/close', { handleId: opened.handleId, operationId: 'close-read-value' });

    const replaced = await rpc.request('fs/write', {
      workspaceId, path: 'src/nested/value.txt', data: Buffer.from('second').toString('base64'),
      encoding: 'base64', intent: { kind: 'replace-if-version', version: read.version }, operationId: 'write-2',
    });
    expect(replaced.version).not.toBe(read.version);
    const observed = await rpc.request('fs/stat', { workspaceId, path: 'src/nested/value.txt' });
    expect(observed.version).toMatch(/^s1:/u);
    await expect(rpc.request('fs/write', {
      workspaceId, path: 'src/nested/value.txt', data: Buffer.from('second-via-stat').toString('base64'),
      encoding: 'base64', intent: { kind: 'replace-if-version', version: observed.version }, operationId: 'write-stat-version',
    })).resolves.toMatchObject({ operation: 'update' });
    await expect(rpc.request('fs/write', {
      workspaceId, path: 'src/nested/value.txt', data: Buffer.from('stale').toString('base64'),
      encoding: 'base64', intent: { kind: 'replace-if-version', version: read.version }, operationId: 'write-3',
    })).rejects.toMatchObject({ code: 'E_STALE_VERSION' });

    await rpc.request('fs/write', {
      workspaceId, path: 'src/nested/race.txt', data: Buffer.from('base').toString('base64'), encoding: 'base64',
      intent: { kind: 'create-if-absent' }, operationId: 'create-race-base',
    });
    const raceRead = await rpc.request('fs/read', { workspaceId, path: 'src/nested/race.txt' });
    for (const suffix of ['a', 'b']) {
      await rpc.request('fs/writeOpen', {
        workspaceId, path: 'src/nested/race.txt', handleId: `race-${suffix}`, operationId: `open-race-${suffix}`,
        intent: { kind: 'replace-if-version', version: raceRead.version },
      });
      await rpc.request('fs/writeChunk', {
        handleId: `race-${suffix}`, afterSeq: '0', operationId: `chunk-race-${suffix}`,
        encoding: 'base64', data: Buffer.from(`winner-${suffix}`).toString('base64'),
      });
    }
    const commits = await Promise.allSettled(['a', 'b'].map((suffix) => rpc.request('fs/writeCommit', {
      handleId: `race-${suffix}`, operationId: `commit-race-${suffix}`,
    })));
    expect(commits.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejectedCommit = commits.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejectedCommit.reason).toMatchObject({ code: 'E_STALE_VERSION' });
    for (const suffix of ['a', 'b']) {
      await rpc.request('fs/writeAbort', {
        handleId: `race-${suffix}`, operationId: `abort-race-${suffix}`,
      }).catch(() => {});
    }

    await symlink(outside, join(root, 'escape'));
    await expect(rpc.request('fs/stat', { workspaceId, path: 'escape' }))
      .rejects.toMatchObject({ code: 'E_SYMLINK' });
    await expect(rpc.request('fs/stat', { workspaceId, path: 'escape', follow: false }))
      .resolves.toMatchObject({ exists: true, metadata: { type: 'symlink' } });
    const listed = await rpc.request('fs/list', { workspaceId, path: 'src/nested' });
    expect(listed.entries.map((entry: any) => entry.name).sort()).toEqual(['race.txt', 'value.txt']);

    const large = Buffer.alloc(2 * 1024 * 1024 + 123);
    for (let index = 0; index < large.length; index += 1) large[index] = index % 251;
    const writeOpen = await rpc.request('fs/writeOpen', {
      workspaceId, path: 'src/nested/large.bin', handleId: 'write-large', operationId: 'open-write-large',
      intent: { kind: 'create-if-absent' },
    });
    expect(writeOpen).toMatchObject({ handleId: 'write-large', seq: '0', maxChunkBytes: 256 * 1024 });
    let writeSeq = '0';
    for (let offset = 0, index = 0; offset < large.length; offset += 192 * 1024, index += 1) {
      const chunk = large.subarray(offset, Math.min(large.length, offset + 192 * 1024));
      const params = { handleId: 'write-large', afterSeq: writeSeq, data: chunk.toString('base64'),
        encoding: 'base64', operationId: `large-chunk-${index}` };
      const written = await rpc.request('fs/writeChunk', params);
      if (index === 0) {
        await expect(rpc.request('fs/writeChunk', { ...params, operationId: 'large-chunk-0-retry' }))
          .resolves.toEqual(written);
      }
      writeSeq = written.seq;
    }
    await expect(rpc.request('fs/writeCommit', {
      handleId: 'write-large', operationId: 'commit-write-large',
    })).resolves.toMatchObject({ operation: 'create', written: large.length });
    await expect(rpc.request('fs/read', {
      workspaceId, path: 'src/nested/large.bin', maxBytes: large.length,
    })).rejects.toMatchObject({ code: 'E_TOO_LARGE' });
    await expect(rpc.request('fs/list', {
      workspaceId, path: 'src/nested', limit: 1,
    })).rejects.toMatchObject({ code: 'E_TOO_LARGE' });
    await expect(rpc.request('fs/list', {
      workspaceId, path: 'src/nested', limit: 1, allowTruncated: true,
    })).resolves.toMatchObject({ truncated: true, limit: 1 });

    await rpc.request('fs/readOpen', {
      workspaceId, path: 'src/nested/large.bin', handleId: 'read-large', operationId: 'open-read-large',
    });
    const received: Buffer[] = [];
    let largeReadSeq = '0';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const next = await rpc.request('fs/readNext', {
        handleId: 'read-large', afterSeq: largeReadSeq, maxBytes: 256 * 1024,
      });
      received.push(Buffer.from(next.data, 'base64'));
      largeReadSeq = next.seq;
      if (next.eof) break;
    }
    expect(Buffer.concat(received)).toEqual(large);
    await rpc.request('fs/close', { handleId: 'read-large', operationId: 'close-read-large' });

    const picker = join(root, 'picker-many-files');
    await mkdir(picker);
    for (let offset = 0; offset < 1_200; offset += 100) {
      await Promise.all(Array.from({ length: 100 }, (_, index) => writeFile(
        join(picker, `file-${String(offset + index).padStart(4, '0')}.txt`),
        '',
      )));
    }
    await mkdir(join(picker, 'directory-after-files'));
    await expect(rpc.request('fs/list', {
      workspaceId, path: 'picker-many-files', limit: 1_000, allowTruncated: true, types: ['directory'],
    })).resolves.toMatchObject({
      truncated: false,
      entries: [{ name: 'directory-after-files', metadata: { type: 'directory' } }],
    });
    await expect(rpc.request('health/status')).resolves.toMatchObject({ pathLocks: 0, writeHandles: 0 });
  }, 15_000);

  it('runs bounded non-PTY and PTY processes and fails restricted execution closed without bwrap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-helper-process-'));
    temporary.push(root);
    const rpc = new RpcClient({ extraEnv: { DEMO_TOKEN: 'ambient-secret' } });
    clients.push(rpc);
    await rpc.hello;
    const initialized = await rpc.request('initialize', { clientId: 'process-vitest' });

    const danger = await rpc.request('workspace/open', { path: root, access: 'danger-full-access',
      workspaceId: 'process-workspace', operationId: 'open-process-workspace' });
    const quick = await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'quick-true', operationId: 'start-quick-true',
      argv: ['/usr/bin/true'], stdin: 'closed',
    });
    expect(quick).toMatchObject({ processId: 'quick-true', stdin: 'closed' });
    let quickRead: any;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      quickRead = await rpc.request('process/read', { processId: 'quick-true', afterSeq: '0', waitMs: 100 });
      if (quickRead.exited) break;
    }
    expect(quickRead).toMatchObject({ exited: true, exitCode: 0 });

    await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'quick-printf', operationId: 'start-quick-printf',
      argv: ['/bin/sh', '-c', "printf 'fast-output'"], stdin: 'closed',
    });
    let fastOutput = '';
    let fastCursor = '0';
    for (let attempt = 0; attempt < 10 && !fastOutput.includes('fast-output'); attempt += 1) {
      const read = await rpc.request('process/read', { processId: 'quick-printf', afterSeq: fastCursor, waitMs: 100 });
      for (const chunk of read.chunks) fastOutput += Buffer.from(chunk.data, 'base64').toString();
      fastCursor = read.nextSeq;
    }
    expect(fastOutput).toContain('fast-output');
    await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'ambient-env', operationId: 'start-ambient-env',
      argv: ['/bin/sh', '-c', 'printf %s "${DEMO_TOKEN-unset}"'], stdin: 'closed',
    });
    let ambientOutput = '';
    for (let attempt = 0; attempt < 10 && ambientOutput.length === 0; attempt += 1) {
      const read = await rpc.request('process/read', { processId: 'ambient-env', afterSeq: '0', waitMs: 100 });
      ambientOutput = read.chunks.map((chunk: any) => Buffer.from(chunk.data, 'base64').toString()).join('');
    }
    expect(ambientOutput).toBe('unset');
    await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'explicit-env', operationId: 'start-explicit-env',
      argv: ['/bin/sh', '-c', 'printf %s "${DEMO_TOKEN-unset}"'], stdin: 'closed', env: { DEMO_TOKEN: 'explicit-ok' },
    });
    let explicitOutput = '';
    for (let attempt = 0; attempt < 10 && explicitOutput.length === 0; attempt += 1) {
      const read = await rpc.request('process/read', { processId: 'explicit-env', afterSeq: '0', waitMs: 100 });
      explicitOutput = read.chunks.map((chunk: any) => Buffer.from(chunk.data, 'base64').toString()).join('');
    }
    expect(explicitOutput).toBe('explicit-ok');
    const process = await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'plain',
      operationId: 'process-plain', argv: ['/bin/sh', '-c', "printf 'out'; printf 'err' >&2"],
    });
    expect(process).toMatchObject({ processId: 'plain', tty: false });
    let cursor = '0';
    let output = '';
    for (let attempt = 0; attempt < 10 && (!output.includes('out') || !output.includes('err')); attempt += 1) {
      const read = await rpc.request('process/read', { processId: 'plain', afterSeq: cursor, waitMs: 200 });
      for (const chunk of read.chunks) output += Buffer.from(chunk.data, 'base64').toString();
      cursor = read.nextSeq;
    }
    expect(output).toContain('out');
    expect(output).toContain('err');

    const pty = await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'pty', argv: ['/bin/sh'],
      operationId: 'process-pty', tty: { rows: 24, cols: 80, term: 'xterm-256color' },
    });
    expect(pty).toMatchObject({ processId: 'pty', tty: true });
    await expect(rpc.request('process/resize', { processId: 'pty', rows: 40, cols: 100, operationId: 'resize-pty' }))
      .resolves.toEqual({ resized: true });
    await expect(rpc.request('process/inspectForeground', { processId: 'pty' }))
      .resolves.toMatchObject({ verified: true });
    await rpc.request('process/write', {
      processId: 'pty', encoding: 'base64', data: Buffer.from("printf 'pty-ok\\n'; exit\\n").toString('base64'),
      operationId: 'write-pty',
    });
    let ptyOutput = '';
    cursor = '0';
    for (let attempt = 0; attempt < 10 && !ptyOutput.includes('pty-ok'); attempt += 1) {
      const read = await rpc.request('process/read', { processId: 'pty', afterSeq: cursor, waitMs: 200 });
      for (const chunk of read.chunks) ptyOutput += Buffer.from(chunk.data, 'base64').toString();
      cursor = read.nextSeq;
    }
    expect(ptyOutput).toContain('pty-ok');
    const concurrentPtys = await Promise.all(['a', 'b'].map((suffix) => rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: `pty-${suffix}`, operationId: `start-pty-${suffix}`,
      argv: suffix === 'a' ? ['/bin/cat'] : ['/bin/sh'], tty: { rows: 24, cols: 80, term: 'xterm-256color' },
    })));
    expect(concurrentPtys).toHaveLength(2);
    const largePtyInput = Buffer.from('x\n'.repeat(96 * 1024));
    const ptyWrites = await Promise.all(['a', 'b'].map((suffix) => rpc.request('process/write', {
      processId: `pty-${suffix}`, operationId: `exit-pty-${suffix}`, encoding: 'base64',
      data: (suffix === 'a' ? largePtyInput : Buffer.from('exit\n')).toString('base64'),
    })));
    expect(ptyWrites[0]).toMatchObject({ written: largePtyInput.length });

    await rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: 'concurrent-cat', operationId: 'start-concurrent-cat',
      argv: ['/bin/cat'],
    });
    const waitingRead = rpc.request('process/read', {
      processId: 'concurrent-cat', afterSeq: '0', waitMs: 1_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const writeStarted = Date.now();
    const largePipeInput = Buffer.alloc(384 * 1024, 0x61);
    const pipeWrite = await rpc.request('process/write', {
      processId: 'concurrent-cat', operationId: 'write-concurrent-cat', encoding: 'base64',
      data: largePipeInput.toString('base64'),
    });
    expect(pipeWrite).toMatchObject({ written: largePipeInput.length });
    expect(Date.now() - writeStarted).toBeLessThan(500);
    const concurrentRead = await waitingRead;
    expect(Buffer.concat(concurrentRead.chunks.map((chunk: any) => Buffer.from(chunk.data, 'base64'))).length)
      .toBeGreaterThan(0);
    await rpc.request('process/write', {
      processId: 'concurrent-cat', operationId: 'eof-concurrent-cat', encoding: 'base64', data: '', eof: true,
    });
    await rpc.request('process/release', { processId: 'plain', operationId: 'release-plain' });
    await rpc.request('process/release', { processId: 'pty', operationId: 'release-pty' });
    await rpc.request('process/release', { processId: 'concurrent-cat', operationId: 'release-concurrent-cat' });
    await rpc.request('process/release', { processId: 'quick-true', operationId: 'release-quick-true' });
    await rpc.request('process/release', { processId: 'quick-printf', operationId: 'release-quick-printf' });
    await rpc.request('process/release', { processId: 'ambient-env', operationId: 'release-ambient-env' });
    await rpc.request('process/release', { processId: 'explicit-env', operationId: 'release-explicit-env' });
    await rpc.request('process/release', { processId: 'pty-a', operationId: 'release-pty-a' });
    await rpc.request('process/release', { processId: 'pty-b', operationId: 'release-pty-b' });

    for (let index = 0; index < 8; index += 1) {
      const immediate = await rpc.request('process/start', {
        workspaceId: danger.workspaceId, cwd: '', processId: `immediate-pty-${index}`,
        operationId: `start-immediate-pty-${index}`, argv: ['/bin/sh'],
        tty: { rows: 24, cols: 80, term: 'xterm-256color' },
      });
      await rpc.request('process/release', {
        processId: `immediate-pty-${index}`, operationId: `release-immediate-pty-${index}`,
      });
      expect(() => nodeProcess.kill(immediate.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    }

    const cappedStarts = await Promise.allSettled(Array.from({ length: 40 }, (_, index) => rpc.request('process/start', {
      workspaceId: danger.workspaceId, cwd: '', processId: `capped-${index}`, operationId: `start-capped-${index}`,
      argv: ['/bin/sleep', '30'], stdin: 'closed',
    })));
    const startedAtLimit = cappedStarts
      .map((result, index) => ({ result, index }))
      .filter((item): item is { result: PromiseFulfilledResult<any>; index: number } => item.result.status === 'fulfilled');
    expect(startedAtLimit).toHaveLength(32);
    const rejectedAtLimit = cappedStarts.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejectedAtLimit).toHaveLength(8);
    expect(rejectedAtLimit.every((result) => result.reason.code === 'E_RESOURCE_LIMIT')).toBe(true);
    await Promise.all(startedAtLimit.map(({ index }) => rpc.request('process/release', {
      processId: `capped-${index}`, operationId: `release-capped-${index}`,
    })));

    const restricted = await rpc.request('workspace/open', { path: root, access: 'workspace-write',
      workspaceId: 'restricted-workspace', operationId: 'open-restricted-workspace' });
    if (initialized.capabilities.process.sandbox === 'none') {
      await expect(rpc.request('process/start', {
        workspaceId: restricted.workspaceId, cwd: '', argv: ['/usr/bin/true'], operationId: 'restricted-process',
      })).rejects.toMatchObject({ code: 'E_SANDBOX_UNAVAILABLE' });
    } else {
      const hostMarkerName = `dsh-helper-host-marker-${Date.now()}`;
      const hostMarker = join(tmpdir(), hostMarkerName);
      await writeFile(hostMarker, 'host-only');
      temporary.push(hostMarker);
      await rpc.request('process/start', {
        workspaceId: restricted.workspaceId, cwd: '', processId: 'restricted-policy', operationId: 'start-restricted-policy',
        argv: ['/bin/sh', '-c', `tmp=$(mktemp) && printf ok >"$tmp" && rm -f "$tmp" && test ! -e /tmp/${hostMarkerName} && printf workspace >.dsh-policy-proof && rm -f .dsh-policy-proof && pids=$(find /proc -maxdepth 1 -type d -name "[0-9]*" | wc -l) && test "$pids" -lt 10 && if printf no >/etc/dsh-helper-policy-test; then exit 99; else printf policy-ok; fi`],
        stdin: 'closed',
      });
      let restrictedOutput = '';
      let restrictedCursor = '0';
      for (let attempt = 0; attempt < 20 && !restrictedOutput.includes('policy-ok'); attempt += 1) {
        const read = await rpc.request('process/read', {
          processId: 'restricted-policy', afterSeq: restrictedCursor, waitMs: 100,
        });
        restrictedCursor = read.nextSeq;
        for (const chunk of read.chunks) restrictedOutput += Buffer.from(chunk.data, 'base64').toString();
      }
      expect(restrictedOutput).toContain('policy-ok');
      expect(await readFile(hostMarker, 'utf8')).toBe('host-only');
      await rm(hostMarker, { force: true });
      await rpc.request('process/release', {
        processId: 'restricted-policy', operationId: 'release-restricted-policy',
      });
    }
  }, 15_000);

  it.skipIf(process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1')('keeps a process in the per-user daemon and resumes it by clientId and token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-helper-resume-root-'));
    const runtimeDir = await mkdtemp(join(tmpdir(), 'dsh-helper-runtime-'));
    temporary.push(root, runtimeDir);
    const first = new RpcClient({ direct: false, runtimeDir });
    clients.push(first);
    await first.hello;
    const initialized = await first.request('initialize', { clientId: 'resume-vitest', retentionMs: 60_000 });
    const workspace = await first.request('workspace/open', { path: root, access: 'danger-full-access',
      workspaceId: 'resume-workspace', operationId: 'open-resume-workspace' });
    await first.request('process/start', {
      workspaceId: workspace.workspaceId, cwd: '', processId: 'retained', operationId: 'retained-start',
      argv: ['/bin/sh', '-c', "sleep 0.1; printf 'resumed-output'; sleep 0.2"],
    });
    await first.close();
    clients.splice(clients.indexOf(first), 1);

    const rejected = new RpcClient({ direct: false, runtimeDir });
    clients.push(rejected);
    await rejected.hello;
    await expect(rejected.request('initialize', {
      clientId: 'resume-vitest', resumeToken: 'wrong-resume-token',
    })).rejects.toMatchObject({ code: 'E_RESUME_DENIED' });
    await rejected.close();
    clients.splice(clients.indexOf(rejected), 1);

    const second = new RpcClient({ direct: false, runtimeDir });
    clients.push(second);
    await second.hello;
    const resumed = await second.request('initialize', {
      clientId: 'resume-vitest', resumeToken: initialized.session.resumeToken,
    });
    expect(resumed.session).toMatchObject({ resumed: true, sessionId: initialized.session.sessionId });
    let output = '';
    let cursor = '0';
    for (let attempt = 0; attempt < 10 && !output.includes('resumed-output'); attempt += 1) {
      const read = await second.request('process/read', { processId: 'retained', afterSeq: cursor, waitMs: 200 });
      for (const chunk of read.chunks) output += Buffer.from(chunk.data, 'base64').toString();
      cursor = read.nextSeq;
    }
    expect(output).toContain('resumed-output');
    await second.request('admin/shutdown');
  }, 15_000);
});
