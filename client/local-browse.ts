/**
 * Pure helpers for the local half of the combined directory flow. Kept free
 * of React and wire types so vitest can cover them without a DOM.
 */

/** One quick-location chip shown above the local browsing list. */
export interface LocalAnchor {
  /** Chip label (e.g. `Windows · C:`). */
  label: string;
  /** Absolute host path the chip navigates to. */
  path: string;
}

/**
 * Windows drive quick anchors derived from one `/mnt` listing. WSL's default
 * automount exposes every Windows drive as a single-letter directory under
 * `/mnt` — exactly the seam where a WSL-hosted DSH reaches the Windows side
 * of the machine. Any other layout (plain Linux, macOS, custom mounts)
 * yields no anchors, so the row simply stays empty.
 */
export function windowsDriveAnchors(entries: ReadonlyArray<{ name: string }>): LocalAnchor[] {
  return entries
    .filter((entry) => /^[A-Za-z]$/.test(entry.name))
    .map((entry) => ({
      label: `Windows · ${entry.name.toUpperCase()}:`,
      path: `/mnt/${entry.name.toLowerCase()}`,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Whether a thrown browse failure is the explicit capability-unavailable
 * signal. The runtime's `DirectoryBrowseError` carries the RPC error body as
 * `rpcError`; only `rpcError.code === 'directory-picker-unavailable'` means
 * the composed picker serves no `browse` capability. Permission, timeout,
 * transport, internal, and every other code is a real browse failure and must
 * never trigger a native-picker fallback. Kept structural (no wire import) so
 * the module stays free of runtime/DOM dependencies for unit tests.
 */
export function isDirectoryPickerUnavailable(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  return (reason as { rpcError?: { code?: unknown } }).rpcError?.code === 'directory-picker-unavailable';
}

/**
 * Whether the composed directory picker serves the `browse` capability: one
 * harmless home-directory listing either succeeds (`browse`) or fails with
 * the explicit `directory-picker-unavailable` signal (`native` or no picker
 * at all). Any other failure — permission, timeout, transport, internal — is
 * rethrown unchanged: the caller must surface it in the dialog for retry, not
 * treat it as a capability absence. Unlike driving the native chooser, the
 * probe never opens an OS dialog, so it is safe to run on every flow open.
 */
export async function probeLocalBrowse(listHome: () => Promise<unknown>): Promise<boolean> {
  try {
    await listHome();
    return true;
  } catch (reason) {
    if (isDirectoryPickerUnavailable(reason)) return false;
    throw reason;
  }
}
