# dsh-ssh-remote

English | [中文](README.zh.md)

SSH remote workspaces for DeepSeek Harness: let the agent connect to remote
hosts over SSH, browse/read/write remote files, run remote commands, open
remote terminals, and show connection status with colored dots in the
sidebar — in the spirit of Codex Remote.

> **Status**: v0.1 ships the complete **host side** (`ssh_remote` tool +
> `ctx.sshRemote` service). The sidebar UI and the transparent filesystem
> routing (`read`/`write`/`edit` hitting remote automatically) are documented
> follow-up milestones.

## Features

- **SSH connection management**: `ssh2` connection pool (one per host),
  keepalive, exponential-backoff auto-reconnect, connection state machine.
- **Remote file operations**: SFTP implementation of the `FileSystem` twelve
  primitives (read/write/edit/list/stat) with DSH `FS_*` error-code alignment.
- **Remote commands**: `ssh_remote exec` runs a shell command on the host.
- **Reuses `~/.ssh/config`**: concrete Host aliases (HostName/User/Port/
  IdentityFile) are resolved; `Host *` wildcards are ignored.
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
- `IdentityFile` entries in `~/.ssh/config` are read as private keys.
- The remote must enable the `sftp` subsystem
  (`Subsystem sftp internal-sftp`).

## Roadmap

- **P1 transparent fs routing**: in a remote workspace's sessions,
  `read`/`write`/`edit`/`bash` hit remote automatically (via an `isolate`
  scope mounting `RemoteFileSystem` / `RemoteSubprocessRuntime`).
- **P1 remote terminal**: a `RemoteTerminalBackend` registered on
  `ctx.terminals`.
- **P2**: ProxyJump multi-hop, DSH Credentials, `denyReadPaths` policy,
  directory picker.

## Development

```sh
pnpm install
pnpm run build   # tsc for host + client
pnpm test
```

`lib/` is committed to git so a git install never ships without built code.

## License

MIT
