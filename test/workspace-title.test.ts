import { describe, expect, it } from 'vitest';
import { isWorkspaceNameConflict, remoteWorkspaceTitleCandidates } from '../client/workspace-title.js';

describe('remote workspace titles', () => {
  it('adds parent directories one level at a time', () => {
    expect(remoteWorkspaceTitleCandidates('/code/schci_review/schci', '172.22.1.9')).toEqual([
      'schci · 172.22.1.9',
      'schci_review · schci · 172.22.1.9',
      'code · schci_review · schci · 172.22.1.9',
    ]);
  });

  it('keeps a stable title for the remote root', () => {
    expect(remoteWorkspaceTitleCandidates('/', 'alpha')).toEqual(['root · alpha']);
  });

  it('recognizes the current Workspace client conflict error', () => {
    const conflict = new Error(
      "workspace rename failed: workspace/name-conflict: Workspace name 'schci · 172.22.1.9' is already in use",
    );
    expect(isWorkspaceNameConflict(conflict)).toBe(true);
  });

  it('also accepts a structured name-conflict code', () => {
    const conflict = Object.assign(new Error('rename rejected'), {
      rpcError: { code: 'workspace/name-conflict' },
    });
    expect(isWorkspaceNameConflict(conflict)).toBe(true);
  });

  it('does not classify unrelated failures as conflicts', () => {
    const timeout = new Error('工作区命名超过 30 秒；结果未知，请刷新后核对。');
    expect(isWorkspaceNameConflict(timeout)).toBe(false);
    expect(isWorkspaceNameConflict(undefined)).toBe(false);
  });
});
