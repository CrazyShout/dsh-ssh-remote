# ADR-0003：以 Codex Remote 为体验参考，分离轻量路由与远端控制面

- 状态：**已接受，分阶段实施**
- 日期：2026-08-27
- 影响范围：SSH 工作区架构、安全边界、产品声明和后续路线图

## 背景

插件最初用「in the spirit of Codex Remote」描述目标，但 README 又把部分路线图能力写成
了当前能力，例如侧边栏实时状态点、独立远端终端，以及所有 host-key 行为都由 OpenSSH
接管。这会让两种本质不同的架构看起来已经等价：

1. 当前 `dsh-ssh-remote` 是本机 DSH 内的轻量路由插件；
2. 当前 Codex Desktop 的 SSH 体验会在 SSH 主机上运行完整 Codex app-server，并把桌面
   UI 连接到该远端控制面。

本 ADR 固定两者的边界，并规定逐步接近 Codex 体验时不得牺牲安全性或夸大现状。

## 已核实的 Codex 参考架构

以下判断基于 2026-08-27 的 `openai/codex` 源码快照
`694edc23b22b4696400dc47663ecacd437623870`，以及当日本机官方 Codex Desktop 构建的
只读核查。

官方开源源码明确提供：

- app-server 的 stdio、WebSocket 和 Unix socket transport；
- `codex app-server proxy`，在 stdin/stdout 与 Unix socket 之间代理 WebSocket 握手和帧；
- remote exec-server 的进程、PTY、输出流和文件系统 RPC；
- environment 的 cwd、workspace roots、状态查询及 connected/disconnected 事件。

证据：

- [app-server transports 与 proxy](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/app-server/README.md#L20-L44)
- [远端进程生命周期与 PTY](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/README.md#L121-L224)
- [远端文件系统 RPC](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/README.md#L375-L396)
- [`environments.toml` 的 SSH stdio 示例](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/exec-server/src/environment_toml.rs#L733-L756)
- [environment API 与连接事件](https://github.com/openai/codex/blob/694edc23b22b4696400dc47663ecacd437623870/codex-rs/app-server/README.md#L250-L253)

当前 Codex Desktop 构建还会读取本机 `~/.ssh/config`，通过系统 OpenSSH 在远端启动
app-server，并以 SSH stdio 连接 `app-server proxy`。这层 Desktop SSH 编排没有出现在
上述 GitHub 仓库中，因此只能作为「当前官方应用构建已观察到的行为」，不能声称是
公开稳定 API、第三方兼容契约或所有账号均开放的产品保证。

## 当前插件架构

当前插件的执行边界是：

```text
本机 DSH / 会话历史 / 配置 / 插件
  ├─ 标准 fs 调用 ───────────→ ssh2 SFTP
  ├─ 标准 bash/subprocess ───→ system OpenSSH
  ├─ 标准 terminal ──────────→ ssh2 PTY（组合提供 terminal service 时）
  └─ 本地 workspace anchor ──→ ssh://alias/remote/path 映射
```

它具备远端文件夹选择和透明路由，但没有把 DSH 控制面搬到远端：

- Harness 看到的工作区仍是 `$DSH_HOME/ssh-workspace-anchors/` 下的本地锚点；
- 会话历史、插件、MCP、设置和大多数服务仍归本机 DSH；
- 文件和 PTY 通道是 `ssh2`，命令通道是 system OpenSSH；
- 路由通过包装现有 `fs`/`subprocess` 服务完成，并非 DSH 原生 host/runtime abstraction；
- 当前 `ssh2` PTY 不应称为 OpenSSH terminal，也不承诺 Codex 式会话恢复；侧边栏实时
  状态控制尚未实现。

因此它与 Codex 的可比点是发现、目录选择、远端文件/命令和连接体验；不可直接等价的
部分是远端控制面、远端历史、远端配置/插件/MCP、统一进程协议和一等远程工作区身份。

## 本轮安全决定

### 1. known_hosts 失败即关闭

SFTP/PTY 使用 `ssh2`，不会自动继承系统 OpenSSH 的 host-key 检查。本轮显式补上：

- 从 `ssh -G` 读取 HostKeyAlias、StrictHostKeyChecking、UserKnownHostsFile 和
  GlobalKnownHostsFile；
- 使用 `ssh-keygen -F` 处理 OpenSSH pattern 与哈希 host；
- 在 `ask`、`yes` 和 `accept-new` 策略下，普通匹配 key 允许，变更 key、未知 key 与
  `@revoked` key 拒绝；
- 未知 key 提示用户先执行 `ssh <alias>` 并人工核对指纹；
- Web 流程不会替用户写 `known_hosts`，因此 `accept-new` 仍失败即关闭；
- 只有用户显式配置 `StrictHostKeyChecking no` 才允许未知或变更 key；`@revoked` key
  仍会被拒绝。

此实现暂不验证仅由 `@cert-authority` 信任的主机证书。不得把该限制写成「所有 OpenSSH
host-key 语义均已完整支持」。

### 2. 规范路径包含关系

远端 containment 不能只比较字符串前缀。本轮规定：

- 在发送路径前折叠 `.`、`..` 与重复分隔符；
- 对已存在目标使用远端 `realpath`；
- 对缺失写入目标向上查找最近的已存在祖先，规范化祖先后再追加缺失分量；
- 对悬空符号链接失败即关闭；
- `contains(parent, child)` 比较同一 host、port、user 下的规范身份和路径边界。

这可以阻止 lexical traversal 与检查时已经存在的 symlink escape 被误判成工作区内部，
但它不是远端 chroot。SFTP 没有目录句柄相对 `openat`，并发远端进程仍可在检查后替换
中间目录；bash/PTY 也不会被当前插件限制在工作区。真正的执行边界是远端 Unix 账号权限，
DSH 的本机 permission profile 只控制本机能力批准，不能冒充远端 sandbox。

### 3. 删除过度暴露的私有入口

模型不再需要 `ssh_remote` 原始工具。远程工作区应尽可能像普通工作区：模型使用标准
DSH fs、bash/子进程和由当前组合提供的标准终端界面。README 不再宣称侧边栏已有状态点，
也不会把 `ssh2` PTY 错写成 system OpenSSH terminal 或 Codex 等价终端。

## 决定

1. 保留当前轻量 anchor/SFTP/OpenSSH 模式，作为无需远端守护进程的低门槛实现。
2. 所有文档必须明确它不是远端 DSH 控制面，也不是 Codex Remote 的等价实现。
3. 安全加固优先于 UI 扩展；未知 host key、路径身份不明确和连接竞态必须失败即关闭。
4. 模型与用户只使用标准 DSH 工作区表面，不公开底层连接管理工具作为主要工作流。
5. 真正的 Codex-like 架构通过远端 helper 和 DSH 上游抽象分阶段推进，不继续无限扩大
   当前 monkey-patch 层。

## 分阶段路线图

### Phase 0：当前轻量架构硬化

- 完成 known_hosts fail-closed 校验和清晰的首次信任指引；
- 完成 canonical path identity、symlink escape 防护与缺失目标处理；
- 覆盖写通过同目录临时文件、权限继承与 OpenSSH `posix-rename` 原子发布；独占创建通过
  OpenSSH `hardlink` 发布完整 inode，不支持所需扩展时失败即关闭；
- 为连接建立单实例状态机、过期 attempt fencing、有界等待和安全重连；
- 使用 DSH home-path 与 atomic-write 原语，以 `0600` 原子持久化 anchor 映射；
- 验证 URI、IPv6 和 ProxyJump 参数，拒绝选项注入形状；
- 移除 `ssh_remote` 模型工具，硬化 `ssh2` PTY，并删除「OpenSSH terminal」等不准确声明；
- `ssh2` 无法报告已验证的前台 PGID，显式 `terminal_signal` 必须失败而不是返回虚构编号；
- 文档只陈述实际可验证能力。

### Phase 1：状态与诊断

- 把 host 连接状态正式暴露给 client half；
- 提供 connected/connecting/reconnecting/error/disconnected、最后错误和最近成功时间；
- 提供 Connect、Disconnect、Retry、Refresh 与只读诊断；
- 区分 host-key、认证、SFTP subsystem、ProxyJump、超时和网络错误；
- 不在状态或日志中泄漏私钥、ProxyCommand 敏感参数或完整用户环境。

### Phase 2：system OpenSSH 远端 helper

- 提供可选、带版本握手的 `dsh-remote-helper`；
- 用一条长期存在的 system OpenSSH stdio 通道承载 RPC；
- 统一文件、进程、PTY、resize、signal、输出游标和 health check；
- 在远端单临界区内提供 read-with-version、目录句柄相对写入、guarded publication 与
  process sandbox，关闭 SFTP check-to-use 和秒级 version token 缺口；
- 由 system OpenSSH 统一拥有 agent、known_hosts、Match、ProxyJump、证书和硬件密钥语义；
- 明确远端 helper 安装、升级、兼容性和卸载流程；
- 当前 SFTP 路由保留为兼容 fallback，而不是突然强制远端安装。

该阶段只把「执行平面」统一到远端 helper；本机 DSH 历史与插件控制面仍不会自动变成
远端状态。

### Phase 3：推动 DSH 上游一等远程工作区

目标是让 DSH 核心理解：

```text
workspace = { hostId, remotePath, runtime }
```

而不是强制伪装成本地 path。所需上游能力包括：

- host-aware fs/subprocess/terminal service selection；
- environment-native workspace roots、权限和 sandbox 语义；
- host 级配置、插件、MCP、Git、技能与生命周期；
- 可恢复的远端线程/历史目录与 UI catalog；
- 标准连接状态、能力发现和 remote helper version negotiation。

达到该阶段后，插件应删除本地 anchor 和实例方法 monkey-patch，成为 DSH 原生 remote
runtime 的 SSH transport/provider。

## 明确不在当前范围内

- 复制 Codex Desktop 的闭源协议或把观察到的行为冒充公开 API；
- Web 页面静默接受未知 host key；
- 当前版本提供通用 `-L`、`-R`、`-D` 端口转发管理；
- 当前版本保证所有 OpenSSH 认证方式均可被 `ssh2` SFTP/PTY 复现；
- 在没有 DSH 上游支持时声称远端历史、插件和完整 Harness 生命周期已经迁移。

## 后果

正面后果：

- 用户得到更准确的能力预期和可操作的首次连接步骤；
- host-key 与路径逃逸从隐式风险变成显式、可测试的失败边界；
- 后续状态 UI 和远端 helper 有清晰接口目标；
- 不会为了外观像 Codex 而把不兼容的临时实现固化成公共契约。

代价：

- 首次连接必须先由用户在终端核对 host key；
- system OpenSSH 命令与 `ssh2` SFTP/PTY 在 Phase 2 前仍可能存在认证能力差异；
- anchor 架构仍有身份和生命周期局限；
- SFTP 没有 compare-and-swap，当前只能缩小并检测大部分外部写竞态，最后的
  check-to-rename 窗口需由 Phase 2 helper 在远端单临界区内关闭；
- SFTP 路径检查也没有 `openat` 级绑定；并发替换中间目录以及远程 bash/PTY 的工作区
  隔离都不能由当前轻量路由证明；
- 真正完整的远端体验需要 DSH 上游协作，无法只在本插件内完成。
