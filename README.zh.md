# dsh-ssh-remote

[English](README.md) | 中文

DeepSeek Harness 的 SSH 远程工作区插件：从本机 OpenSSH 配置选择一台主机和远端文件夹，
加入工作区后继续使用 DSH 标准的文件系统、bash/子进程和终端界面。

> **架构状态：**当前版本是轻量级工作区路由插件。DSH 控制面、会话历史、配置和插件执行
> 仍在本机 Harness Host；它不会在远端启动完整 DSH，也不声称已经达到 Codex Remote
> 的完整架构。详见 [ADR-0003](docs/adr/0003-codex-remote-parity.md)。

## 当前已实现

- **OpenSSH 主机发现**：从 `~/.ssh/config` 及其 `Include` 文件发现具体 `Host` 别名，
  再用 `ssh -G` 解析最终 HostName、User、Port、IdentityFile、ProxyJump、
  ProxyCommand、HostKeyAlias、StrictHostKeyChecking 和 known-hosts 路径。
- **本机 + SSH 合一的「添加工作区」**：选择本机或 SSH 别名，在应用内浏览目录，然后
  像普通 Harness 工作区一样加入。
- **标准 DSH 使用方式**：不再要求模型调用插件私有工具。在远程工作区内，标准文件
  调用透明路由到 SFTP，标准 bash/子进程调用通过系统 `ssh` 启动。若当前 DSH 组合
  提供 terminal service，标准 DSH 终端会路由到插件的 `ssh2` PTY 通道；它不是系统
  OpenSSH terminal，也不声称具备 Codex 式会话恢复。
- **host key 失败即关闭（fail closed）**：SFTP 通道按有效 OpenSSH `known_hosts`
  校验服务端密钥；在常规 `ask`、`yes` 或 `accept-new` 策略下，未知、变更或已吊销
  密钥在文件访问前即被拒绝。
- **规范路径检查**：远端路径先做规范化，再用 SFTP `realpath` 解析；检查时已经存在的
  符号链接不能伪装成工作区子项，悬空符号链接直接拒绝。
- **远端文件原子发布**：覆盖写先上传同目录临时文件、保留原权限并复核受保护内容，再用
  OpenSSH `posix-rename` 发布；`createIfAbsent` 用 OpenSSH `hardlink` 发布已经写完整的
  临时 inode。远端不支持所需原子扩展时失败即关闭，不暴露空文件或半文件。
- **连接管理**：以 host 为粒度复用 `ssh2`/SFTP 连接，提供 keepalive、有界连接等待、
  指数退避重连和过期连接尝试隔离。
- **映射持久化**：远程工作区记录和本地锚点映射使用原子替换及私有 `0600` 文件，
  会跨 DSH 重启保留。

当前尚未实现：侧边栏实时连接状态与控制、与 Codex 等价的终端/会话恢复、远端 DSH
历史/配置/插件执行，以及通用 SSH 端口转发管理。

`ssh2` PTY 也无法返回经过验证的远端前台 PGID，因此显式 DSH `terminal_signal` 会诚实
报错，而不是伪造进程组编号。send 取消仍会请求 channel 级 `SIGINT`；可验证 PGID signal
和 resize 需要 Phase 2 helper 以及未来的 DSH resize seam。

SFTP v3 本身也没有 compare-and-swap 原语。插件会在原子 rename 前复核 metadata 与内容，
但无关的远端写者仍可能卡进“最后检查到 rename”之间的极短窗口。彻底关闭这个外部写者
窗口属于 Phase 2 远端 helper 的能力，当前轻量 transport 不声称已经解决。

SFTP v3 还只提供秒级 mtime，没有 inode/ctime 身份；若外部程序在 guarded write 开始前、
同一秒内完成等长改写，旧 metadata version token 仍可能被复用。DSH 的 `stat` seam 明确
只能读取 metadata，因此强 read-with-version token 也应由 helper/上游能力解决，不能靠
隐藏读取内容来伪造。

## 安装

要求 Node 22+、npm。已验证 DSH 0.1.0-rc.6 至 0.1.1-rc.2；
推荐以 0.1.1-rc.2 作为当前基线。

```sh
# 方式一：npm（若已发布）
dsh plugin --profile web add dsh-ssh-remote

# 方式二：GitHub（无需发布）
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote'
```

安装后重启 `dsh web`。

## 使用

1. 在 `~/.ssh/config` 中加入具体别名。
2. 先在终端执行一次 `ssh devbox`。出现新密钥时，核对指纹后再确认；这一步由 OpenSSH
   把信任写入 `known_hosts`。
3. 在 DSH 点击「添加工作区」，选择 `devbox`，浏览远端目录并点击「打开此文件夹」。
4. 在该工作区开始会话。若 DSH 需要启动本机 SSH 客户端或访问网络，请选择
   **Full access**。
5. 直接让 agent 读写文件、运行测试或使用标准终端即可；不需要学习插件私有命令格式。

Harness 当前仍要求工作区是本地路径，因此插件会在
`$DSH_HOME/ssh-workspace-anchors/` 创建一个很小的本地锚点，并把精确映射持久化到
`$DSH_HOME/ssh-workspace-anchors.json`。只有该锚点及其子路径会路由到对应的
`ssh://alias/path`；其他本地路径仍使用原有本地 provider。

锚点不包含远端源码。添加远程工作区不会把远端目录复制或挂载到本机。

## SSH 配置

使用具体别名，先用 OpenSSH 验证连接，再刷新 SSH Connections 页面：

```sshconfig
Host devbox
  HostName devbox.example.com
  User you
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

`~/.ssh/config` 始终是连接配置的事实来源。Web 页面只读展示，不会把 SSH 密钥或密码
重复写入 DSH 设置。旧版 `ssh-remote.hosts` 仅保留为只读兼容兜底。

### 认证限制

- SFTP 与 PTY 通道优先使用 `SSH_AUTH_SOCK`，并且至多加载第一个可读取的有效
  `IdentityFile`。由于这些通道仍基于 `ssh2`，它们不会自动继承系统 OpenSSH 支持的全部认证方式；
  由 agent 托管密钥的兼容性最好。
- 若加密私钥未加载到 agent，可能出现 `ssh devbox` 成功、SFTP/PTY 认证仍失败的情况。
  当前不声称文件通道完整支持 Keychain、PKCS#11/FIDO、证书和交互式密码流程。
- ProxyJump 字节流由系统 OpenSSH 建立。有效 ProxyCommand 由本机 shell 启动，只展开
  `%h`、`%p`、`%r` 与 `%%`；不声称支持其他少见 OpenSSH token。最终 SFTP 认证仍受
  上述限制。
- 目标机必须启用 `sftp` 子系统；跳板机必须允许当前 ProxyJump/ProxyCommand 所需的
  转发。

## Host key 校验

Web 请求不会静默执行首次信任。插件读取有效 HostKeyAlias、StrictHostKeyChecking、
UserKnownHostsFile 和 GlobalKnownHostsFile，并把普通模式与哈希 host 的查找交给
`ssh-keygen -F`。

- 匹配的普通密钥允许连接。
- 密钥不匹配或命中 `@revoked` 时拒绝连接。
- 未知密钥失败即关闭，并提示先运行 `ssh <alias>`、人工核对指纹。
- Web 流程对 `StrictHostKeyChecking accept-new` 同样失败即关闭；插件不会自行写入
  `known_hosts`。
- 只有显式配置 `StrictHostKeyChecking no` 才允许原本未知或变更的密钥；命中
  `@revoked` 的密钥仍会被拒绝。
- 目前 `ssh2` SFTP/PTY 通道尚不支持仅由 `@cert-authority` 条目信任的主机证书。

## 路由与安全边界

- 路径分量在发送给 SFTP 前规范化。
- 已存在目标和符号链接使用远端 `realpath` 取得规范身份。
- 写入尚不存在的目标时，先规范化最近的已存在祖先，再追加已规范化的缺失分量。
- 悬空符号链接会被拒绝，不会被当作普通的「文件不存在」。
- 包含关系比较同一 host、port、user 下的规范路径。工作区 `/srv/project` 包含自身和
  `/srv/project/src/a.ts`，但不包含 `/srv/project-copy`、`../etc/passwd`，也不包含
  最终解析到工作区外的符号链接。
- 标准文件写入会在落盘前重新检查规范目标：`read-only` 直接拒绝，`workspace-write` 只
  接受检查时解析到远程工作区根以内的目标；原先可绕过标准权限路径的 `ssh_remote`
  写入/执行工具不再暴露给模型。

这些是有用的 guardrail，不是远端 sandbox 或 chroot。SFTP 没有相对目录句柄的 `openat`，
并发远端进程仍可在 `realpath` 后、按路径写入前替换中间目录。远程 bash/子进程与 PTY 也
不会被本插件限制在工作区内：SSH 一旦获准，命令就拥有远端 Unix 账号的完整权限。DSH 的
**Full access** 许可决定本机 SSH 客户端能否启动，并不会创建远端文件系统 sandbox。强路径
隔离与进程 sandbox 需要 Phase 2 helper。

## 本机工作区：Windows 与 WSL

同一个「添加工作区」对话框也能添加普通本地目录，本机分支会适配当前 DSH 组合提供的
目录选择器能力：

- **browse**（常见于 headless/WSL Host）：应用内目录浏览器通过 Host 列目录和创建
  文件夹，快捷入口包括 Host 家目录及 `/mnt` 下的 Windows 磁盘。
- **native**：使用操作系统文件夹选择框。

只有明确的 `directory-picker-unavailable` 才切换 native 选择器。权限、超时、传输或
内部浏览失败会留在对话框内供重试。在 `/mnt/...` 下加入的是 WSL 视角的普通本地
Harness 工作区，并不是 SSH 工作区。

## 与 Codex 的区别和路线图

当前 Codex 源码公开了实验性的远程执行/文件系统 environment，以及基于 Unix socket 的
`app-server proxy`；当前 Codex Desktop 构建还会在 SSH 主机上启动完整 app-server。
这些实现只作为设计参考，不应被描述为面向第三方客户端的公开稳定 API：

- [Codex app-server transport 与 proxy](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/app-server/README.md#L20-L44)
- [Codex 远端进程与 PTY RPC](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/README.md#L180-L224)
- [Codex 远端文件系统 RPC](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/README.md#L375-L396)
- [Codex environment 状态 API](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/app-server/README.md#L250-L253)

我们的分阶段方向是：

1. 先加固现有 anchor/SFTP/OpenSSH 路由；
2. 增加诚实、可操作的连接状态和诊断；
3. 引入可选的 system OpenSSH 远端 helper，用一条带版本协议的 RPC 通道统一文件、
   进程和 PTY；
4. 推动 DSH 上游支持一等 `{hostId, remotePath}` 工作区和 host-aware runtime，最终移除
   本地 anchor 与服务 monkey-patch。

完整理由记录在 [ADR-0003](docs/adr/0003-codex-remote-parity.md)。

## 开发

```sh
npm ci
npm run build
npm test
```

`lib/` 已提交进 git，避免 Git 安装时缺少构建产物。

## License

MIT
