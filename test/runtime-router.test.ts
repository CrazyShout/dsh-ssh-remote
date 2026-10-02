import { describe, expect, it, vi } from 'vitest';
import {
  buildRemoteSshInvocation,
  installRemoteFileSystemRouter,
  installRemoteSubprocessRouter,
} from '../src/runtime-router.js';
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


function fakeConnections() {
  const sftp = {
    realpath(path: string, callback: (error: Error | undefined, resolved: string) => void) {
      callback(undefined, path);
    },
    lstat(_path: string, callback: (error: Error | undefined) => void) {
      callback(Object.assign(new Error('no such file'), { code: 2 }));
    },
    createReadStream(path: string, options: { start: number; end: number }) {
      const total = options.end - options.start + 1;
      const buf = Buffer.alloc(total, 0x41);
      const stream = new (require('stream').Readable)({ read() { this.push(buf); this.push(null); } });
      return stream;
    },
  };
  return {
    async transport() {
      return {
        async sftp<T>(operation: (value: typeof sftp) => Promise<T>): Promise<T> {
          return operation(sftp);
        },
      };
    },
  };
}

describe('remote Workspace routing', () => {
  it('maps only an exact anchor boundary and its descendants', () => {
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService & {
      anchors: Map<string, unknown>;
    };
    service.anchors = new Map([['/anchors/project', {
      anchorPath: '/anchors/project',
      uri: 'ssh://gpu/home/atlas/project',
    }]]);

    expect(service.resolveRemotePath('/anchors/project')).toBe('ssh://gpu/home/atlas/project');
    expect(service.resolveRemotePath('/anchors/project/src')).toBe('ssh://gpu/home/atlas/project/src');
    expect(service.resolveRemotePath('/anchors/project-other')).toBeUndefined();
  });

  it('routes resolution by mapped cwd and restores the original provider', async () => {
    const fs = fakeFileSystem();
    const restore = installRemoteFileSystemRouter(
      fs as never,
      fakeConnections() as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
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
      fakeConnections() as never,
      path => path.startsWith('/anchors/project')
        ? `ssh://gpu/home/atlas/project${path.slice('/anchors/project'.length)}`
        : undefined,
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
      fakeConnections() as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
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
      fakeConnections() as never,
      (path) => path === '/anchors/project' ? 'ssh://gpu/home/atlas/project' : undefined,
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
    expect(invocation.at(-1)).toContain("cd '");
    expect(invocation.at(-1)).toContain('DEMO=');
    expect(invocation.at(-1)).toContain('My Project');
  });

  it('runs packaged ripgrep requests through remote PATH rg scoped to cwd', () => {
    const invocation = buildRemoteSshInvocation(
      'ssh://gpu/home/atlas/project',
      ['/Users/me/app/node_modules/.pnpm/@vscode+ripgrep-darwin-arm64@1.18.0/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg', '--no-config', '--files'],
      undefined,
      false,
    );
    expect(invocation.at(-1)).toContain('rg');
    expect(invocation.at(-1)).toContain('--files');
    expect(invocation.at(-1)).toMatch(/--.*\./u);
    expect(invocation.at(-1)).not.toContain('ripgrep-darwin-arm64');
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
    );
    expect(invocation.at(-1)).toContain('/home/atlas/project');
    expect(invocation.at(-1)).not.toContain('/Users/me/.dsh/ssh-workspace-anchors/project');
  });

  it('gives pathless DSH content searches an explicit cwd instead of SSH stdin', () => {
    const args = ['--no-config', '--json', `--regexp=${anchor}`];
    expect(buildRemoteSshInvocation(cwd, [packagedRg, ...args], undefined, false, resolver))
      .toEqual(buildRemoteSshInvocation(cwd, ['rg', ...args, '--', '.'], undefined, false));
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
    expect(buildRemoteSshInvocation(cwd, [binary, '--files'], undefined, false).at(-1))
      .toContain(binary);
  });

  it('maps a same-host SSH URI root without changing the search pattern', () => {
    const args = ['--json', `--regexp=${cwd}`, '--', `${cwd}/src`];
    expect(buildRemoteSshInvocation(cwd, [packagedRg, ...args], undefined, false, resolver))
      .toEqual(buildRemoteSshInvocation(cwd, ['rg', '--json', `--regexp=${cwd}`, '--', '/home/atlas/project/src'], undefined, false));
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
      .toEqual(buildRemoteSshInvocation(cwd, ['rg', '--files', '--', '.'], undefined, false));
  });
});
