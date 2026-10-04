# dsh-ssh-remote

English | [中文](README.md)

Codex-style SSH workspaces for DeepSeek Harness Web / Desktop. The plugin discovers concrete
hosts from your local OpenSSH configuration, lets you add a remote directory
through the normal **Add Workspace** dialog, and routes standard DSH file,
shell, and terminal operations to a versioned helper on that host.

## 0.5.0: native remote file and user-terminal panels

Open an SSH workspace session and select **Remote files** or **Remote terminal**
(currently labelled 远程文件 / 远程终端). Shortcuts appear above the input for an
empty session and in the conversation header after chatting. No model prompt is
required; both open DSH's native right sidebar.

- Browse directories lazily and use native read-only file previews, including
  Unicode/space paths. Each directory is bounded to 1,000 entries with explicit
  truncation. Remote watches are unsupported; refresh after external edits.
- A real remote PTY supports raw keyboard input, Tab, Ctrl-C, resizing, and
  multiple tabs. The native TerminalController owns exclusive input attachments,
  screen recovery, and session ownership; no local shell stands in for remote execution.
- **Human terminals run with the SSH account's permissions**, like local human
  terminals. They do not use model approval/sandbox policy. Model Shell/Terminal
  sandbox enforcement is unchanged.
- Agent-scoped execution environments isolate local and different remote
  sessions. Resume reuses the same authenticated helper session; expired sessions
  and output-buffer overflow fail explicitly instead of silently spawning anew.
  Recovery requires the same DSH service process; quitting DSH does not promise
  restoration of the original terminal.
- Darwin PTYs reach real EOF with the command PID pinned until cleanup. The
  controlling terminal hangs up normally when its leader exits; background
  descendants are not promised continued ownership of that terminal.

Native sidebar services must be present in the DSH composition. Missing sidebar
services omit the shortcuts; missing individual tabs disable their buttons.
Neither prevents plugin activation. The file panel is a previewer,
not a save-capable remote editor. See [ADR-0005](docs/adr/0005-native-remote-panels.md).

## Reliability and interaction improvements in 0.4.0

- Cancelled or expired queued RPCs are never dispatched; already-sent mutations
  retain their honest ambiguous-outcome semantics.
- Shell/PTY readers drain retained output after process exit and report truncation.
- A single-threaded supervisor and guardian pin the owned process group through
  TERM-to-KILL cleanup, even after its shell exits. Control I/O, stdin, output
  drainage and release have deadlines.
- Permanent authentication, host-key, configuration, Python, protocol and unknown
  errors stop automatic retries; transient network failures retain backoff.
  Installing/connecting/reconnecting can be stopped, with independent per-host state.
- The directory picker adds an editable path, Enter navigation, home and refresh.
- Connection/refresh checks `rg` in the same login shell used by search. Missing
  dependencies are reported, never auto-installed; refresh after installation
  rechecks availability without interrupting active tasks.

Cleanup covers the original owned process group and the current PTY foreground
group. It does not promise full-account process-tree cleanup for services that
detach with `setsid`/`setpgid`. Restricted execution additionally benefits from
bubblewrap PID-namespace teardown. Unrelated processes are never killed by name.

## Architecture

The default data plane is now:

```text
DSH Web on the local machine
  └─ dsh-ssh-remote
      └─ system OpenSSH using the original Host alias
          └─ content-addressed Python helper
              └─ private per-user Unix-socket daemon
                  ├─ dirfd-confined filesystem
                  ├─ process/PTY supervisor
                  └─ resumable client session
```

This follows the useful architecture of Codex App Server—a versioned,
multiplexed remote control channel with health, capabilities, bounded output,
stable resource IDs, and reconnect—without pretending that the two protocols
are interchangeable. See the official
[Codex App Server documentation](https://developers.openai.com/codex/app-server)
and [ADR-0004](docs/adr/0004-remote-helper-v1.md).

Implemented:

- **OpenSSH is the source of truth.** `Host`, `Include`, `Match`, agent,
  Keychain, certificates, FIDO/PKCS#11, ProxyJump, ProxyCommand, known_hosts,
  and host-key policy remain owned by the installed `ssh` command.
- **Automatic helper installation.** The packaged helper is SHA-256 addressed,
  uploaded over SSH stdin into a private release directory, and verified before
  publication. It uses no sudo, curl, postinstall script, or remote package
  manager.
- **One Add Workspace flow.** Local directories and concrete SSH aliases share
  the stock workspace picker. Remote browsing, folder creation, and validation
  use the helper by default.
- **Versioned remote files.** Reads use stable stat tokens or strong
  SHA-256+identity tokens. Writes use a same-directory temporary inode, fsync,
  guarded publication, no-replace creation, and operation-id deduplication.
- **Remote shell execution.** Model-facing `ctx.shell` runs before a local
  sandbox wrapper can be incorrectly copied to another OS. Foreground and
  background processes retain bounded output and survive a connector reconnect.
- **Real remote PTYs.** The helper owns the PTY, foreground PGID, signals,
  output cursor, remote account login shell, resize primitive, TERM→KILL
  teardown, and resource release.
- **Remote sandbox enforcement.** `read-only` and `workspace-write` processes
  use bubblewrap on Linux. If a restricted runner is unavailable, process/PTY
  startup fails closed; it never silently runs with full account authority.
- **Recovery and diagnostics.** A private daemon retains workspaces, file-read
  cursors, processes, and PTYs during the reconnect window. The settings panel
  shows installing/connecting/connected/degraded/reconnecting/error, helper
  version, capabilities, errors, Retry, Disconnect, and redacted diagnostics.
- **Safe compatibility path.** Old DSH-host settings may still use the hardened
  ssh2/SFTP implementation. It is not selected silently for a failed helper.

## Honest upstream boundaries

Version 0.5.0 targets DSH `0.2.0-rc.2`. Cancelled connection probes
release daemon connection capacity even when a stream closes with a broken
pipe; pre-handshake connection failures retain their original error code and
message. The earlier `dsh-settings`
register API and the `ShellExecutor` `run`/`start` methods were replaced by the
standard Cordis `Config` and a single `execute()` method respectively; the
plugin has been adapted accordingly. Interrupted SSH uploads fail only the
connection. The public seams still impose these visible limits:

1. A Harness Workspace must be a real local directory. The plugin therefore
   creates a small local anchor and maps only that anchor and its descendants to
   `ssh://alias/remote/path`. No source tree is copied into the anchor.
2. Generic `SubprocessRuntime.spawn()` is synchronous and must return an
   immediate local PID. Direct consumers of that low-level seam keep the
   per-process system-SSH compatibility route; normal model shell and terminal
   surfaces use the helper.
3. The model terminal tool has no resize verb. The human terminal panel already
   resizes automatically; the model cannot explicitly request this operation.
4. DSH history, configuration, plugins, and the agent loop remain local. This
   plugin is a remote execution/filesystem plane, not a second Harness control
   plane.
5. DSH `listDir()` has no paging contract. The standard FS surface fails
   honestly when a directory exceeds 1,000 entries; the workspace picker uses
   a bounded directory-only scan. The native file panel has a separate
   `truncated` contract and displays bounded results with an explicit warning.

Removing the anchor and the last routing hooks requires an upstream first-class
`{ hostId, remotePath, runtime }` workspace contract.

## Requirements

- Local Node.js 22 or newer.
- DSH `0.2.0-rc.2` or a compatible newer `0.2.x` release is required.
- A concrete `Host` alias in `~/.ssh/config` that already works with
  `ssh <alias>` in batch mode.
- Remote POSIX system with Python 3.8 or newer.
- DSH remote `glob` / `grep` searches require `rg` (ripgrep) on the remote PATH.
  The plugin uses that binary and translates workspace roots instead of trying
  to execute the locally packaged binary on another operating system.
- Linux bubblewrap (`bwrap`) for `read-only` or `workspace-write` process/PTY
  confinement. File operations remain dirfd-confined independently.

Put User, Port, proxy, and authentication details in OpenSSH config rather than
encoding them in an `ssh://user@host:port` URI:

```sshconfig
Host devbox
  HostName devbox.example.com
  User you
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

If a concrete alias is later removed, a persisted workspace fails closed before
starting a new SSH connection instead of treating the alias as a DNS hostname.

Before using the Web UI, run `ssh devbox` once and verify any new host-key
fingerprint according to your OpenSSH policy.

Managed helper connections set `BatchMode=yes`. Agent-/Keychain-backed keys,
certificates, and pre-authorized hardware keys work through OpenSSH, but an
interactive password, PIN, passphrase, or MFA prompt cannot be completed in the
Web background connection; prepare the agent/session first.

## Install

```sh
# npm, after the release is published
dsh plugin --profile web add dsh-ssh-remote

# directly from GitHub
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote'
```

Restart `dsh web`, open **Settings → Built-in Plugins → SSH Remote**, and connect or browse a host.
The first connection installs the matching helper automatically.

The official Desktop uses the same Web client and Host plugin interfaces.
Install `github:CrazyShout/dsh-ssh-remote` through the desktop application's
plugin manager and restart the application to use SSH Remote settings and the
remote directory workspace picker. Its bundled engine must be a compatible DSH
`0.2.x` release, starting at `0.2.0-rc.2`; DSH `0.1.x` users should keep plugin
`0.3.1` (Git commit `1432649`). Desktop distributions may use a different
profile, so the CLI's `--profile web` command is not a substitute for the
desktop application's own plugin manager.

## Security model

- JSONL frames are limited to 1 MiB; stdout is protocol-only and stderr is a
  bounded, credential-redacted diagnostic tail.
- The helper runtime directory is owner-only (`0700`) and its Unix socket is
  `0600`. Resume requires both the stable client ID and a constant-time checked
  random token.
- `workspace/open` is the only filesystem request accepting an absolute path.
  Later requests use relative paths beneath an open root fd; `..`, NUL, and
  symlink traversal are rejected.
- File and process mutations carry stable `operationId` values. A disconnected
  mutation is replayed at most once, only after the same server session was
  cryptographically resumed.
- Output, resources, active requests, operation journals, and retention are all
  bounded. Completed journal entries expire only after the resume-safety window.
- The plugin never changes `~/.ssh/config`, private keys, or known_hosts.

POSIX does not offer a universal atomic “rename only if this pathname still
references inode X” operation. The helper serializes its own writes, verifies
identity/content immediately before publish, and publishes atomically, but an
arbitrary non-cooperating external writer can still race in the final
check-to-rename interval. The helper reports
`externalWriterRaceFree: false` instead of overstating the guarantee.

## Development

```sh
npm ci
npm run test:helper
npm test
npm run build
```

CI covers Node 22/24 and Python 3.8/3.9/3.10/3.12. `lib/` is committed because DSH
can install the repository directly without running a package build script.

Design records:

- [ADR-0003: Codex remote parity boundary](docs/adr/0003-codex-remote-parity.md)
- [ADR-0004: Remote helper v1](docs/adr/0004-remote-helper-v1.md)

## License

MIT
