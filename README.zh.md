# dsh-ssh-remote

[English](README.md) | 中文

DeepSeek Harness 的 **SSH 远程工作区**插件：让 agent 通过 SSH 连接远程主机，浏览/读写远程文件、执行远程命令、打开远程终端，并在侧边栏用颜色圆点显示连接状态——对标 Codex Remote。

> **状态**：v0.1 提供完整的 **host 侧**（`ssh_remote` 工具 + `ctx.sshRemote` 服务）。侧边栏 UI 与「透明文件系统路由」（`read`/`write`/`edit` 自动命中远程）是已标注的后续里程碑。

## 特性

- **SSH 连接管理**：`ssh2` 连接池（每 host 一个）、keepalive、断线指数退避自动重连、连接状态机。
- **远程文件操作**：SFTP 实现 `FileSystem` 12 原语（读/写/编辑/列目录/stat），错误码对齐 DSH 的 `FS_*` 规范。
- **远程命令**：`ssh_remote exec` 在远程主机执行 shell 命令。
- **复用 `~/.ssh/config`**：具体 Host 别名（HostName/User/Port/IdentityFile）自动解析；忽略 `Host *` 通配。
- **连接状态圆点**：绿=已连接、黄=连接中/重连中、红=断线/错误。
- **多主机并列**：workspace 记录持久化到 `$DSH_HOME/ssh-remote-workspaces.json`。

## 安装

要求：Node 22+、pnpm、DSH 0.1.0-rc.x。

```sh
# 方式一：npm（若已发布）
dsh plugin --profile web add dsh-ssh-remote

# 方式二：GitHub（无需发布）
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote'
```

重启 `dsh web` 后生效。

## 使用

agent 通过 `ssh_remote` 工具操作远程主机：

```
ssh_remote { action: "add",    uri: "ssh://user@gpu-server:22/home/user/exp" }
ssh_remote { action: "connect", id: "<id>" }
ssh_remote { action: "exec",    id: "<id>", command: "nvidia-smi" }
ssh_remote { action: "read",    id: "<id>", path: "train.py" }
ssh_remote { action: "write",   id: "<id>", path: "notes.txt", content: "..." }
ssh_remote { action: "list" }
```

`path` 支持远程绝对路径（`/home/user/exp/a.py`）或相对 workspace 根（`a.py`）。

## 配置（设置 + ProxyJump）

在 DSH 设置里配置命名主机（含跳板机），存于 `ssh-remote` 命名空间：

```yaml
# settings.yaml
ssh-remote:
  hosts:
    - name: hk-wsl
      host: 10.x.x.x
      port: 22
      user: ubuntu
      identityFile: ~/.ssh/hk-wsl_key
      proxyJump: "user@jump-host:22"   # 可选：跳板机
```

`ssh_remote add` 的 uri 里 host 名若匹配设置里的 `name`（或 `host`），就会采用该配置（含 ProxyJump）。ProxyJump 通过跳板机建立 `direct-tcpip` 通道直达目标，支持免密跳板。

## 认证

- 优先本机 **ssh-agent**（`SSH_AUTH_SOCK`）；`identityFile` / `~/.ssh/config` 的 `IdentityFile` 会读取对应私钥。
- 目标机需开启 `sftp` 子系统（`Subsystem sftp internal-sftp`）；跳板机需开启 `AllowTcpForwarding yes`。

## 后续里程碑

- **P1 透明文件系统路由**：远程 workspace 的会话里 `read`/`write`/`edit`/`bash` 自动命中远程（借助 `isolate` scope 挂 `RemoteFileSystem` / `RemoteSubprocessRuntime`）。
- **P1 远程终端**：`RemoteTerminalBackend` 注册进 `ctx.terminals`。
- **P2**：ProxyJump 多跳、凭据接入 DSH Credentials、`denyReadPaths` 安全策略、目录选择器。

## 开发

```sh
pnpm install
pnpm run build   # tsc 编译 host + client
pnpm test
```

`lib/` 已提交进 git（避免 git 安装时缺编译产物）。

## License

MIT
