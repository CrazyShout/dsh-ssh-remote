# dsh-ssh-remote

English | [中文](README.zh.md)

SSH-backed remote workspaces for DeepSeek Harness. Add a folder from a host in
your local OpenSSH configuration, then work in it through the normal DSH
filesystem, bash/subprocess, and terminal surfaces.

> **Architecture status:** this release is a lightweight workspace-routing
> plugin. DSH, session history, configuration, and plugin execution remain on
> the local Harness host. It does **not** run a remote DSH control plane or claim
> full Codex Remote parity. See [ADR-0003](docs/adr/0003-codex-remote-parity.md).

## Implemented today

- **OpenSSH discovery:** concrete `Host` aliases are collected from
  `~/.ssh/config` and its `Include` files. Effective HostName, User, Port,
  IdentityFile, ProxyJump, ProxyCommand, HostKeyAlias, StrictHostKeyChecking,
  and known-hosts paths are resolved with `ssh -G`.
- **One Add Workspace flow:** choose the local machine or an SSH alias, browse
  directories in-app, and add the selected folder as a Harness workspace.
- **Standard DSH workflow:** no plugin-specific model tool is required. In a
  remote workspace, normal filesystem calls are routed through SFTP and normal
  bash/subprocess calls are launched through the system `ssh` executable.
  When the active DSH composition includes its terminal service, normal DSH
  terminal sessions route to the plugin's `ssh2` PTY channel. That channel is
  not a system-OpenSSH terminal and does not claim Codex-style session recovery.
- **Fail-closed host verification:** the SFTP channel verifies server keys
  against the effective OpenSSH `known_hosts` files. With the normal `ask`,
  `yes`, or `accept-new` policies, unknown, changed, and revoked keys are
  rejected before file access begins.
- **Canonical path checks:** remote paths are normalized and resolved with
  SFTP `realpath`; symlinks already present at check time cannot masquerade as
  workspace children, and dangling symlinks fail closed.
- **Atomic remote publication:** replacements upload to a same-directory
  temporary file, preserve the existing mode, recheck the guarded content, and
  publish with OpenSSH `posix-rename`. `createIfAbsent` publishes a completed
  temporary inode with OpenSSH `hardlink`; servers missing either atomic
  extension fail closed instead of exposing partial files.
- **Connection management:** host-scoped `ssh2`/SFTP connections use keepalive,
  bounded connection waits, exponential-backoff reconnects, and stale-attempt
  fencing.
- **Persisted mappings:** remote workspace records and local anchor mappings
  use atomic replacement with private `0600` files and survive a DSH restart.

Not currently implemented: live connection-status controls in the sidebar,
Codex-equivalent terminal/session recovery, remote DSH history/config/plugin
execution, or general-purpose SSH port-forward management.

The `ssh2` PTY also cannot report a verified remote foreground PGID, so the
explicit DSH `terminal_signal` operation fails honestly instead of returning a
fabricated process group. Send cancellation still requests channel-level
`SIGINT`; verified PGID signalling and resize require the Phase 2 helper plus a
future DSH resize seam.

SFTP v3 also has no compare-and-swap primitive. The plugin detects metadata and
content changes immediately before an atomic rename, but an unrelated remote
writer can still race in the final check-to-rename interval. Closing that last
external-writer window is a Phase 2 remote-helper capability, not something the
current lightweight transport claims to solve.

SFTP v3 exposes only second-resolution modification times and no inode/ctime
identity. A same-size external rewrite within the same second can therefore
reuse an older metadata version token if it happened before the guarded write
started. DSH's `stat` seam is metadata-only, so a strong read-with-version token
also belongs in the helper/upstream phase rather than being faked with hidden
content reads.

## Install

Requires Node 22+ and npm. Tested with DSH 0.1.0-rc.6 through
0.1.1-rc.2; 0.1.1-rc.2 is the recommended baseline.

```sh
# Option A: npm (once published)
dsh plugin --profile web add dsh-ssh-remote

# Option B: GitHub (no publish needed)
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote'
```

Restart `dsh web` afterwards.

## Usage

1. Add a concrete alias to `~/.ssh/config`.
2. Run `ssh devbox` once in a terminal. Verify the displayed fingerprint before
   accepting a new key; this establishes trust in OpenSSH `known_hosts`.
3. In DSH, click **Add Workspace**, choose `devbox`, browse to the remote
   directory, and click **Open this folder**.
4. Start a session in that workspace. Use **Full access** when DSH must launch
   the local SSH client or reach the remote host.
5. Ask the agent to read/edit files, run tests, or use the terminal normally.
   There is no plugin-specific command language to learn.

Harness currently requires a local workspace path. The plugin creates a small
anchor under `$DSH_HOME/ssh-workspace-anchors/` and persists its exact mapping
in `$DSH_HOME/ssh-workspace-anchors.json`. Only that anchor and its descendants
route to the corresponding `ssh://alias/path`; unrelated local paths keep using
the original local providers.

The anchor contains no remote source files. Adding a remote workspace does not
copy or mount the remote directory locally.

## SSH configuration

Use a concrete alias, verify it with OpenSSH, then refresh the SSH Connections
panel:

```sshconfig
Host devbox
  HostName devbox.example.com
  User you
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

`~/.ssh/config` remains the connection source of truth. The Web panel is
read-only and does not duplicate SSH keys or passwords into DSH settings.
Legacy `ssh-remote.hosts` entries remain a read-only compatibility fallback.

### Authentication limits

- The SFTP and PTY channels prefer `SSH_AUTH_SOCK` and load at most the first
  readable effective `IdentityFile`. Because those channels are implemented
  with `ssh2`, they do not inherit every authentication mechanism supported by
  the system OpenSSH client. Agent-backed keys are the most compatible choice.
- An encrypted private key that is not available through the agent may let
  `ssh devbox` succeed while SFTP/PTY authentication still fails. Keychain,
  PKCS#11/FIDO, certificates, and interactive password flows are not claimed as
  fully supported by the SFTP channel.
- ProxyJump byte streams are opened by system OpenSSH. An effective
  ProxyCommand is launched through the local shell with `%h`, `%p`, `%r`, and
  `%%` expansion; uncommon OpenSSH tokens are not claimed. Final SFTP
  authentication remains subject to the limitation above.
- The remote host must enable the `sftp` subsystem. A jump host must allow the
  forwarding required by the configured ProxyJump/ProxyCommand.

## Host-key verification

The Web request deliberately has no invisible trust-on-first-use prompt. The
plugin reads the effective `HostKeyAlias`, `StrictHostKeyChecking`,
`UserKnownHostsFile`, and `GlobalKnownHostsFile` values, and delegates pattern
and hashed-host lookup to `ssh-keygen -F`.

- A matching ordinary key is accepted.
- A mismatched or `@revoked` key is rejected.
- An unknown key fails closed with an instruction to run `ssh <alias>` and
  verify the fingerprint first.
- `StrictHostKeyChecking accept-new` also fails closed in the Web flow: the
  plugin never writes `known_hosts` itself.
- Only an explicit `StrictHostKeyChecking no` permits an otherwise unknown or
  changed key; a key marked `@revoked` is still rejected.
- Hosts trusted only through an `@cert-authority` entry are not yet supported
  by the `ssh2` SFTP/PTY channel.

## Routing and security boundary

- Remote path components are normalized before they reach SFTP.
- Existing targets and symlinks are canonicalized with remote `realpath`.
- For a missing write target, the nearest existing ancestor is canonicalized
  and only normalized missing components are appended.
- A dangling symlink is rejected rather than treated as a harmless missing
  file.
- Containment compares canonical path identities on the same host, port, and
  user. A workspace `/srv/project` contains itself and
  `/srv/project/src/a.ts`, but not `/srv/project-copy`, `../etc/passwd`, or a
  symlink resolving outside the workspace.
- Standard filesystem mutations re-check the canonical target immediately
  before writing: `read-only` denies them, while `workspace-write` admits only
  targets that resolve below the mapped remote root at check time. The former
  raw `ssh_remote` write/exec bypass is no longer exposed to the model.

These are useful guardrails, not a remote sandbox or chroot. SFTP has no
directory-handle-relative `openat`, so a concurrent remote actor can replace an
intermediate directory after `realpath` and before the path-based write.
Moreover, remote bash/subprocess and PTY sessions are not confined to the
workspace by this plugin: after SSH is allowed, commands have the full authority
of the remote Unix account. A DSH **Full access** approval controls whether the
local SSH client may launch; it does not create a remote filesystem sandbox.
Strong path confinement and process sandboxing require the Phase 2 helper.

## Local workspaces on Windows and WSL

The same **Add Workspace** dialog also adds plain local directories. Its local
branch adapts to the directory-picker capability served by the current DSH
composition:

- **browse** (typical on headless/WSL hosts): an in-app browser lists and
  creates directories through the Host. Quick links include the Host home and
  Windows drives mounted below `/mnt`.
- **native**: use the operating-system folder chooser.

Only the explicit `directory-picker-unavailable` result switches to the native
chooser. Permission, timeout, transport, and internal browse failures stay in
the dialog as retryable errors. Workspaces under `/mnt/...` are ordinary local
Harness workspaces from WSL's point of view; they are not SSH workspaces.

## Codex comparison and roadmap

Current Codex source exposes an experimental remote execution/filesystem environment and a
Unix-socket `app-server proxy`. The current Codex Desktop build goes further by
starting a complete app-server on the SSH host. These are useful design
references, not a documented stable API for third-party clients:

- [Codex app-server transports and proxy](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/app-server/README.md#L20-L44)
- [Codex remote process and PTY RPCs](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/README.md#L180-L224)
- [Codex remote filesystem RPCs](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/README.md#L375-L396)
- [Codex environment status APIs](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/app-server/README.md#L250-L253)

Our phased direction is:

1. harden the current anchor/SFTP/OpenSSH router;
2. add honest connection status and diagnostics;
3. introduce an optional system-OpenSSH remote helper with one versioned RPC
   channel for files, processes, and PTYs;
4. work with DSH upstream on first-class `{hostId, remotePath}` workspaces and a
   host-aware runtime, so anchors and service monkey-patching can eventually be
   removed.

The full rationale is recorded in
[ADR-0003](docs/adr/0003-codex-remote-parity.md).

## Development

```sh
npm ci
npm run build
npm test
```

`lib/` is committed so a Git installation does not ship without build output.

## License

MIT
