# dsh-ssh-remote

English | [中文](README.zh.md)

SSH remote workspaces for DeepSeek Harness: let the agent connect to remote
hosts over SSH, browse/read/write remote files, run remote commands, open
remote terminals, and show connection status with colored dots in the
sidebar — in the spirit of Codex Remote.

> **Status**: the Web UI, SSH directory picker, persisted remote workspaces,
> transparent SFTP filesystem routing, and OpenSSH command/terminal routing
> are implemented end to end.

## Features

- **SSH connection management**: `ssh2` connection pool (one per host),
  keepalive, exponential-backoff auto-reconnect, connection state machine.
- **Remote file operations**: SFTP implementation of the `FileSystem` twelve
  primitives (read/write/edit/list/stat) with DSH `FS_*` error-code alignment.
- **Remote commands**: `ssh_remote exec` runs a shell command on the host.
- **Codex-style SSH discovery**: concrete Host aliases are collected from
  `~/.ssh/config` (including `Include` files), then effective HostName/User/
  Port/IdentityFile/ProxyJump/ProxyCommand values are resolved with `ssh -G`.
- **OpenSSH-owned configuration**: the Web panel is read-only and never
  duplicates SSH credentials into DSH settings. Edit `~/.ssh/config`, then
  press Refresh.
- **Native Add Workspace flow**: choose an SSH alias, browse its directories,
  and open one as a normal Harness workspace.
- **Transparent workspace routing**: `read`/`write`/`edit` and other filesystem
  calls use SFTP; `bash` and terminal processes use the system OpenSSH client.
  Local workspaces keep using the original local providers.
- **Connection status dots**: green = connected, amber = connecting/
  reconnecting, red = disconnected/error.
- **Multiple hosts**: workspace records persist to
  `$DSH_HOME/ssh-remote-workspaces.json`.

## Install

Requires Node 22+, pnpm, DSH 0.1.0-rc.x.

```sh
# Option A: npm (once published)
dsh plugin --profile web add dsh-ssh-remote

# Option B: GitHub (no publish needed)
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote'
```

Restart `dsh web` afterwards.

## Usage

In the Web UI:

1. Click **Add Workspace**.
2. Choose an SSH alias discovered from `~/.ssh/config`.
3. Browse to a remote directory and click **Open this folder**.
4. Start a session in the resulting workspace. Use **Full access** so the
   local OpenSSH process can reach the remote host.

Harness still stores a local workspace path. The plugin creates a small local
anchor under `$DSH_HOME/ssh-workspace-anchors/` and persists its exact mapping
in `$DSH_HOME/ssh-workspace-anchors.json`. Only that anchor and its descendants
are routed to the corresponding `ssh://alias/path`; unrelated local paths are
never intercepted.

The lower-level `ssh_remote` tool remains available for explicit operations:

The agent drives remote hosts through the `ssh_remote` tool:

```
ssh_remote { action: "add",    uri: "ssh://user@gpu-server:22/home/user/exp" }
ssh_remote { action: "connect", id: "<id>" }
ssh_remote { action: "exec",    id: "<id>", command: "nvidia-smi" }
ssh_remote { action: "read",    id: "<id>", path: "train.py" }
ssh_remote { action: "write",   id: "<id>", path: "notes.txt", content: "..." }
ssh_remote { action: "list" }
```

`path` accepts a remote absolute path (`/home/user/exp/a.py`) or a
workspace-relative path (`a.py`).

## Authentication

- Prefers the local **ssh-agent** (`SSH_AUTH_SOCK`).
- Tries effective `IdentityFile` entries returned by OpenSSH in order.
- `ProxyJump` (including multiple hops) and `ProxyCommand` streams are opened
  by the system OpenSSH client, keeping its Include/wildcard/Match semantics.
- The remote must enable the `sftp` subsystem
  (`Subsystem sftp internal-sftp`).

## SSH configuration

Add a concrete alias to `~/.ssh/config`, verify `ssh devbox`, then refresh the
SSH Remote plugin panel:

```sshconfig
Host devbox
  HostName devbox.example.com
  User you
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

Register a workspace with the alias, not duplicated connection fields:

```text
ssh_remote { action: "add", uri: "ssh://devbox/home/you/project" }
```

Older `ssh-remote.hosts` entries remain a read-only compatibility fallback,
but new configuration should live only in OpenSSH config.

## Routing and security boundary

- File traffic is handled by SFTP; commands and terminals are launched through
  the system `ssh` executable, so SSH aliases, `Include`, `Match`,
  `ProxyJump`, agent forwarding, and host-key policy stay owned by OpenSSH.
- Routing is exact and boundary-aware: an anchor `/a/project` matches itself
  and `/a/project/...`, but never `/a/project-copy`.
- Creating a workspace does not copy or mount the remote tree locally. The
  local anchor contains no remote source files.

## Roadmap

- DSH Credentials integration and configurable remote-path read policies.

## Development

```sh
pnpm install
pnpm run build   # tsc for host + client
pnpm test
```

`lib/` is committed to git so a git install never ships without built code.

## License

MIT
