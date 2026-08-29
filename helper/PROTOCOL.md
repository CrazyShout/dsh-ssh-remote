# DSH Remote Helper Protocol v1

`dsh_remote_helper.py` is the bootstrap implementation of the optional remote
execution plane. It requires Python 3.9 or newer and only uses the standard
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

## Identifiers and idempotency

Client-supplied `clientId`, `workspaceId`, `processId`, and `operationId` use:

```text
[A-Za-z0-9._:-]{1,128}
```

Mutating methods require `operationId`. Replaying the same ID with the same
parameters returns the stored result; different parameters return
`E_OPERATION_CONFLICT`. This applies to workspace open/close, file write/mkdir,
and process start/write/resize/signal/terminate/release.

`fs/readOpen` takes client-generated `handleId` and `operationId`; `fs/close`
takes `operationId`. Both are journaled mutations. Unclosed handles are closed
by session GC.

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
Open, chunk, commit, and abort are protected by operationId replay journals.

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
- `process/write {processId,data,eof?,operationId}` (`eof` half-closes a
  non-PTY pipe; PTY half-close is unsupported)
- `process/resize {processId,rows,cols,operationId}`
- `process/status`
- `process/inspectForeground`
- `process/signal {signal,target,operationId}`
- `process/terminate {graceMs?,force?,operationId}`
- `process/release {processId,operationId}`

PTY uses `openpty`, a controlling terminal, `TIOCSWINSZ`, and `tcgetpgrp`.
The multithreaded daemon never calls `Popen(preexec_fn=...)`. A long-lived spawn
broker thread owns all Popen calls, which also makes Bubblewrap's
`--die-with-parent` refer to a parent task that survives the command. PTY starts
a fresh single-thread `pty-exec` helper with the slave FD in `pass_fds`; that
launcher performs `setsid`, `TIOCSCTTY`, descriptor duplication, and `execvpe`.
`process/write` loops until every decoded input byte is written and only then
applies `eof`; clients keep individual writes within the 1 MiB frame budget
(the TypeScript adapter uses 192 KiB chunks).
Supported signals include SIGINT, SIGTERM, SIGHUP, SIGKILL, SIGQUIT, and
SIGTSTP. `target:"foreground"` obtains the foreground PGID at signal time.

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

## Security boundary

The helper runs without sudo as the SSH account. System OpenSSH remains solely
responsible for host keys, authentication, ProxyJump, certificates, and agent
use. The Python helper improves path binding and lifecycle behavior but cannot
claim Rust `openat2` confinement, pidfd supervision, or isolation from a
malicious process running as the same Unix UID. Those remain native-helper
capabilities and must not be inferred when absent from `server/hello`.
