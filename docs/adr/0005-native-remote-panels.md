# ADR-0005: Native remote files and human terminals

Status: implemented for DSH 0.2.0-rc.2, plugin 0.5.0.

## Problem

Model-facing file tools and `ctx.terminals` do not provide a complete human
workspace UI. The native human TerminalController consumes Agent-scoped
`ctx.subprocess`, not the model TerminalRegistry. Routing only `spawnTerminal`
leaves shell discovery on the local OS and loses helper lifecycle guarantees.

## Decision

Reuse DSH's existing files, document preview and terminal sidebar tabs. Add
shortcuts through public list slots (`conversation.session.header.utilities`
and, for blank sessions, `conversation.input.dock`). Never replace single-slot
owners, inspect the DOM, create a second terminal API or ship another xterm.
`workspaceInfo(cwd)` resolves only persisted SSH anchors/descendants, without
opening a connection. Local directories and lookalike names return null.

Human terminal routing uses public Cordis service tracing and `dsh-scope`:

`dsh-scope` is a declared runtime peer, not an inlined/private runtime copy:
its scope symbols and parent map are module-local identities. The official
profile resolver redirects declared peers from linked plugins to the owning
CLI/Desktop installation. Deploy the manifest and compiled files together and
restart the process; copying only `lib` does not establish this singleton seam.

1. Register every live Agent scope, including explicit local boundaries.
2. Resolve shell/platform/executable in the nearest Agent's execution world.
3. Normalize cwd consistently, reject cross-host calls, preserve synchronous
   generic `spawn` compatibility, and use helper PTYs for async `spawnTerminal`.
4. Delegate raw streams, writes, resize and foreground signals to the helper.
   Keep native controller ownership, attachment, screen retention and recovery.
5. Close owned allocations on abort/disposal, pin helper session identity, bound
   input/output, drain retained output, and report uncertain writes honestly.

Manual terminals intentionally have the SSH user's permissions, matching DSH's
local human terminal contract. Model Shell and Terminal keep their existing
sandbox policies; this adapter does not weaken them.

Native `WorkspaceFiles.list` uses read-only, dirfd-confined helper workspaces and
returns at most 1,000 validated entries plus `truncated`. Generic `fs.listDir`
still fails rather than returning an apparently complete partial directory.
Other native previews retain the official read/stat/byte-range contract and use
the existing FS router. Remote watches fail explicitly and the native tree uses
manual refresh, never a local watcher on an unrelated path.

## Boundaries and checks

- Files are read-only previews, not a remote editor. Symlink traversal is refused.
- Raw file reads preserve DSH's absolute-path contract; directory browsing stays
  within the selected workspace. Model write policy is unchanged.
- The native sidebar requires a real session, which may be empty; a pre-session
  start page has no owner. No model call is needed to create an empty session.
- Optional services use child fibers. Missing native panels do not leave the
  SSH plugin pending. Agent disposal fails closed rather than routing locally.
- Tests exercise real Cordis tracing, the official WorkspaceFiles and human
  TerminalController, real Python helpers, and frontend list-slot interactions.
  `scripts/smoke-user-terminal.mjs <alias>` is an explicit opt-in SSH check using
  only a fresh test directory. Real UI acceptance is recorded separately.
