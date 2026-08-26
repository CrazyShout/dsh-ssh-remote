import { describe, expect, it } from 'vitest';
import { probeLocalBrowse, windowsDriveAnchors } from '../client/local-browse.js';

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

  it('resolves false when the listing rejects (native capability or none)', async () => {
    await expect(
      probeLocalBrowse(async () => {
        throw new Error('host.listDirectory needs the browse capability');
      }),
    ).resolves.toBe(false);
  });
});
