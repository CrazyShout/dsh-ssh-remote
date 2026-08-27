import { describe, expect, it } from 'vitest';
import type { SFTPWrapper } from 'ssh2';
import { Readable } from 'node:stream';
import { createRemoteFileSystemAdapter } from '../src/fs.js';

function missingPath(): Error {
  return Object.assign(new Error('no such file'), { code: 2 });
}

function remoteFileSystem(
  realpaths: Readonly<Record<string, string>>,
  symlinks: ReadonlySet<string> = new Set(),
  directories: Readonly<Record<string, ReadonlyArray<{ name: string; symlink?: boolean }>>> = {},
) {
  const calls: string[] = [];
  const sftp = {
    realpath(path: string, callback: (error: Error | undefined, resolved?: string) => void) {
      calls.push(path);
      const resolved = realpaths[path];
      queueMicrotask(() => {
        if (resolved === undefined) callback(missingPath());
        else callback(undefined, resolved);
      });
    },
    lstat(path: string, callback: (error: Error | undefined, stats?: unknown) => void) {
      queueMicrotask(() => {
        if (symlinks.has(path)) {
          callback(undefined, { isSymbolicLink: () => true });
        } else {
          callback(missingPath());
        }
      });
    },
    readdir(path: string, callback: (error: Error | undefined, entries?: unknown[]) => void) {
      const entries = directories[path];
      queueMicrotask(() => {
        if (entries === undefined) {
          callback(missingPath());
          return;
        }
        callback(undefined, entries.map((entry) => ({
          filename: entry.name,
          attrs: {
            mtime: 1,
            size: 0,
            isDirectory: () => !entry.symlink,
            isFile: () => false,
            isSymbolicLink: () => entry.symlink === true,
          },
        })));
      });
    },
  } as unknown as SFTPWrapper;
  const connections = {
    async transport() {
      return {
        async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>): Promise<T> {
          return operation(sftp);
        },
      };
    },
  };
  return {
    fs: createRemoteFileSystemAdapter(connections as never),
    calls,
  };
}

describe('remote filesystem canonical containment', () => {
  it('normalizes traversal in a direct ssh URI before asking the server', async () => {
    const { fs, calls } = remoteFileSystem({
      '/srv/workspace': '/srv/workspace',
      '/etc/passwd': '/etc/passwd',
    });
    const parent = await fs.resolve('ssh://gpu/srv/workspace');
    const child = await fs.resolve('ssh://gpu/srv/workspace/../../etc/passwd');

    expect(String(child.targetKey)).toBe('ssh://gpu/etc/passwd');
    expect(fs.contains(parent, child)).toBe(false);
    expect(calls.every((path) => !path.split('/').includes('..'))).toBe(true);
  });

  it('uses remote realpath so an existing symlink cannot escape containment', async () => {
    const { fs } = remoteFileSystem({
      '/workspace': '/srv/workspace',
      '/workspace/link/secret': '/etc/secret',
    });
    const parent = await fs.resolve('ssh://gpu/workspace');
    const child = await fs.resolve('ssh://gpu/workspace/link/secret');

    expect(String(parent.targetKey)).toBe('ssh://gpu/srv/workspace');
    expect(String(child.targetKey)).toBe('ssh://gpu/etc/secret');
    expect(fs.contains(parent, child)).toBe(false);
  });

  it('canonicalizes the nearest existing parent for a missing write target', async () => {
    const { fs, calls } = remoteFileSystem({
      '/workspace': '/srv/workspace',
    });
    const target = await fs.resolve('ssh://gpu/workspace/new/../created/file.txt');

    expect(String(target.targetKey)).toBe('ssh://gpu/srv/workspace/created/file.txt');
    expect(calls).toEqual([
      '/workspace/created/file.txt',
      '/workspace/created',
      '/workspace',
    ]);
  });

  it('fails closed for a dangling symlink instead of treating it as a missing leaf', async () => {
    const { fs } = remoteFileSystem(
      { '/workspace': '/srv/workspace' },
      new Set(['/workspace/dangling']),
    );

    await expect(fs.resolve('ssh://gpu/workspace/dangling')).rejects.toMatchObject({
      code: 'FS_SANDBOX_DENIED',
    });
  });

  it('canonicalizes symlink targets returned by listDir before exposing them', async () => {
    const { fs } = remoteFileSystem(
      {
        '/workspace': '/srv/workspace',
        '/srv/workspace/link': '/etc/secret',
      },
      new Set(),
      { '/srv/workspace': [{ name: 'link', symlink: true }] },
    );
    const parent = await fs.resolve('ssh://gpu/workspace');
    const [entry] = await fs.listDir(parent);

    expect(String(entry.target.targetKey)).toBe('ssh://gpu/etc/secret');
    expect(fs.contains(parent, entry.target)).toBe(false);
  });

  it('normalizes relative paths against an ssh cwd and defensively normalizes target keys', async () => {
    const { fs } = remoteFileSystem({
      '/workspace/other/file': '/srv/other/file',
    });
    const target = await fs.resolve('../other/./file', { cwd: 'ssh://gpu/workspace/project' });
    expect(String(target.targetKey)).toBe('ssh://gpu/srv/other/file');

    const parent = { targetKey: 'ssh://gpu/srv/workspace', displayPath: 'workspace' } as never;
    const crafted = {
      targetKey: 'ssh://gpu/srv/workspace/../../etc/passwd',
      displayPath: 'crafted',
    } as never;
    expect(fs.contains(parent, crafted)).toBe(false);
  });

  it('returns a file URI in the remote execution world', () => {
    const { fs } = remoteFileSystem({});
    const target = {
      targetKey: 'ssh://gpu/home/atlas/My Project/file#1.txt',
      displayPath: 'remote',
    } as never;
    expect(fs.fileUrl(target)).toBe('file:///home/atlas/My%20Project/file%231.txt');
  });
});

describe('remote filesystem streaming text', () => {
  it('decodes UTF-8 across SFTP chunk boundaries without buffering the whole file', async () => {
    const content = Buffer.from('A🙂B', 'utf8');
    const sftp = {
      createReadStream() {
        return Readable.from([
          content.subarray(0, 2),
          content.subarray(2, 4),
          content.subarray(4),
        ]);
      },
    } as unknown as SFTPWrapper;
    const fs = createRemoteFileSystemAdapter({
      async transport() {
        return { async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>) { return operation(sftp); } };
      },
    } as never);
    const target = { targetKey: 'ssh://gpu/work/file.txt', displayPath: 'remote' } as never;
    const chunks: string[] = [];

    for await (const chunk of await fs.streamText(target)) chunks.push(chunk);

    expect(chunks.join('')).toBe('A🙂B');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('rejects NUL bytes as non-text while streaming', async () => {
    const sftp = {
      createReadStream() {
        return Readable.from([Buffer.from([0x61, 0x00, 0x62])]);
      },
    } as unknown as SFTPWrapper;
    const fs = createRemoteFileSystemAdapter({
      async transport() {
        return { async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>) { return operation(sftp); } };
      },
    } as never);
    const target = { targetKey: 'ssh://gpu/work/file.txt', displayPath: 'remote' } as never;
    const consume = async () => {
      for await (const _chunk of await fs.streamText(target)) {
        // consume
      }
    };

    await expect(consume()).rejects.toMatchObject({ code: 'FS_NOT_TEXT' });
  });
});

const ATOMIC_TARGET = '/work/file.txt';

function atomicRemoteFileSystem(options: {
  unsupportedRename?: boolean;
  mutateAfterTempWrite?: boolean;
  missingOnGuardStat?: boolean;
  missingOnGuardRead?: boolean;
} = {}) {
  let target = {
    content: Buffer.from('old', 'utf8'),
    mtime: 10,
    mode: 0o100640,
    uid: 1000,
    gid: 1000,
  };
  let temporary: { path: string; content: Buffer; mode: number } | undefined;
  const writes: string[] = [];
  const chmods: number[] = [];
  let renameCalls = 0;
  let unlinks = 0;
  let statCalls = 0;
  let readCalls = 0;
  const stats = () => ({
    mtime: target.mtime,
    size: target.content.length,
    mode: target.mode,
    uid: target.uid,
    gid: target.gid,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  });
  const sftp = {
    stat(path: string, callback: (error: Error | undefined, value?: unknown) => void) {
      statCalls += 1;
      queueMicrotask(() => {
        if (options.missingOnGuardStat && statCalls === 4) callback(missingPath());
        else if (path === ATOMIC_TARGET) callback(undefined, stats());
        else callback(missingPath());
      });
    },
    readFile(path: string, callback: (error: Error | undefined, value?: Buffer) => void) {
      readCalls += 1;
      queueMicrotask(() => {
        if (options.missingOnGuardRead && readCalls === 2) callback(missingPath());
        else if (path === ATOMIC_TARGET) callback(undefined, Buffer.from(target.content));
        else callback(missingPath());
      });
    },
    writeFile(
      path: string,
      data: Buffer,
      optionsOrCallback: object | ((error?: Error) => void),
      callbackMaybe?: (error?: Error) => void,
    ) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callbackMaybe!;
      writes.push(path);
      queueMicrotask(() => {
        if (path === ATOMIC_TARGET) {
          target = { ...target, content: Buffer.from(data), mtime: target.mtime + 1 };
        } else {
          temporary = { path, content: Buffer.from(data), mode: 0o666 };
          if (options.mutateAfterTempWrite) {
            target = {
              ...target,
              // Same size and all-identical SFTP v3 metadata: only the final
              // content-basis check can detect this external writer.
              content: Buffer.from('new', 'utf8'),
            };
          }
        }
        callback();
      });
    },
    chmod(path: string, mode: number, callback: (error?: Error) => void) {
      queueMicrotask(() => {
        if (temporary?.path !== path) return callback(missingPath());
        temporary.mode = mode;
        chmods.push(mode);
        callback();
      });
    },
    ext_openssh_rename(source: string, destination: string, callback: (error?: Error) => void) {
      renameCalls += 1;
      queueMicrotask(() => {
        if (options.unsupportedRename) {
          callback(Object.assign(new Error('operation unsupported'), { code: 8 }));
          return;
        }
        if (temporary?.path !== source || destination !== ATOMIC_TARGET) {
          callback(missingPath());
          return;
        }
        target = {
          ...target,
          content: Buffer.from(temporary.content),
          mode: 0o100000 | temporary.mode,
          mtime: target.mtime + 1,
        };
        temporary = undefined;
        callback();
      });
    },
    unlink(path: string, callback: (error?: Error) => void) {
      queueMicrotask(() => {
        unlinks += 1;
        if (temporary?.path === path) temporary = undefined;
        callback();
      });
    },
  } as unknown as SFTPWrapper;
  const connections = {
    async transport() {
      return {
        async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>): Promise<T> {
          return operation(sftp);
        },
      };
    },
  };
  return {
    fs: createRemoteFileSystemAdapter(connections as never),
    target: { targetKey: `ssh://gpu${ATOMIC_TARGET}`, displayPath: ATOMIC_TARGET } as never,
    content: () => target.content.toString('utf8'),
    mode: () => target.mode,
    writes,
    chmods,
    renameCalls: () => renameCalls,
    unlinks: () => unlinks,
  };
}

describe('remote filesystem atomic guarded writes', () => {
  it('preserves the existing mode on the temporary file before atomic publish', async () => {
    const remote = atomicRemoteFileSystem();
    const observed = await remote.fs.stat(remote.target);
    expect(observed?.version).toBeDefined();

    await remote.fs.writeText(remote.target, 'replacement', {
      kind: 'replaceIfVersion',
      version: observed!.version,
    });

    expect(remote.chmods).toEqual([0o640]);
    expect(remote.renameCalls()).toBe(1);
    expect(remote.content()).toBe('replacement');
    expect(remote.mode()).toBe(0o100640);
  });

  it('refuses a same-second same-size external edit after upload', async () => {
    const remote = atomicRemoteFileSystem({ mutateAfterTempWrite: true });
    const observed = await remote.fs.stat(remote.target);

    await expect(remote.fs.writeText(remote.target, 'replacement', {
      kind: 'replaceIfVersion',
      version: observed!.version,
    })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' });

    expect(remote.renameCalls()).toBe(0);
    expect(remote.content()).toBe('new');
    expect(remote.unlinks()).toBe(1);
  });

  it('fails closed when the server lacks atomic posix-rename', async () => {
    const remote = atomicRemoteFileSystem({ unsupportedRename: true });

    await expect(remote.fs.writeText(remote.target, 'replacement')).rejects.toMatchObject({
      code: 'FS_IO_ERROR',
    });

    expect(remote.writes).toHaveLength(1);
    expect(remote.writes[0]).not.toBe(ATOMIC_TARGET);
    expect(remote.content()).toBe('old');
    expect(remote.unlinks()).toBe(1);
  });

  it.each([
    ['metadata recheck', { missingOnGuardStat: true }],
    ['content recheck', { missingOnGuardRead: true }],
  ] as const)('reports stale when the target disappears during %s', async (_stage, options) => {
    const remote = atomicRemoteFileSystem(options);
    const observed = await remote.fs.stat(remote.target);

    await expect(remote.fs.writeText(remote.target, 'replacement', {
      kind: 'replaceIfVersion',
      version: observed!.version,
    })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' });

    expect(remote.renameCalls()).toBe(0);
    expect(remote.unlinks()).toBe(1);
  });
});

function atomicCreateRemoteFileSystem(options: {
  raceKind?: 'file' | 'directory' | 'symlink';
  ambiguousFailure?: boolean;
  unsupportedHardlink?: boolean;
} = {}) {
  let target: Buffer | undefined;
  let targetKind: 'file' | 'directory' | 'symlink' = 'file';
  let temporary: { path: string; content: Buffer } | undefined;
  const writes: string[] = [];
  const writeModes: number[] = [];
  let hardlinkCalls = 0;
  let targetVisibleWhileWriting = false;
  const fileStats = () => ({
    mtime: 20,
    size: target?.length ?? 0,
    mode: 0o100644,
    uid: 1000,
    gid: 1000,
    isFile: () => targetKind === 'file',
    isDirectory: () => targetKind === 'directory',
    isSymbolicLink: () => targetKind === 'symlink',
  });
  const sftp = {
    stat(path: string, callback: (error: Error | undefined, value?: unknown) => void) {
      queueMicrotask(() => {
        if (path === ATOMIC_TARGET && target !== undefined) callback(undefined, fileStats());
        else callback(missingPath());
      });
    },
    lstat(path: string, callback: (error: Error | undefined, value?: unknown) => void) {
      queueMicrotask(() => {
        if (path === ATOMIC_TARGET && target !== undefined) callback(undefined, fileStats());
        else callback(missingPath());
      });
    },
    writeFile(
      path: string,
      data: Buffer,
      writeOptions: { mode?: number },
      callback: (error?: Error) => void,
    ) {
      writes.push(path);
      if (writeOptions.mode !== undefined) writeModes.push(writeOptions.mode);
      targetVisibleWhileWriting ||= target !== undefined;
      queueMicrotask(() => {
        temporary = { path, content: Buffer.from(data) };
        callback();
      });
    },
    ext_openssh_hardlink(source: string, destination: string, callback: (error?: Error) => void) {
      hardlinkCalls += 1;
      queueMicrotask(() => {
        if (options.unsupportedHardlink) {
          callback(Object.assign(new Error('hardlink unsupported'), { code: 8 }));
          return;
        }
        if (options.raceKind !== undefined) {
          targetKind = options.raceKind;
          target = options.raceKind === 'file'
            ? Buffer.from('racer', 'utf8')
            : Buffer.alloc(0);
          callback(Object.assign(new Error('failure'), { code: 4 }));
          return;
        }
        if (options.ambiguousFailure) {
          callback(Object.assign(new Error('failure'), { code: 4 }));
          return;
        }
        if (temporary?.path !== source || destination !== ATOMIC_TARGET) {
          callback(missingPath());
          return;
        }
        target = Buffer.from(temporary.content);
        callback();
      });
    },
    unlink(path: string, callback: (error?: Error) => void) {
      queueMicrotask(() => {
        if (temporary?.path === path) temporary = undefined;
        callback();
      });
    },
  } as unknown as SFTPWrapper;
  const connections = {
    async transport() {
      return {
        async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>): Promise<T> {
          return operation(sftp);
        },
      };
    },
  };
  return {
    fs: createRemoteFileSystemAdapter(connections as never),
    targetKey: { targetKey: `ssh://gpu${ATOMIC_TARGET}`, displayPath: ATOMIC_TARGET } as never,
    content: () => target?.toString('utf8'),
    writes,
    writeModes,
    hardlinkCalls: () => hardlinkCalls,
    targetVisibleWhileWriting: () => targetVisibleWhileWriting,
  };
}

describe('remote filesystem atomic create-if-absent', () => {
  it('publishes a complete temporary inode with OpenSSH hardlink', async () => {
    const remote = atomicCreateRemoteFileSystem();

    const outcome = await remote.fs.writeText(remote.targetKey, 'complete', {
      kind: 'createIfAbsent',
    });

    expect(outcome.operation).toBe('create');
    expect(remote.writes).toHaveLength(1);
    expect(remote.writes[0]).not.toBe(ATOMIC_TARGET);
    expect(remote.writeModes).toEqual([0o600]);
    expect(remote.targetVisibleWhileWriting()).toBe(false);
    expect(remote.hardlinkCalls()).toBe(1);
    expect(remote.content()).toBe('complete');
  });

  it('maps a competing destination publish to FS_NOT_OBSERVED', async () => {
    const remote = atomicCreateRemoteFileSystem({ raceKind: 'file' });

    await expect(remote.fs.writeText(remote.targetKey, 'ours', {
      kind: 'createIfAbsent',
    })).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' });

    expect(remote.content()).toBe('racer');
  });

  it.each(['directory', 'symlink'] as const)(
    'rejects a competing %s as a non-regular target',
    async (raceKind) => {
      const remote = atomicCreateRemoteFileSystem({ raceKind });

      await expect(remote.fs.writeText(remote.targetKey, 'ours', {
        kind: 'createIfAbsent',
      })).rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' });
    },
  );

  it('maps an ambiguous OpenSSH failure with no remaining target to FS_IO_ERROR', async () => {
    const remote = atomicCreateRemoteFileSystem({ ambiguousFailure: true });

    await expect(remote.fs.writeText(remote.targetKey, 'ours', {
      kind: 'createIfAbsent',
    })).rejects.toMatchObject({ code: 'FS_IO_ERROR' });
  });

  it('fails closed when atomic hardlink publication is unsupported', async () => {
    const remote = atomicCreateRemoteFileSystem({ unsupportedHardlink: true });

    await expect(remote.fs.writeText(remote.targetKey, 'ours', {
      kind: 'createIfAbsent',
    })).rejects.toMatchObject({ code: 'FS_IO_ERROR' });

    expect(remote.content()).toBeUndefined();
  });
});

describe('remote filesystem edit guards', () => {
  it('reports stale when the file disappears after the edit basis is read', async () => {
    let exists = true;
    const sftp = {
      readFile(_path: string, callback: (error: Error | undefined, value?: Buffer) => void) {
        queueMicrotask(() => {
          callback(undefined, Buffer.from('old', 'utf8'));
          exists = false;
        });
      },
      stat(_path: string, callback: (error: Error | undefined, value?: unknown) => void) {
        queueMicrotask(() => {
          if (!exists) callback(missingPath());
          else callback(undefined, {
            mtime: 1,
            size: 3,
            mode: 0o100644,
            uid: 1000,
            gid: 1000,
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
          });
        });
      },
    } as unknown as SFTPWrapper;
    const fs = createRemoteFileSystemAdapter({
      async transport() {
        return { async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>) { return operation(sftp); } };
      },
    } as never);
    const target = { targetKey: `ssh://gpu${ATOMIC_TARGET}`, displayPath: ATOMIC_TARGET } as never;

    await expect(fs.editText(target, {
      oldString: 'old',
      newString: 'new',
      replaceAll: false,
    })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' });
  });
});
