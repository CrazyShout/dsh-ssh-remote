import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { decodeRemoteScript } from './fixtures/remote-script.js';
import {
  buildRemoteSshInvocation,
  installRemoteFileSystemRouter,
  installRemoteSubprocessRouter,
  REMOTE_SANDBOX_LAUNCHER,
} from '../src/runtime-router.js';
import { AnchorRegistry } from '../src/anchors.js';
import { SshRemoteService } from '../src/registry.js';

function fakeFileSystem() {
  return {
    resolve: vi.fn(async (path: string) => ({ targetKey: `local:${path}`, displayPath: path })),
    processPath: vi.fn(() => 'local'),
    fileUrl: vi.fn(() => 'file://local'),
    contains: vi.fn(() => true),
    stat: vi.fn(),
    lstat: vi.fn(),
    readText: vi.fn(),
    streamText: vi.fn(),
    readBytes: vi.fn(),
    readByteRange: vi.fn(),
    listDir: vi.fn(),
    writeText: vi.fn(),
    editText: vi.fn(),
  };
}


function fakeHelpers() {
  return { client: async () => ({ capabilities: { filesystem: { readRange: { version: 1 } } }, sessionId: 'test', call: async (method: string, p: any) => {
    if (method === 'workspace/open') return { workspaceId: p.workspaceId, path: p.path, access: p.access };
    if (method === 'fs/canonicalize') return { path: p.path };
    if (method === 'fs/readRange') return { offset: p.offset, data: Buffer.alloc(p.length, 65).toString('base64'), statVersion: 's1:test', eof: false };
    throw new Error(method);
  } }) };
}
function fakeAnchors() {
  const registry = Object.create(AnchorRegistry.prototype);
  const root = resolve('/anchors'), anchorPath = join(root, 'project');
  Object.assign(registry, { root, spellings: [root], entries: new Map([[anchorPath, {
    anchorPath, uri: 'ssh://gpu/home/atlas/project', remotePath: '/home/atlas/project',
  }]]) });
  return registry;
}

describe('remote Workspace routing', () => {
  it('maps only an exact anchor boundary and its descendants', () => {
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService & {
      anchors: Map<string, unknown>;
    };
    service.anchors = fakeAnchors();

    expect(service.resolveRemotePath('/anchors/project')).toBe('ssh://gpu/home/atlas/project');
    expect(service.resolveRemotePath('/anchors/project/src')).toBe('ssh://gpu/home/atlas/project/src');
    expect(service.resolveRemotePath('/anchors/project-other')).toBeUndefined();
  });

  it('does not send a remote watch to the local provider', async () => {
    const stop = vi.fn(async () => {});
    const watch = vi.fn(async () => stop);
    const fs = { ...fakeFileSystem(), watch };
    const restore = installRemoteFileSystemRouter(fs as never,
      path => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined, fakeHelpers() as never);
    const changed = vi.fn();
    const signal = new AbortController().signal;
    const remote = await fs.resolve('/anchors/project');
    await expect(fs.watch(remote, changed, signal)).rejects.toMatchObject({ code: 'FS_IO_ERROR' });
    expect(watch).not.toHaveBeenCalled();
    const local = await fs.resolve('/tmp/local');
    expect(await fs.watch(local, changed, signal)).toBe(stop);
    expect(watch).toHaveBeenCalledWith(local, changed, signal);
    restore();
    expect(fs.watch).toBe(watch);
  });

  it('publishes exact remote identity without opening SSH or guessing anchor names', async () => {
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService;
    Object.defineProperty(service, 'anchors', { value: fakeAnchors() });
    await expect(service.workspaceInfo('/anchors/project')).resolves.toEqual({
      alias: 'gpu', remotePath: '/home/atlas/project', uri: 'ssh://gpu/home/atlas/project',
    });
    await expect(service.workspaceInfo('/anchors/project/中文 space')).resolves.toMatchObject({ remotePath: '/home/atlas/project/中文 space' });
    await expect(service.workspaceInfo('/anchors/project-other')).resolves.toBeNull();
    await expect(service.workspaceInfo('/local/work · gpu')).resolves.toBeNull();
    await expect(service.workspaceInfo('/anchors/project/../local')).resolves.toBeNull();
    await expect(service.workspaceInfo('')).resolves.toBeNull();
    await expect(service.workspaceInfo('bad\0path')).resolves.toBeNull();
  });

  it('routes resolution by mapped cwd and restores the original provider', async () => {
    const fs = fakeFileSystem();
    const restore = installRemoteFileSystemRouter(
      fs as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
      fakeHelpers() as never,
    );

    const remote = await fs.resolve('src/index.ts', { cwd: '/anchors/project' } as never);
    expect(String(remote.targetKey)).toBe('ssh://gpu/home/atlas/project/src/index.ts');

    const local = await fs.resolve('/tmp/local');
    expect(local.targetKey).toBe('local:/tmp/local');

    restore();
    const restored = await fs.resolve('after');
    expect(restored.targetKey).toBe('local:after');
  });

  it('adapts the optional DSH 0.1.2 host-path seam without breaking rc.2', () => {
    const fs = {
      ...fakeFileSystem(),
      processPathFromHostPath: vi.fn((path: string) => path === '/tmp/local' ? '/tmp/local' : undefined),
    };
    const restore = installRemoteFileSystemRouter(
      fs as never,
      path => path.startsWith('/anchors/project')
        ? `ssh://gpu/home/atlas/project${path.slice('/anchors/project'.length)}`
        : undefined,
      fakeHelpers() as never,
    );
    expect(fs.processPathFromHostPath('/anchors/project/src')).toBe('/home/atlas/project/src');
    expect(fs.processPathFromHostPath('/tmp/local')).toBe('/tmp/local');
    restore();
    expect(fs.processPathFromHostPath('/anchors/project/src')).toBeUndefined();
  });

  it('fails closed for remote writes under read-only or outside-workspace policy', async () => {
    const fs = fakeFileSystem();
    Object.defineProperty(fs, 'sandboxMode', { value: 'workspace-write' });
    const restore = installRemoteFileSystemRouter(
      fs as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
      fakeHelpers() as never,
    );
    try {
      const inside = await fs.resolve('notes.txt', { cwd: '/anchors/project' } as never);
      await expect((fs.writeText as any)(inside, 'x', undefined, undefined, {
        mode: 'read-only',
        workspaceRoot: '/anchors/project',
      })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' });

      const outside = await fs.resolve('ssh://gpu/home/atlas/other/notes.txt');
      await expect((fs.writeText as any)(outside, 'x', undefined, undefined, {
        mode: 'workspace-write',
        workspaceRoot: '/anchors/project',
      })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' });
    } finally {
      restore();
    }
  });

  it('routes readByteRange to the remote adapter for SSH targets and to the original for local paths', async () => {
    const fs = fakeFileSystem();
    const originalReadByteRange = fs.readByteRange as any;
    const localResult = new Uint8Array([1, 2, 3]);
    originalReadByteRange.mockResolvedValue(localResult);
    const restore = installRemoteFileSystemRouter(
      fs as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
      fakeHelpers() as never,
    );
    try {
      // Local path: original provider answers.
      const local = await fs.resolve('/tmp/file.txt');
      const localData = await (fs.readByteRange as any)(local, { offset: 0, length: 3 });
      expect(localData).toBe(localResult);
      expect(originalReadByteRange).toHaveBeenCalledWith(local, { offset: 0, length: 3 });

      // Remote path: routed to the SFTP-backed adapter, not the local mock.
      originalReadByteRange.mockClear();
      const remote = await fs.resolve('ssh://gpu/home/atlas/project/file.bin');
      const remoteData = await (fs.readByteRange as any)(remote, { offset: 10, length: 5 });
      expect(originalReadByteRange).not.toHaveBeenCalled();
      expect(remoteData).toBeInstanceOf(Uint8Array);
      expect(remoteData.length).toBe(5);
    } finally {
      restore();
    }
  });

  it('delegates mapped process cwd to system OpenSSH and leaves local cwd alone', () => {
    const localHandle = { pid: 1 };
    const spawn = vi.fn(() => localHandle);
    const spawnTerminal = vi.fn(async () => ({ pid: 2 }));
    const runtime = { spawn, spawnTerminal };
    const restore = installRemoteSubprocessRouter(
      runtime as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
      fakeHelpers() as never,
    );

    runtime.spawn({
      argv: ['bash', '-lc', 'pwd'],
      cwd: '/anchors/project',
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      graceMs: 1000,
    } as never);
    expect(spawn).toHaveBeenLastCalledWith(expect.objectContaining({
      argv: expect.arrayContaining(['ssh', '-T', 'gpu']),
    }));

    runtime.spawn({ argv: ['pwd'], cwd: '/tmp', stdio: {}, graceMs: 1000 } as never);
    expect(spawn).toHaveBeenLastCalledWith(expect.objectContaining({ cwd: '/tmp' }));
    const localSearch = {
      argv: ['/app/node_modules/@vscode/ripgrep/bin/rg', '--files'],
      cwd: '/tmp', stdio: {}, graceMs: 1000,
    };
    runtime.spawn(localSearch as never);
    expect(spawn.mock.calls.at(-1)?.[0]).toBe(localSearch);
    restore();
  });
});

describe('OpenSSH process invocation', () => {
  const cwd = 'ssh://gpu/home/atlas/project';
  const packagedRg = '/app/node_modules/@vscode/ripgrep/bin/rg';
  const anchor = '/anchors/project';
  const resolver = (path: string) => path === anchor ? cwd : undefined;

  it('quotes cwd, argv and explicit environment into one remote shell command', () => {
    const invocation = buildRemoteSshInvocation(
      'ssh://atlas@gpu:2202/home/atlas/My Project',
      ['bash', '-lc', "printf '%s' ok"],
      { DEMO: "a'b" },
      false,
    );
    expect(invocation.slice(0, 6)).toEqual(['ssh', '-T', '-p', '2202', '--', 'atlas@gpu']);
    expect(decodeRemoteScript(invocation.at(-1))).toContain("cd '");
    expect(decodeRemoteScript(invocation.at(-1))).toContain('DEMO=');
    expect(decodeRemoteScript(invocation.at(-1))).toContain('My Project');
  });

  it('runs packaged ripgrep requests through remote PATH rg scoped to cwd', () => {
    const invocation = buildRemoteSshInvocation(
      'ssh://gpu/home/atlas/project',
      ['/Users/me/app/node_modules/.pnpm/@vscode+ripgrep-darwin-arm64@1.18.0/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg', '--no-config', '--files'],
      undefined,
      false,
    );
    expect(decodeRemoteScript(invocation.at(-1))).toContain('rg');
    expect(decodeRemoteScript(invocation.at(-1))).toContain('--files');
    expect(decodeRemoteScript(invocation.at(-1))).toMatch(/--.*\./u);
    expect(decodeRemoteScript(invocation.at(-1))).not.toContain('ripgrep-darwin-arm64');
  });

  it('replaces a Windows host executable with the remote PATH command', () => {
    const invocation = buildRemoteSshInvocation(
      cwd,
      ['C:\\Program Files\\Git\\cmd\\git.EXE', '--no-optional-locks', 'rev-parse', '--show-toplevel'],
      { GIT_TERMINAL_PROMPT: '0' },
      false,
    );
    const script = decodeRemoteScript(invocation.at(-1));
    expect(script).toContain("'git' '--no-optional-locks' 'rev-parse' '--show-toplevel'");
    expect(script).not.toContain('Program Files');
  });

  it('recreates a Windows ACL sandbox with a trusted remote launcher', () => {
    const invocation = buildRemoteSshInvocation(
      cwd,
      [
        'C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe',
        'C:\\Program Files\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js',
        '--workspace', anchor,
        '--temp', 'C:\\Users\\me\\AppData\\Local\\Temp\\dsh-sandbox',
        '--mode', 'workspace-write',
        '--write-sid', 'S-1-5-21-1',
        '--temp-write-sid', 'S-1-5-21-2',
        '--', 'C:\\Program Files\\Git\\cmd\\git.EXE', 'rev-parse', '--show-toplevel',
      ],
      { GIT_TERMINAL_PROMPT: '0', PATH: '/home/atlas/project/.bin' },
      false,
      resolver,
    );
    const script = decodeRemoteScript(invocation.at(-1));
    expect(script).toContain("exec 'python3' '-c'");
    expect(script).toContain('"mode":"workspace-write"');
    expect(script).toContain('"root":"/home/atlas/project"');
    expect(script).toContain('"GIT_TERMINAL_PROMPT":"0"');
    expect(script).toContain('"PATH":"/home/atlas/project/.bin"');
    expect(script).toContain('--clearenv');
    expect(script).toContain('--bind-fd');
    expect(script).toContain('dsh-remote-helper');
    expect(script).not.toContain('exec env');
    expect(script).not.toContain('DeepSeek Harness');
    expect(script).not.toContain('dsh-sandbox-windows-acl');
    expect(script).not.toContain('--write-sid');
  });

  it('keeps a /tmp workspace mapped into the remote sandbox launcher', () => {
    const tmpCwd = 'ssh://gpu/tmp/project';
    const script = decodeRemoteScript(buildRemoteSshInvocation(
      tmpCwd,
      [
        'C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe',
        'C:\\app\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js',
        '--workspace', anchor,
        '--temp', 'C:\\temp',
        '--mode', 'workspace-write',
        '--', 'C:\\Program Files\\Git\\cmd\\git.EXE', 'status',
      ],
      undefined,
      false,
      path => path === anchor ? tmpCwd : undefined,
    ).at(-1));
    expect(script).toContain('"root":"/tmp/project"');
    expect(script).toContain('"cwd":"/tmp/project"');
    expect(script).toContain('--bind-fd');
  });

  it('rejects a Windows sandbox workspace that is not mapped to the SSH host', () => {
    expect(() => buildRemoteSshInvocation(
      cwd,
      [
        'C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe',
        'C:\\app\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js',
        '--workspace', 'C:\\unmapped',
        '--temp', 'C:\\temp',
        '--mode', 'workspace-write',
        '--', 'C:\\Program Files\\Git\\cmd\\git.EXE', 'status',
      ],
      undefined,
      false,
      () => undefined,
    )).toThrow(/workspace is not mapped/u);
  });

  it('does not treat an unrelated command separator as a Windows sandbox', () => {
    const script = decodeRemoteScript(buildRemoteSshInvocation(
      cwd,
      ['C:\\Tools\\helper.EXE', '--', 'literal-value'],
      undefined,
      false,
    ).at(-1));
    expect(script).toContain("'helper' '--' 'literal-value'");
  });

  it.each([
    '/usr/bin/git',
    '/opt/wine/tool.exe',
    './tools/helper.EXE',
  ])('keeps a POSIX executable path intended for the remote host: %s', executable => {
    const script = decodeRemoteScript(buildRemoteSshInvocation(
      cwd,
      [executable, 'rev-parse', '--show-toplevel'],
      undefined,
      false,
    ).at(-1));
    expect(script).toContain(executable);
    expect(script).toContain('rev-parse');
  });

  it.skipIf(process.platform !== 'linux')('hides helper runtime after rebinding a /tmp workspace', () => {
    const base = mkdtempSync(join(tmpdir(), 'dsh-sandbox-launcher-'));
    let createdFallback: string | undefined;
    try {
      const bin = join(base, 'bin');
      const capture = join(base, 'argv.txt');
      const longBase = join(base, `runtime-${'x'.repeat(100)}`);
      const runtimeRoot = join(longBase, 'dsh-remote-helper');
      mkdirSync(bin);
      mkdirSync(runtimeRoot, { recursive: true });
      const runtimeBase = join(base, `alias-${'y'.repeat(100)}`);
      symlinkSync(longBase, runtimeBase, 'dir');
      const suffix = createHash('sha256').update(join(runtimeBase, 'dsh-remote-helper')).digest('hex').slice(0, 12);
      const actualFallback = join('/tmp', `dsh-rh-${process.getuid()}-${suffix}`);
      if (existsSync(actualFallback)) throw new Error(`unexpected fallback collision: ${actualFallback}`);
      mkdirSync(actualFallback);
      createdFallback = actualFallback;
      const fakeBwrap = join(bin, 'bwrap');
      writeFileSync(fakeBwrap, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$DSH_TEST_CAPTURE"\n');
      chmodSync(fakeBwrap, 0o755);
      const result = spawnSync('python3', [
        '-c', REMOTE_SANDBOX_LAUNCHER,
        JSON.stringify({
          mode: 'workspace-write', root: '/tmp', cwd: '/tmp',
          argv: ['/bin/true'], env: { PATH: '/payload/bin' },
        }),
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
          XDG_RUNTIME_DIR: runtimeBase,
          DSH_TEST_CAPTURE: capture,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      const args = readFileSync(capture, 'utf8').trim().split('\n');
      const bindFd = args.indexOf('--bind-fd');
      const runtimeMount = args.findIndex((value, index) => value === '--tmpfs' && args[index + 1] === runtimeRoot);
      expect(bindFd).toBeGreaterThan(-1);
      expect(runtimeMount).toBeGreaterThan(bindFd);
      expect(args).toContain(actualFallback);
      const pathEnv = args.findIndex((value, index) => value === '--setenv' && args[index + 1] === 'PATH');
      expect(pathEnv).toBeGreaterThan(-1);
      expect(args[pathEnv + 2]).toBe('/payload/bin');
      expect(args.at(-1)).toBe('/bin/true');

      const nestedWorkspace = join(base, 'workspace');
      const nestedRuntimeBase = join(nestedWorkspace, 'runtime');
      const nestedRuntimeRoot = join(nestedRuntimeBase, 'dsh-remote-helper');
      const nestedCapture = join(base, 'nested-argv.txt');
      mkdirSync(nestedRuntimeRoot, { recursive: true });
      const nestedResult = spawnSync('python3', [
        '-c', REMOTE_SANDBOX_LAUNCHER,
        JSON.stringify({
          mode: 'workspace-write', root: nestedWorkspace, cwd: nestedWorkspace,
          argv: ['/bin/true'], env: {},
        }),
      ], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
          XDG_RUNTIME_DIR: nestedRuntimeBase,
          DSH_TEST_CAPTURE: nestedCapture,
        },
      });
      expect(nestedResult.status, nestedResult.stderr).toBe(0);
      const nestedArgs = readFileSync(nestedCapture, 'utf8').trim().split('\n');
      const workspaceBind = nestedArgs.indexOf('--bind-fd');
      const nestedRuntimeMount = nestedArgs.findIndex((value, index) =>
        value === '--tmpfs' && nestedArgs[index + 1] === nestedRuntimeRoot);
      expect(workspaceBind).toBeGreaterThan(-1);
      expect(nestedRuntimeMount).toBeGreaterThan(workspaceBind);
    } finally {
      if (createdFallback !== undefined) rmdirSync(createdFallback);
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('maps packaged ripgrep local anchor roots to remote paths', () => {
    const invocation = buildRemoteSshInvocation(
      'ssh://gpu/home/atlas/project',
      [
        '/Users/me/app/node_modules/.pnpm/@vscode+ripgrep-darwin-arm64@1.18.0/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg',
        '--no-config',
        '--files',
        '--',
        '/Users/me/.dsh/ssh-workspace-anchors/project',
      ],
      undefined,
      false,
      path => path === '/Users/me/.dsh/ssh-workspace-anchors/project'
        ? 'ssh://gpu/home/atlas/project'
        : undefined,
      fakeHelpers() as never,
    );
    expect(decodeRemoteScript(invocation.at(-1))).toContain('/home/atlas/project');
    expect(decodeRemoteScript(invocation.at(-1))).not.toContain('/Users/me/.dsh/ssh-workspace-anchors/project');
  });

  it('gives pathless DSH content searches an explicit cwd instead of SSH stdin', () => {
    const args = ['--no-config', '--json', `--regexp=${anchor}`];
    expect(buildRemoteSshInvocation(cwd, [packagedRg, ...args], undefined, false, resolver))
      .toEqual(buildRemoteSshInvocation(cwd, [packagedRg, ...args, '--', '.'], undefined, false));
  });

  it('does not widen an explicitly selected relative directory', () => {
    const args = ['--no-config', '--files', 'src'];
    expect(buildRemoteSshInvocation(cwd, [packagedRg, ...args], undefined, false, resolver))
      .toEqual(buildRemoteSshInvocation(cwd, ['rg', ...args], undefined, false));
  });

  it('preserves a positional pattern that resembles a local anchor', () => {
    const args = ['--', anchor, '.'];
    expect(buildRemoteSshInvocation(cwd, [packagedRg, ...args], undefined, false, resolver))
      .toEqual(buildRemoteSshInvocation(cwd, ['rg', ...args], undefined, false));
  });

  it('does not mistake substring lookalikes for the packaged executable', () => {
    const binary = '/tools/@vscode-custom/not-ripgrep/bin/rg';
    expect(decodeRemoteScript(buildRemoteSshInvocation(cwd, [binary, '--files'], undefined, false).at(-1)))
      .toContain(binary);
  });

  it('maps a same-host SSH URI root without changing the search pattern', () => {
    const args = ['--json', `--regexp=${cwd}`, '--', `${cwd}/src`];
    expect(buildRemoteSshInvocation(cwd, [packagedRg, ...args], undefined, false, resolver))
      .toEqual(buildRemoteSshInvocation(cwd, [packagedRg, '--json', `--regexp=${cwd}`, '--', '/home/atlas/project/src'], undefined, false));
  });

  it.each(['ssh://other/home/atlas/project', 'ssh://user@gpu/home/atlas/project', 'ssh://gpu:2222/home/atlas/project'])(
    'rejects a search root on another SSH authority: %s', target => {
      expect(() => buildRemoteSshInvocation(cwd, [packagedRg, '--files', '--', anchor], undefined, false, () => target))
        .toThrow(/different SSH host/);
    },
  );

  it.each([
    '/app/node_modules/@vscode/ripgrep-linux-x64/bin/rg',
    'C:\\app\\node_modules\\@vscode\\ripgrep-win32-x64\\bin\\rg.exe',
  ])('recognizes the packaged binary layout: %s', binary => {
    expect(buildRemoteSshInvocation(cwd, [binary, '--files'], undefined, false))
      .toEqual(buildRemoteSshInvocation(cwd, [packagedRg, '--files', '--', '.'], undefined, false));
  });
});
