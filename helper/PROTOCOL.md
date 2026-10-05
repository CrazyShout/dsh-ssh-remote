# DSH Remote Helper Protocol v1

`dsh_remote_helper.py` is the bootstrap implementation of the optional remote
execution plane. It requires Python 3.8 or newer and only uses the standard
library. Linux is the primary target. The protocol is capability-driven: the
Python implementation reports `dirfd-no-follow`, not `openat2`, and reports
whether a working Bubblewrap sandbox is available.

## Transport and lifecycle

```sh
python3 dsh_remote_helper.py connect --stdio
```

`connect` starts or connects to a per-user Unix-socket daemon and proxies stdin
and stdout. The socket and lock names include the first 16 hex digits of the
helper file SHA-256, so two installed helper builds do not accidentally share a
daemon. `connect --direct` runs a non-resumable diagnostic session.

The runtime directory is `0700`, the socket is `0600`, and both must be owned by
the current UID. A long Unix-socket path is replaced with a hashed path below
`/tmp`, with the same ownership and mode checks. A detached daemon session is
retained for the negotiated retention period. Resume requires both the original
`clientId` and the 256-bit `resumeToken`; token comparison is constant-time.

Every frame is one UTF-8 JSON line no larger than 1,048,576 bytes. stdout is
protocol-only. Requests may complete out of order and must be matched by `id`.
There are at most 32 executing and 128 outstanding requests per connector;
excess requests receive retryable `E_BUSY`.

```json
{"dshRpc":"1","id":"1","method":"health/ping","params":{"nonce":"x"}}
{"dshRpc":"1","id":"1","result":{"ok":true,"nonce":"x"}}
{"dshRpc":"1","id":"2","error":{"code":"E_NOT_FOUND","message":"...","retryable":false}}
```

The server sends `server/hello` first. The client then sends `initialize`:

```json
{
  "dshRpc":"1",
  "id":"init",
  "method":"initialize",
  "params":{
    "clientId":"client-019...",
    "protocol":{"min":1,"max":1},
    "resumeToken":"optional token from an earlier connection",
    "retentionMs":600000
  }
}
```

The result contains `sessionId`, `resumeToken`, `resumed`, `serverEpoch`, exact
capabilities, and resource limits. An unknown or stale token fails with
`E_RESUME_DENIED`; it never silently creates a new resumed session.

`server/hello.params.platform.home` is the remote user's canonical home path;
`platform.shell` is the validated absolute login-shell path used by the PTY backend.

## Environment discovery

`environment/check {}` reports login-shell search availability and environment
diagnostics. `environment/resolveExecutable {command, env?, login?}` is a read-only
capability, advertised as `capabilities.environment.resolveExecutable:true`.
By default it resolves a bare name using the same scrubbed helper-process
environment (plus explicit overrides) as directly spawned processes, or verifies
an absolute executable path, and returns `{path:absolutePath}`. Explicit
`login:true` performs a bounded `sh -lc` lookup, matching the search execution
seam; the host requests this mode when translating its bundled ripgrep binary.
Relative names containing `/`, invalid environments and non-executables fail
closed; absent executables return `E_EXECUTABLE_NOT_FOUND`. The host maps its
bundled ripgrep pathname to remote `rg`, never executes a local-OS binary remotely.

These methods support native human terminal shell discovery. Human terminals use
an explicitly full-access workspace at `/` and the SSH account's permissions;
model terminal sandbox policy is separate and unchanged. The native controller
keeps session/attachment ownership, while the helper supplies raw PTY operations.

## Identifiers and idempotency

Client-supplied `clientId`, `workspaceId`, `processId`, and `operationId` use:

```text
[A-Za-z0-9._:-]{1,128}
```

Mutating methods require `operationId`. Ordinary mutations replay the stored
result for the same ID and parameters; different parameters return
`E_OPERATION_CONFLICT`. The ordinary journal retains at most 4,096 operations
for at least 600 seconds or the negotiated session retention, whichever is
longer. Entries are not evicted early to admit new mutations. Sequenced process
input and lifecycle cleanup use the bounded alternatives described below.

Cleanup (`workspace/close`, `fs/close`, `fs/writeAbort`, `process/terminate`,
`process/release`) is idempotent by **resource lifecycle**, independent of the
ordinary operation journal. A successfully closed/released resource retains
its outcome by resource ID, so retries with a new operation ID also return that
outcome. Failed cleanup is not recorded as a successful release. Unknown
process IDs still produce `E_UNKNOWN_PROCESS`, not a fictitious cleanup success.
Termination retains at most one soft and one forced outcome per live process;
the first soft termination establishes its grace period and subsequent soft
requests do not restart or extend it. A force request may still escalate it.
These lifecycle methods do not promise operation-ID conflict detection or the
same status across the transition from live to released.

Open/start admission reserves the eventual cleanup responsibility before
publishing a resource. Each session has two bounded retirement pools of
`limits.maxCleanupIdentities` (4,096): one shared by workspaces/read/upload
handles and one for process identities, including pre-start cancellation.
Live and retired identities both count. When a pool fills, **new allocation**
fails; existing resources remain closable even when both retirement admission
and the ordinary journal are saturated. Retired identities cannot be reused
within the same retention window (at least 600 seconds); clients should always
mint fresh IDs. Expiry restores allocation capacity, rather than imposing a
permanent session-lifetime allocation quota. Scope every retry to the original
session; never send a stale mutation into a newly initialized session.

`fs/readOpen` takes client-generated `handleId` and `operationId` and is
journaled. `fs/close` takes `operationId` and uses lifecycle cleanup. Unclosed
handles are closed by session GC.

## Workspaces and paths

```text
workspace/open {
  workspaceId, operationId, path: absolutePath,
  access: "read-only" | "workspace-write" | "danger-full-access"
}
workspace/close { workspaceId, operationId }
```

All subsequent filesystem and process `cwd` paths are relative POSIX paths.
Absolute paths, NUL, and `..` are rejected. The root is retained as a directory
FD; every component is walked relative to it with `O_NOFOLLOW`. This Python
implementation rejects all symlink traversal, including symlinks that would
remain inside the root. `fs/stat {follow:false}` returns symlink metadata for
lstat callers; `follow:true` fails with `E_SYMLINK`.

Available filesystem methods:

- `fs/canonicalize {workspaceId,path,allowMissing?}`
- `fs/stat {workspaceId,path,follow?}`
- `fs/list {workspaceId,path,limit?,allowTruncated?,types?}`; `limit` is capped at
  1,000 and scanning stops at `limit + 1`. Truncation is returned only when
  `allowTruncated:true`; otherwise an oversized directory returns `E_TOO_LARGE`.
  A filter such as `types:["directory"]` is applied before matched entries are
  counted, while total scanning remains capped at 100,000
- `fs/read {workspaceId,path,maxBytes?}`
- `fs/readOpen`, `fs/readNext`, `fs/close`
- `fs/write`
- `fs/mkdir`

Inline `fs/read` is capped at 512 KiB so its base64 response always fits one
protocol frame. Larger files use `fs/readOpen/readNext/close`.

`fs/stat` and directory entries return an inexpensive `s1:` token based on
device, inode, size, mode, mtime_ns, and ctime_ns. `fs/read` computes a strong
`v1:` token over the same identity plus SHA-256 content and also returns
`statVersion`. A read that changes in place fails with
`E_CHANGED_DURING_READ`.

`fs/readNext` accepts `afterSeq`. If it equals the handle's current sequence,
the helper reads and caches the next chunk. Repeating the prior `afterSeq`
returns the byte-identical cached response; any other cursor returns
`E_CURSOR`. Omitting `afterSeq` retains compatibility by reading from the
current position, but reconnect-safe clients should always send it.

`fs/write` accepts:

```json
{
  "workspaceId":"w1",
  "path":"src/a.ts",
  "encoding":"base64",
  "data":"...",
  "intent":{"kind":"replace-if-version","version":"v1:..."},
  "operationId":"write-019..."
}
```

Intent kinds are `overwrite`, `create-if-absent`, and `replace-if-version`.
Writes use a same-directory temporary file, preserve ordinary permission bits,
`fsync` data, publish create with hard-link no-replace or update with atomic
replace, and `fsync` the directory. The result includes `operation` (`create`
or `update`), strong `version`, and `statVersion`.

The guarded-write guarantee is linearizable among calls through this helper.
`externalWriterRaceFree` is deliberately `false`: standard POSIX filesystems do
not provide a general conditional rename against arbitrary writers that ignore
the helper lock.

Files too large for inline `fs/write` use the bounded upload protocol:

```text
fs/writeOpen  {workspaceId,path,intent,handleId,operationId,mode?}
fs/writeChunk {handleId,afterSeq,data,operationId}
fs/writeCommit {handleId,operationId}
fs/writeAbort  {handleId,operationId}
```

Each decoded chunk is at most 256 KiB and the upload is at most 64 MiB. Chunks
are written directly to the same-directory private temporary FD; the helper
does not join the upload in memory. `afterSeq` follows the same replay rule as
read cursors. Repeating the prior cursor with the same bytes returns the cached
response; different bytes or another cursor return `E_CURSOR`. Commit performs
the expected-version check, permission inheritance, fsync and atomic publish.
Open, chunk, and commit are protected by operationId replay journals. Abort uses
the reserved lifecycle cleanup path; after a confirmed commit, abort reports
`{aborted:false,committed:true}` rather than acting on a new upload.
A failed terminal commit whose staging resources were cleaned up retains
`{aborted:false,commitOutcome:"unconfirmed"}`: publication may have preceded the
reported failure. That identity remains retired and cannot be replaced during
the replay window. Unconfirmed staging cleanup itself remains an error.

## Processes and PTYs

```text
process/start {
  workspaceId, processId, operationId, cwd, argv,
  env?, dshEnv?, stdin?: "pipe" | "closed", tty?: {rows,cols,term?}
}
```

The remote ambient environment is inherited after deleting every `DSH_*` and
every credential-shaped key matching `KEY|PASSWORD|SECRET|TOKEN`
case-insensitively. Explicit `env` is applied afterwards and `dshEnv` overrides
it, so intentional values remain possible. argv is executed
directly without an implicit shell. A non-PTY process may start with
`stdin:"closed"`, which binds stdin to `/dev/null` atomically with spawn and
avoids a post-spawn EOF race for fast commands. The compatibility default is
`pipe`; PTY stdin cannot start closed.

`read-only` and `workspace-write` execution require a probed, working
Bubblewrap. If unavailable, start fails closed with `E_SANDBOX_UNAVAILABLE`.
The Bubblewrap profile replaces host `/proc` and `/dev`, uses a private PID
namespace, and keeps the root filesystem read-only. `workspace-write` adds a
private tmpfs at `/tmp` and binds only the selected workspace writable;
`read-only` does not add writable `/tmp`. A workspace located beneath host
`/tmp` is rebound through an inherited root FD, so the private tmpfs does not
hide it and does not expose unrelated host temporary files.
`danger-full-access` executes directly. The start result reports both `access`
and `sandbox: {mode,enforcement,backend}`. `enforcement` is `full` when the
requested mode was honored; `backend` distinguishes `none` from `bwrap`.

Methods:

- `process/read {processId,afterSeq,maxBytes?,waitMs?}`
- `process/write {processId,data,eof?,operationId,afterSeq?}` (`eof` half-closes a
  non-PTY pipe; PTY half-close is unsupported)
- `process/resize {processId,rows,cols,operationId,afterSeq?}`
- `process/status`
- `process/inspectForeground`
- `process/signal {signal,target,operationId,denyOwnShellKill?}`
- `process/terminate {graceMs?,force?,operationId}`
- `process/release {processId,operationId}`

Cancelling a client-generated process ID also cancels an allocation that has not
yet published its process record. `terminate`/`release` record a bounded,
expiring cancellation tombstone even for an unknown ID, while retaining the
`E_UNKNOWN_PROCESS` response. A reserved `terminate` returns
`{running:true,starting:true,cancellationScheduled:true}`; reserved `release`
returns retryable `E_PROCESS_STARTING`. A delayed start cannot publish a live
terminal after cancellation: it releases any created process and reports
`E_PROCESS_CANCELLED`. Never reuse process IDs. Failed host-side cleanup retains
the exact allocation identity for bounded retries and plugin-disposal cleanup.

PTY uses `openpty`, a controlling terminal, `TIOCSWINSZ`, and `tcgetpgrp`.
The multithreaded daemon never calls `Popen(preexec_fn=...)`. A long-lived spawn
broker thread owns all Popen calls, which also makes Bubblewrap's
`--die-with-parent` refer to a parent task that survives the command. Each task
starts a fresh single-thread `supervise-exec` helper, with an independent
control socket and explicitly inherited PTY/stdio descriptors. Terminal setup
uses `setsid`, `TIOCSCTTY`, and foreground process groups outside the
multithreaded daemon. Process exit facts travel through the control channel;
output completion is determined separately by the actual pipe/PTY reader.

Darwin PTYs make the actual command the controlling-session leader, because a
long-lived supervisor leader retains Darwin's `/dev/tty` vnode and prevents
real EOF. The external supervisor observes the command's wait-format exit
status with `kqueue NOTE_EXIT | NOTE_EXITSTATUS` without reaping it. Its owned
PID remains pinned until the final group signal and timer invalidation, then is
reaped. A detached same-group guardian provides crash protection without adding
a hidden child to the user command. Linux and non-PTY tasks retain the direct
supervisor-owned guardian design. `SIGCHLD` is reset to its default before fork
so an inherited ignored disposition cannot silently defeat these ownership
guarantees. On Darwin, leader exit causes the normal kernel terminal hangup;
background descendants do not artificially prolong the controlling terminal.

`process/write` loops until every decoded input byte is written and only then
applies `eof`; clients keep individual writes within the 1 MiB frame budget
(the TypeScript adapter uses 192 KiB chunks).

High-frequency clients negotiate `capabilities.process.sequencedWrite:true`
and `capabilities.pty.sequencedResize:true`. Each process has two independent
sequence lanes, one for write and one for resize. Send `afterSeq:"0"` initially;
a successful reply adds `nextSeq:"1"` (then `"2"`, etc.) to the ordinary result.
The cursor is a canonical non-negative decimal string below 2^53-1. Only one
mutation may be in flight per lane. Advance to `nextSeq` only after receiving
the reply; sending it explicitly acknowledges the previous result. Serializing
resizes permits clients to coalesce queued geometry changes before sending.

Each lane stores only its latest request digest and outcome, not one journal
entry per keystroke. Repeating that cursor with identical parameters, including
`operationId`, returns the same outcome without repeating the side effect.
Errors are cached too: a partial stdin write must never be re-executed after a
lost error response. Different parameters at the retained cursor return
`E_OPERATION_CONFLICT`; older or skipped cursors return `E_CURSOR`. Once a
result is acknowledged, its old cursor stays invalid rather than becoming a
new request. A client with an unresolved input outcome must retry the identical
request in the original resumed session or fail its input lane; it must not
invent a new cursor/payload. Missing `afterSeq` preserves the ordinary journal
contract for existing model Shell/Terminal callers. Native human terminals
require the sequence capabilities rather than silently falling back to a
per-keystroke ordinary journal.

The native host bounds queued input at both 1 MiB and 128 pending writes;
empty input is an unqueued no-op. Resize requests (including their promises)
are capped at eight. Excess requests are explicitly rejected as unsent and do
not poison already accepted requests. Allocation, I/O, and cleanup are pinned
to the original helper session before dispatch. Retained `process/status` and
cursor-bearing `process/read` queries can recover a transport timeout even
when SSH has not exited, but only when the read's requested long-poll wait is
shorter than its RPC deadline. They retain the same cursor and a single,
non-resetting retention budget across reconnects. Mutation timeouts and
file-handle cursor timeouts are not automatically replayed by this recovery
path. If a dispatched mutation becomes uncertain, a subsequent recovery-budget
expiry or failed reacquisition preserves that uncertainty rather than implying
that the mutation never ran.

Supported signals include SIGINT, SIGTERM, SIGHUP, SIGKILL, SIGQUIT, and
SIGTSTP. `target:"foreground"` obtains the foreground PGID at signal time.
Native human terminals set `denyOwnShellKill:true` for foreground SIGKILL. The
helper checks the actual target against the task/shell PGID in the same dispatch
before delivery; a separate client-side foreground probe is not an authorization
check. Closing a terminal uses its owned terminate/release lifecycle instead.

Output is retained in a 2 MiB per-process ring with monotonically increasing
string sequence numbers. `process/read` is authoritative; a cursor older than
`earliestSeq` returns `truncated:true`. Disconnecting the SSH stdio proxy does
not terminate daemon-owned processes. Its `exited`/`closed` flags become true
only after the child has exited and every stdout/stderr or PTY reader has
reached EOF, so a fast command cannot lose trailing output. Session expiry or
helper shutdown kills the complete process group and releases resources.

The daemon retains at most 16 sessions and accepts at most 64 simultaneous
connectors. Each session owns at most 32 processes. These ceilings are reported
in `server/hello.limits`; excess allocation fails with `E_RESOURCE_LIMIT`.
Detached-session expiry is checked on a monotonic 500 ms accept-loop schedule,
including iterations accepting or rejecting connections. Continuous connection
traffic therefore cannot defer GC until a quiet `accept()` timeout. Expired
sessions are removed under the daemon lock and their resources are closed
outside it; idle shutdown is rechecked under the lock after cleanup.

## Security boundary

The helper runs without sudo as the SSH account. System OpenSSH remains solely
responsible for host keys, authentication, ProxyJump, certificates, and agent
use. The Python helper improves path binding and lifecycle behavior but cannot
claim Rust `openat2` confinement, pidfd supervision, or isolation from a
malicious process running as the same Unix UID. Those remain native-helper
capabilities and must not be inferred when absent from `server/hello`.
