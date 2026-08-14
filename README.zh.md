# dsh-ssh-remote

[English](README.md) | 中文

DeepSeek Harness 的 **SSH 远程工作区**插件：让 agent 通过 SSH 连接远程主机，浏览/读写远程文件、执行远程命令、打开远程终端，并在侧边栏用颜色圆点显示连接状态——对标 Codex Remote。

> **状态**：Web UI、SSH 目录选择器、远程工作区持久化、SFTP 文件透明路由，以及
> OpenSSH 命令/终端路由已经完整打通。

## 特性

- **SSH 连接管理**：`ssh2` 连接池（每 host 一个）、keepalive、断线指数退避自动重连、连接状态机。
- **远程文件操作**：SFTP 实现 `FileSystem` 12 原语（读/写/编辑/列目录/stat），错误码对齐 DSH 的 `FS_*` 规范。
- **远程命令**：`ssh_remote exec` 在远程主机执行 shell 命令。
- **Codex 风格 SSH 发现**：从 `~/.ssh/config` 及其 `Include` 文件发现具体 Host 别名，再通过
  `ssh -G` 解析最终的 HostName/User/Port/IdentityFile/ProxyJump/ProxyCommand。
- **OpenSSH 是唯一配置源**：Web 页面只读展示，不再把 SSH 凭据重复写入 DSH 设置；修改
  `~/.ssh/config` 后点击刷新即可。
- **原生「添加工作区」流程**：选择 SSH 别名、浏览远程目录，然后像本地目录一样加入 Harness。
- **透明工作区路由**：`read`/`write`/`edit` 等文件操作走 SFTP，`bash` 与终端进程走系统
  OpenSSH；普通本地工作区仍调用原来的本地 provider。
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

在 Web UI 中：

1. 点击「添加工作区」。
2. 选择从 `~/.ssh/config` 发现的 SSH 别名。
3. 浏览远程目录并点击「打开此文件夹」。
4. 在新工作区中开始会话。访问模式请选择 **Full access**，以允许本机 OpenSSH 进程连接远端。

Harness 内部仍要求工作区是本地路径，因此插件会在
`$DSH_HOME/ssh-workspace-anchors/` 创建一个很小的本地锚点，并把精确映射持久化到
`$DSH_HOME/ssh-workspace-anchors.json`。只有该锚点及其子路径会路由到对应的
`ssh://alias/path`，其他本地路径不会被拦截。

底层 `ssh_remote` 工具仍可用于显式操作：

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

## SSH 配置

在 `~/.ssh/config` 添加具体别名，先确认 `ssh devbox` 可以连接，再刷新 SSH Remote 插件页面：

```sshconfig
Host devbox
  HostName devbox.example.com
  User you
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

注册工作区时只引用别名，不再重复填写连接字段：

```text
ssh_remote { action: "add", uri: "ssh://devbox/home/you/project" }
```

旧版 `ssh-remote.hosts` 会保留为只读兼容兜底，但新配置只应写入 OpenSSH config。

## 认证

- 优先本机 **ssh-agent**（`SSH_AUTH_SOCK`），并按 OpenSSH 返回顺序尝试有效 `IdentityFile`。
- `ProxyJump`（含多跳）与 `ProxyCommand` 的字节流交给系统 OpenSSH 建立，因此保留
  Include、通配默认值和 Match 的语义。
- 目标机需开启 `sftp` 子系统（`Subsystem sftp internal-sftp`）；跳板机需开启 `AllowTcpForwarding yes`。

## 路由与安全边界

- 文件流量走 SFTP；命令和终端通过系统 `ssh` 启动，因此 SSH alias、`Include`、`Match`、
  `ProxyJump`、agent 与 host-key 策略继续全部归 OpenSSH 管理。
- 路由按路径边界精确匹配：锚点 `/a/project` 只匹配自身和 `/a/project/...`，不会误匹配
  `/a/project-copy`。
- 添加工作区不会把远端目录复制或挂载到本机；本地锚点不包含远端源码。

## 后续里程碑

- 接入 DSH Credentials，并提供可配置的远端路径读取策略。

## 开发

```sh
pnpm install
pnpm run build   # tsc 编译 host + client
pnpm test
```

`lib/` 已提交进 git（避免 git 安装时缺编译产物）。

## License

MIT
