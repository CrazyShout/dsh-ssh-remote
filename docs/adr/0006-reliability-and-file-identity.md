# ADR-0006: Bounded recovery and file identity

Status: reliability hardening in 0.5.1; native external-open integration remains
blocked by the DSH 0.2.0-rc.2 public contract.

## Recovery and mutation outcomes

A human terminal pins its originally allocated helper session and process. A
stable manager facade may wait for classified transient acquisition failures
within the negotiated retention window. Explicit disconnect closes that facade;
it must not be replaced by a fresh `manager.client()` lookup on every poll.
Permanent errors, session replacement, expiry and cancellation stop the wait.
Transport recovery is not restoration across a DSH process restart.

Timeout recovery is restricted to retained process status and output reads with
an explicit cursor and a server long-poll shorter than the RPC deadline. Other
timeouts, especially mutations, are not blindly replayed. The recovery budget
does not reset at each successful handshake. An already-sent mutation retains
its uncertainty marker when subsequent acquisition, cancellation or expiry fails.
Allocation's first mutations also pin the original session, not just later I/O.

Unsent input may wait for recovery. Once sent, only the existing bounded replay
with identical parameters, operation ID and session identity is allowed. An
unresolved result does not prove that input was undone. The input lane refuses
further mutations rather than reusing a cursor with different bytes.

Each process has separate acknowledged input and resize lanes. Each lane retains
only its last outcome, including errors after a partial write. New cursors
acknowledge the preceding result; old/skipped cursors and conflicting parameters
fail explicitly. Native terminals require the corresponding capabilities before
allocating. Legacy model callers retain their existing operation journal.

Resource allocation reserves bounded retirement capacity. Cleanup must not need
another free slot in the general mutation journal. Resource IDs are retired for
the replay lifetime, never reused while a delayed cleanup could target them.
Repeated termination cannot indefinitely postpone an already armed escalation.
Continuous accepts do not postpone the monotonic daemon expiry sweep.

## Session-owned Markdown images

The rc.2 Markdown file-image URL builder loses session identity by converting
execution-world paths into `/api/file?path=...`. That endpoint resolves paths in
the local Host. Replace only the built-in Markdown keyed body with the public
`MarkdownText` primitive and session-scoped `workspaceFiles.readBytes`, using
the document resource address rather than the currently selected conversation.
Do not mutate `absolutePath` or duplicate a private renderer implementation.

Image work starts after React commits. Byte windows verify stable file identity;
bounded concurrency, entry counts, per-image and retained-byte budgets constrain
the cache. An uncooperative timed-out read stops further dispatch for that cache.
Image dependencies replace the renderer's previous snapshot, while the native
owner retains the root document. Closing/reloading revokes Blob URLs and aborts
reads. Page appends retain the cache; changed documents reset it. Failed images
remain inert with a notice, never a local-path or external-resource fallback.
HTTP(S) images retain the public Markdown primitive's existing behavior.

This uses optional child injection and a public keyed slot, not new mandatory
runtime services; a composition without document preview still loads SSH.

## Native external-open boundary

`WorkspaceFileStat.absolutePath` is an execution-world absolute path. It is not
an identity-bearing SSH URI. Rewriting that field into a URI breaks the public
contract and other consumers. The file resource address carries the session
identity separately.

In rc.2, native `openWorkspacePath` and `workspacePathApplications` receive a path
but no session ID. The directory open-in-app HTTP handler directly checks the
local filesystem. The `workspace.openLocal` shortcut reaches that handler using
the session's cwd, which is a local anchor for SSH workspaces. None of those
paths can safely infer remote identity from a bare absolute path. A local and a
remote file can legitimately share the same path string.

Public slots can replace a button, but returning null does not reveal the
underlying registered component. They do not guard the original keyboard/menu
shortcut. The rc.2 shortcut registry rejects duplicate IDs/default bindings;
the web route registry rejects duplicate routes and exposes no middleware or
safe handler delegation. Hiding buttons alone therefore is not a complete fix.

Do not inspect the DOM, call private stored renderer components, patch installed
application bundles, falsify file metadata, or block all matching local paths.
Do not describe local editor/reveal actions as remote-capable. Users should use
in-app read-only previews and the SSH terminal until an upstream session-aware
open contract plus shortcut guard (or supported composition-level replacement)
is available. The limitation is documented, not marked fixed.

This boundary concerns the existing native actions, including keyboard/menu
dispatch. It does not preclude a separate, explicitly labelled VS Code
Remote-SSH action that carries a verified SSH alias and remote path. That
independent feature is planned in the [development roadmap](../ROADMAP.md), not
implemented by 0.5.1. A downloaded snapshot must not be presented as remote editing.

## Verification boundaries

Protocol stress tests, real subprocess cleanup tests, actual helper socket
resume tests and component tests cover distinct layers. Linux sandbox positive
tests must execute under bubblewrap successfully when required, not silently
skip or relax host protection. Build success alone is not Web/Desktop acceptance.
