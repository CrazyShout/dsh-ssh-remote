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
    listDir: vi.fn(),
    writeText: vi.fn(),
    editText: vi.fn(),
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
      {} as never,
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
    restore();
  });
});

describe('OpenSSH process invocation', () => {
  it('quotes cwd, argv and explicit environment into one remote shell command', () => {
    const invocation = buildRemoteSshInvocation(
      'ssh://atlas@gpu:2202/home/atlas/My Project',
      ['bash', '-lc', "printf '%s' ok"],
      { DEMO: "a'b" },
      false,
    );
    expect(invocation.slice(0, 6)).toEqual(['ssh', '-T', '-p', '2202', 'atlas@gpu', '--']);
    expect(invocation.at(-1)).toContain("cd '");
    expect(invocation.at(-1)).toContain('DEMO=');
    expect(invocation.at(-1)).toContain('My Project');
  });
});
