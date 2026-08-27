import { describe, expect, it } from 'vitest';
import {
  isDirectoryPickerUnavailable,
  probeLocalBrowse,
  windowsDriveAnchors,
} from '../client/local-browse.js';

/** A browse failure shaped like the runtime's `DirectoryBrowseError`. */
function browseError(code: string, message: string): Error {
  return Object.assign(new Error(`directory browse failed: ${code}: ${message}`), {
    name: 'DirectoryBrowseError',
    rpcError: {
      code,
      message,
      // The unavailable signal names the capability the composition actually
      // serves (the host sets `capability` to `capability.kind`).
      details: code === 'directory-picker-unavailable' ? { capability: 'native' } : { path: '/x' },
    },
  });
}

describe('windowsDriveAnchors', () => {
  it('derives normalized, sorted drive anchors from single-letter /mnt entries', () => {
    expect(
      windowsDriveAnchors([{ name: 'd' }, { name: 'c' }]),
    ).toEqual([
      { label: 'Windows · C:', path: '/mnt/c' },
      { label: 'Windows · D:', path: '/mnt/d' },
    ]);
  });

  it('ignores non-drive entries so plain Linux/macOS layouts yield no anchors', () => {
    expect(
      windowsDriveAnchors([
        { name: 'wsl' },
        { name: 'Users' },
        { name: '.git' },
        { name: '' },
        { name: 'cdrom' },
      ]),
    ).toEqual([]);
  });
});

describe('probeLocalBrowse', () => {
  it('resolves true when the home listing succeeds (browse capability)', async () => {
    await expect(probeLocalBrowse(async () => ({ path: '/home/ais' }))).resolves.toBe(true);
  });

  it('resolves false only for the explicit directory-picker-unavailable signal', async () => {
    await expect(
      probeLocalBrowse(async () => {
        throw browseError('directory-picker-unavailable', 'composition serves native');
      }),
    ).resolves.toBe(false);
  });

  it('rethrows a permission-style browse failure unchanged (no fallback)', async () => {
    const denied = browseError('directory-unreadable', 'permission denied');
    await expect(
      probeLocalBrowse(async () => {
        throw denied;
      }),
    ).rejects.toBe(denied);
  });

  it('rethrows plain transport/timeout failures unchanged (no fallback)', async () => {
    const transport = new Error('connection lost');
    await expect(
      probeLocalBrowse(async () => {
        throw transport;
      }),
    ).rejects.toBe(transport);
  });

  it('rethrows non-Error failures unchanged (no fallback)', async () => {
    const reason = { wire: 'unexpected' };
    await expect(
      probeLocalBrowse(async () => {
        throw reason;
      }),
    ).rejects.toBe(reason);
  });
});

describe('isDirectoryPickerUnavailable', () => {
  it('recognizes only the explicit capability-unavailable code', () => {
    expect(
      isDirectoryPickerUnavailable(browseError('directory-picker-unavailable', 'no picker')),
    ).toBe(true);
    // Non-capability browse failures can never trigger a native fallback.
    expect(isDirectoryPickerUnavailable(browseError('directory-unreadable', 'permission denied'))).toBe(false);
    expect(isDirectoryPickerUnavailable(browseError('directory-create-failed', 'read-only fs'))).toBe(false);
    expect(isDirectoryPickerUnavailable(new Error('connection lost'))).toBe(false);
    expect(isDirectoryPickerUnavailable(null)).toBe(false);
    expect(isDirectoryPickerUnavailable(undefined)).toBe(false);
  });
});
