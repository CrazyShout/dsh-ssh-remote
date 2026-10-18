# Changelog / 更新记录

## 0.11.0

- Breaking: remove SSH2/SFTP and legacy terminal backend exports; add explicit, backed-up OpenSSH configuration migration and guarded rollback.
- Consolidate quick open, transfers, forwarding and terminal observations in one responsive workbench; preserve native files, terminals and draft protection.
- Real cross-file concurrency with per-file ordering, stop barriers and fresh durable receipts; manifest pages read once per scan.
- Direct capability-negotiated range reads, prepared Top-K ranking, visibility-driven polling and progress throttling.
- Canonical DSH_HOME anchor recovery, shared wire metadata and split client responsibilities. Helper 0.11.0; transfer format v1 unchanged.
- Explicit DSH 0.2.1-rc.2 compatibility, dual-SDK checks and both official terminal input protocols. Existing 0.2.0-rc.2 support remains.
- Restore old auxiliary tabs through receiver-bound public navigation, carrying the target section; hidden tabs do not steal focus. Stable service faces avoid redundant queries on parent renders.
- Acceptance and release remain gated by the versioned acceptance record; no TB throughput claim.

## 0.10.2 — 2026-10-17

- 中文：提供预构建 GitHub Release 安装包；重写安装与首次连接指南，分离排错和技术参考；新增真实安装包、升级、回退和卸载验收。DSH 仍为 0.2.0-rc.2，helper 仍为 0.10.0，内容哈希不变。
- English: Prebuilt GitHub Release packages, installation-first bilingual documentation, and real-package install/upgrade/rollback/removal checks. DSH remains 0.2.0-rc.2; helper 0.10.0 and its content hash are unchanged.

Older entries describe each release at the time. For current instructions, use the [README](README.md).
以下历史条目记录各版本当时的能力，当前使用方式以 [README](README.md) 为准。

## 中文历史记录

### 0.10.1：紧凑的远程工具入口

顶栏只保留 **SSH · 主机名**，点击打开 **远程工具**；空会话的同一入口位于输入框上方。
悬停可查看完整远端路径。右侧栏首页也提供一张 **远程工具** 卡片，仅在已确认的 SSH
工作区中显示；页内依次提供 **快速打开**、**文件传输**、**端口转发**，窄侧栏自动单列。

浏览文件和运行命令请使用官方 **工作区文件**、**新建终端**。预览页签菜单中的
**编辑远程文本** 和终端页签菜单中的 **查看 SSH 终端状态** 保持可用。
已有页签、快捷键和草稿保护继续沿用。DSH 保持 `0.2.0-rc.2`，helper 保持 `0.10.0`
及相同内容哈希；本轮仅调整客户端入口，不触发远端 helper 重新部署。

### 0.10.0：人工终端状态与上下文

在 SSH 工作区的原生终端页签菜单选择 **查看 SSH 终端状态**。
新建的默认 Bash 4.4+ / Zsh 5.8+ 终端会显示当前目录、命令开始/返回、退出码和耗时。
已有终端不强行注入；旧 shell、自定义启动参数或不兼容 hook 保留原始终端并提示原因。

- 不修改 `.bashrc`、`.zshrc`，不接管官方终端输入、屏幕恢复或进程生命周期。
- 断线显示过期；缺失事件显示未知。返回命令行不代表后台任务已结束，嵌套 SSH / tmux 内部状态未知。
- 点 **预览终端上下文**，检查并裁剪片段后再插入原会话草稿。草稿已变化会拒绝覆盖，可手动复制；不会自动发送。
- 每个终端最多保留 64 KiB Host 内存上下文，不由插件落盘，不自动更改 Agent 工作目录。状态不是安全授权依据。
- M3 的持久传输清单 v1 保持兼容。协议和降级边界见 [ADR-0009](docs/adr/0009-observed-human-terminal-state.md)。

### 0.9.0：可恢复的文件与目录传输

SSH 工作区打开 **远程工具 → 文件传输**。上传可选择 / 拖拽文件或目录，下载可输入远端相对路径
（多项每行一个）；先建立并检查清单，再手动开始。目录下载保存为浏览器本机文件夹。

- 单文件、单批均最多 **1 TiB**，不预分配、不整文件读入内存；两个文件并发、最多 10,000 项。
  分块及完整 SHA-256 校验；模型文件工具的 64 MiB 上限不变。
- 暂停保留暂存，刷新 / 重启后不自动恢复。上传重新选择原源文件并校验，下载重新授权原目录；
  文件或身份变化时拒绝拼接。临时网络中断可重放相同分块，未知发布先核对回执。
- 默认不覆盖；替换需明确勾选并检查版本。支持逐项结果、重试和取消。取消保留已完成文件，
  只删除确认属于任务的未完成暂存。暂停七天后到期；本地暂存清理仍需目录授权。
- 默认排除凭据、密钥、`.env`、`.git` 及常见构建缓存，不递归符号链接。名称冲突、
  权限 / 空间不足、超预算或不支持的文件名均明确报错，不静默丢文件或改名。
- 完整下载需要支持 File System Access 的安全 Desktop / Chromium 环境。不支持时明确提示，
  不替换为 ZIP，也不把 DSH 宿主的文件冒充浏览器本机下载。下载合成阶段需要暂存和成品空间。

DSH 仍为 `0.2.0-rc.2`；helper 增加显式协商的持久传输协议 v1。1 TiB 边界通过模拟检查，
真实验收仅使用小样本，不代表已测 TB 级性能。协议与并发限制见 [ADR-0008](docs/adr/0008-durable-human-transfers.md)。

### 0.8.0：本地端口转发

在 SSH 工作区打开 **远程工具 → 端口转发**，填写远端服务端口（例如 TensorBoard 的 `6006`）
和空闲的本机端口（例如 `16006`），点击 **建立转发**。远端服务需要你先启动；
插件只连接该 SSH 主机的 `127.0.0.1`，并只在 DSH 宿主的 `127.0.0.1` 监听。

- 显示本机监听和远端 TCP 检查两种状态；TCP 可连接不代表 HTTP 应用健康，也不代表
  SSH 服务端允许该目标转发。实际网页连接被拒绝时保留诊断。检查需要 Python 3，缺失只提示。
- **打开网页**、**复制地址**、**检查远端端口**、**停止**和明确的 **重新建立**。
  HTTP/HTTPS 只选择浏览器地址协议，不给 HTTP 服务自动添加 TLS。Web 必须确认浏览器
  就在显示的 DSH 宿主上才启用打开按钮；localhost 页面本身也可能来自另一个 SSH 隧道。
- 每条转发独占 OpenSSH 进程和私有控制套接字；不复用或停止用户原有 SSH 连接，
  不继承配置中的额外转发。沿用已有 alias 的认证、跳板和主机指纹策略，不修改 SSH 配置。
- 关闭面板或切换会话不停止转发；同一远端工作区可重新管理。停止、插件卸载或 Host
  退出会回收所属进程；创建结果未知时可以停止原请求，不盲目重发。断线不自动重连。
- 最多同时八条转发；只支持 macOS/Linux Host。首版不保存转发、含 token 的网址，
  不自动扫描端口，不提供任意目标地址、反向转发或 SOCKS。没有改变模型权限或工具能力。

仍基于 DSH `0.2.0-rc.2`。远端 helper 保持 `0.7.0` 的相同文件与协议，不为本功能
重新部署 helper。资源和安全边界见 [ADR-0007](docs/adr/0007-owned-port-forwarding.md)。

### 0.7.0：远程 `@` 补全与快速打开

SSH 工作区中的原生 `@` 从远端找文件；本地会话仍用原服务。打开 **远程工具 → 快速打开**
按文件名搜索，点击结果进入原生只读预览；旁边的 **编辑** 复用 0.6.0 的草稿保护。
快捷键设置中新增“远程快速打开”命令，默认未绑定，不覆盖已有快捷键。

- 默认遵守 Git 忽略规则（已跟踪文件仍包含）；普通目录使用远端 rg。快速打开的
  **包含忽略项** 仅影响本页，不改变原生 `@`。隐藏路径默认需要输入 `.` 搜索。
- 按需建立路径索引，不读取项目正文。每索引最多 50,000 项 / 8 MiB，扫描 15 秒；
  Host 缓存最多八份 / 32 MiB，60 秒后过期。保存、模型工具活动和 **刷新索引** 使缓存失效。
- 构建、过期、截断、权限拒绝、缺 Git/rg 或断线均有状态；失败不会把旧结果换成空结果，
  也不会回退本机。输入完整路径可直接预览，不受索引容量限制，仍受标准文件读取边界约束。
- 引用与预览绑定原会话。含双引号、反斜杠或控制字符等不能安全表示的文件名明确拒绝，
  不改成另一个路径；原生 `@` 过滤这些候选并在索引状态中提示数量。
- 不跟随符号链接，不索引 `.git` 元数据，不自动递归 Git 子模块；可用 **工作区文件**
  逐层浏览或输入完整文件路径。标准文件树每层 1,000 项限制不变。

0.7.0 本轮仅增加文件发现能力；未扩展传输、编辑容量或跨重启草稿恢复。

### 0.6.0：远程文本编辑与安全保存

在 SSH 工作区的原生文件预览页签菜单选择 **编辑远程文本**，或在快速打开结果旁选择
**编辑**。编辑器也支持输入工作区内的相对或完整文件路径。原生预览保持只读。

- 手动保存，支持 Cmd/Ctrl-S、未保存标记、重新加载和关闭前确认。每个会话一份编辑
  缓冲，切换会话不会改变保存的主机或文件；返回该会话可继续修改。
- 只编辑完整的 UTF-8 普通文件，最大 256 KiB；保留 BOM、LF/CRLF 和文件末尾换行。
  二进制、混合换行、单独 CR、无效编码、符号链接及工作区外文件明确拒绝，不截断保存。
- 保存使用完整读取所得的强版本和原子替换。同一 daemon 内的竞争保存报冲突；
  保留草稿，可查看最新远端内容或确认重新加载。外部 writer 仍不具备通用原子 CAS 保证。
- 保存回执丢失时显示“结果待确认”，通过 **核对保存结果** 检查回执或远端内容，
  不自动重发新写入，也不声称取消成功。尚无变化不等于原操作已撤销。
- 人工保存使用 SSH 账号的文件权限、限定当前会话工作区；不修改模型权限或审批策略。
  回执最多保留 256 项，已确定结果 24 小时后回收；未确定结果不自动清除。达到上限明确拒绝。
- 草稿不写磁盘、不发给模型。关闭页签后在本客户端插件实例中保留；刷新页面、重启或
  重载/停用插件会清除草稿，务必先保存。每客户端最多保留 32 个会话缓冲。

首版不含语法高亮、新建/另存为、跨重启草稿恢复、`@` 补全和快速打开。
原生“本机打开 / Finder”仍不是 Remote-SSH 编辑入口。

同时合入 PR #18：远端绝对 Bash workdir 按所属工作区选择 SSH 主机，受限模式仍校验目录边界；
去掉面板常驻的本机打开说明；本机打开的限制见下方文件身份说明。

### 0.5.2：M0 并发与生命周期修复

- 读取和关闭使用同一生命周期锁；关闭后不再返回缓存，也不会读到复用 FD 指向的其他文件。
  工作区根目录的 FD 复制与关闭同样串行化，已取得的独立 FD 可以完成当前操作。
- 同一 helper daemon 的客户端共用文件发布锁，普通写入与分块提交都检查版本；
  使用同一个旧版本竞争保存时，只有一方成功，另一方收到 `E_STALE_VERSION`。
  不同文件仍可并行。不同 daemon、不同 helper 构建和外部编辑器不在这个保证内。
- 工作区先预留身份和额度，再打开目录。取消记录阻止迟到创建，会话关闭也禁止重新发布资源；
  取消记录有容量及保留时间限制，仍在创建中的记录不会提前过期。
- 人工终端回滚必须收到明确的关闭或取消回执；无法确认时保留待清理状态，不把超时或
  `closed: false` 当作已撤销。此版本没有增加远程编辑界面。

### 0.5.1：断线、输入和资源回收加固

- 人工终端等待短暂网络故障恢复，继续使用原 helper 会话、进程及输出游标；手动断开、
  永久错误和保留窗口过期会停止等待，不自动复活已关闭连接，也不偷偷新建终端。
  连接未退出但读响应超时也会按同会话恢复；恢复有总时限，不无限等待。
- 输入和窗口缩放采用独立的确认序号，不再耗尽共享的 4096 项操作记录。重试不会重复
  写入同一批字节；已发送而结果仍不确定的输入会停止该输入通道，不能称为已撤销。
- 资源分配时预留回收记录额度，操作记录已满也能回收既有资源。持续有新连接进入时，
  daemon 仍按时检查过期会话。安装取消会等待 SSH 子进程退出，并在必要时升级到 KILL。
- CI 增加 macOS 的进程/PTY 回归和必须真实执行成功的 Linux bubblewrap 测试。
- Markdown 的文件图片沿文档所属会话读取，中文/空格相对路径不会丢失远端身份；
  使用有界 Blob 缓存，刷新或关闭后释放。单图上限 4 MiB、保留总量 16 MiB、最多 64 张；
  读取失败或超限显示提示，不退回本机 `/api/file`。本地文档也保留自身会话身份。

文件相关的兼容边界见下文；这些改进不等同于完整的远程编辑器集成。

### 人工远程文件与终端面板（0.5.0 起）

打开一个 SSH 工作区会话，在官方右侧栏首页选择 **工作区文件** 或 **新建终端**。
两者通过插件路由到当前远端工作区，不需要发送模型消息，也不需要额外的同名按钮。

- 文件树按需展开远端目录，使用原生只读预览查看文件；中文、空格路径均保留。
  每层最多展示 1000 项并明确提示截断；远端不支持实时文件监听，修改后请手动刷新。
- 人工终端是真实远端 PTY，支持键盘输入、Tab、Ctrl-C、窗口缩放和多个终端标签。
  输入附件、屏幕恢复和会话归属由 DSH 原生终端控制器管理；不会用本机 shell 冒充远端。
- 人工终端以 **SSH 账号权限** 运行，与本地人工终端一致，不受模型工具审批或模型
  sandbox 策略约束。模型 Shell/Terminal 的受限策略保持不变。
- 主机与执行环境按 Agent scope 分开解析，本地会话和不同远端会话互不串线。
  断线可恢复同一 helper 会话；保留窗口失效或输出缓冲溢出时明确报错，不悄悄新建终端。
  这是同一 DSH 服务进程内的重连，不承诺退出 DSH 后恢复原终端。
- macOS 远端也能正确结束 PTY 读取；保留真实命令 PID 到清理结束，避免误杀复用编号。
  macOS 的终端会话随主命令退出而正常挂断，不承诺后台后代继续持有该终端。

此功能要求当前 DSH 组合提供原生右侧栏；精简组合未提供侧栏服务时不显示入口，
缺少具体工具时对应入口不可用，均不会阻止整个插件加载。
文件面板是预览器，不是可保存的远程代码编辑器。设计见
[ADR-0005](docs/adr/0005-native-remote-panels.md)。

### 0.4.0 的可靠性与交互改进

- 取消或超时的排队 RPC 不再发送；已发送的 mutation 仍诚实报告结果不确定。
- Shell/PTY 在进程退出后继续排空保留输出；输出超限明确标记截断。
- 独立单线程 supervisor 和 guardian 保持托管进程组身份，支持父 shell 先退出后的
  TERM→KILL 清理；控制通道、阻塞 stdin、输出读取与资源释放均有截止时间。
- 认证、主机指纹、配置、Python、协议和未知错误停止自动重试；瞬时网络故障仍退避重连。
  可在安装、连接或重连过程中停止，每台主机的操作状态与错误相互独立。
- 添加工作区支持直接输入路径、回车跳转、主目录和刷新；保留目录有界扫描。
- 连接和刷新时检查登录 shell 中的 `rg`。显示搜索可用性、错误原因及修复建议，
  不自动安装远端依赖；补装后点击刷新即可，无须中断正在运行的任务。

进程清理保证覆盖原始托管进程组及 PTY 的当前前台组；主动用 `setsid` / `setpgid`
脱离的后台服务不属于全权限模式下的任意进程树回收保证。受限模式额外由 bubblewrap
PID namespace 提供退出清理。插件不会按进程名扫描并终止其他任务。


## English history

### 0.10.1: compact remote tools

The header now shows a single **SSH · host** badge. Click it to open **远程工具**
(Remote tools); blank Sessions show the same badge above the composer. Hover for
the full remote path. One Remote tools card also joins the official sidebar start
page, only for a verified SSH workspace. It opens **Quick open**, **File transfers**
and **Port forwarding** in that order, with a single column in narrow panes.

Use the official **工作区文件** (Workspace files) and **新建终端** (New terminal)
entries. Editing remains in the file-preview tab menu, and terminal observations
remain in the terminal tab menu. Existing tab IDs, shortcuts and draft protection
are preserved. DSH stays at `0.2.0-rc.2`; the helper stays at `0.10.0` with the same
content hash, so this client-only update needs no remote helper redeployment.

### 0.10.0: human terminal observations and context

Open **查看 SSH 终端状态** in the native terminal tab menu.
New default interactive Bash 4.4+ / Zsh 5.8+ terminals expose cwd, command start/return,
exit status and duration. Existing terminals are not injected; unsupported shells,
custom arguments and incompatible hooks remain raw with an explicit reason.

- No user rc edits or changes to official input ownership, screen recovery or lifecycle.
- Disconnects mark observations stale; missing events remain unknown. Prompt return
  does not mean background jobs ended; nested SSH/tmux internal state is unknown.
- Preview and trim context before explicit insertion into the original Session draft.
  A changed draft refuses insertion, with a copy alternative. Nothing is auto-submitted.
- Up to 64 KiB volatile Host context per terminal; no plugin persistence or automatic
  Agent cwd changes. Observations are not security authority.
- Durable M3 transfer manifest v1 remains compatible. See [ADR-0009](docs/adr/0009-observed-human-terminal-state.md).

### 0.9.0: resumable file and folder transfers

Open **远程工具 → 文件传输** in an SSH workspace. Select/drop upload files or a directory, or
enter download paths (one per line). Review the actual manifest and exclusions,
then start explicitly. Folder downloads go to an authorized browser-local folder.

- **1 TiB per file and batch**, two concurrent files, 10,000 entries; bounded chunks
  and incremental/full SHA-256. No giant buffers or preallocation; model tools remain at 64 MiB.
- Pause/resume and durable restart checkpoints. Reload never auto-resumes: reselect
  upload sources / reauthorize the original download folder. Changed sources,
  remote identity or staging data are refused. Unknown publication is reconciled first.
- No overwrite by default; explicit replacement checks the target version. Per-item
  retries/results; cancellation preserves completed files and cleans only owned partials.
  Idle partials expire after seven days when accessible; local cleanup still requires permission.
- Credentials, keys, `.env`, `.git` and build caches are excluded by default. No
  recursive symlink traversal, silent name changes or truncated successful manifests.
- Full downloads require File System Access in secure Desktop/Chromium. No ZIP,
  whole-file Blob or DSH-Host destination fallback. Staging and final output need disk space.

DSH remains `0.2.0-rc.2`. The helper explicitly negotiates durable transfer protocol v1.
Large numeric boundaries are simulated; small real transfers do not establish TB-scale
performance. See [ADR-0008](docs/adr/0008-durable-human-transfers.md) for concurrency and cleanup limits.

### 0.8.0: owned local port forwarding

Click **端口转发** in an SSH workspace. Enter an existing remote service port
(for example `6006`) and an unused Host port (for example `16006`), then create.
Both the DSH Host listener and SSH target are fixed to `127.0.0.1`. The plugin
does not launch your remote service, scan ports, edit SSH configuration or widen model permissions.

- Listener establishment and remote TCP reachability are separate facts. The latter
  is not HTTP health or proof of server forwarding permission. Connection refusal
  diagnostics are retained; the optional TCP probe requires existing Python 3.
- Open, copy address, probe, stop and explicit recreate actions. HTTP/HTTPS selects
  the browser URL, not a TLS wrapper. Web requires confirmation that the browser
  runs on the displayed DSH Host, even for a localhost DSH URL (which can itself be tunneled).
- An independent OpenSSH master and private socket per forward. Existing alias
  authentication/jump-host/fingerprint policy is retained; inherited forwarding rules
  are suppressed. User-owned SSH masters and occupied ports are never taken over.
- Closing a pane or switching Sessions preserves the forward. Stop, plugin disposal
  and Host exit clean owned children; a guardian also handles parent IPC loss.
  Unknown creation results keep their identity and can be stopped, not blindly retried.
  Disconnections never auto-reconnect. Session-authorized access is workspace-scoped.
- Eight concurrent forwards, macOS/Linux Host only. No saved forwards, credential URLs,
  arbitrary target addresses, reverse forwarding or SOCKS in this release.

DSH stays at `0.2.0-rc.2`; the unchanged remote helper remains `0.7.0` without
redeployment for this feature. See [ADR-0007](docs/adr/0007-owned-port-forwarding.md).

### 0.7.0: remote file references and quick open

Native `@` completion uses a shared, session-authorized remote path index. Local
completion stays with the original provider; remote failures never fall back to
local paths. **远程工具 → 快速打开** searches the same index: click a file for a native
read-only preview, or **编辑** to reuse the protected editor buffer. A configurable
shortcut command is registered without a default binding.

Git uses tracked plus non-ignored untracked files; other directories require rg.
The optional include-ignored checkbox affects quick open only. Scans exclude
symlinks and `.git`, and do not automatically recurse into submodules. The native
file tree and full-path preview remain available. Unsafe mention/address names
(quotes, backslashes or control characters) are explicitly refused, never rewritten.

Limits: 50,000 paths / 8 MiB per index, 15 s scan deadline, at most two builds
globally and one per workspace; eight host caches / 32 MiB, stale after 60 s.
Saves, tool results and explicit refresh invalidate snapshots. Incomplete/error/
stale states are visible; failed rebuilds preserve old data. Missing Git/rg is an
error, not an automatic installation. DSH remains pinned to `0.2.0-rc.2`.

### 0.6.0: manual remote text editing

Use **编辑远程文本** in an SSH file-preview tab menu, or **编辑** beside a quick-open
result. The editor also accepts workspace-relative or full remote paths. Native
previews remain read-only.

- Manual save and Cmd/Ctrl-S, dirty indicators, and in-page reload/close confirmation.
  Each buffer belongs to its original Session, host and path; Session selection never retargets a save.
- Complete regular UTF-8 files up to 256 KiB, preserving BOM, LF/CRLF and final newlines.
  Binary data, invalid UTF-8, mixed/lone-CR newlines, symlinks and outside-workspace paths are refused.
- Strong-version guarded atomic replacement. Conflicts preserve the draft; inspect the
  current remote text or explicitly reload. Arbitrary external writers remain outside atomic CAS guarantees.
- Lost acknowledgements become **result unknown**, with explicit receipt/content verification,
  not blind resubmission or a claim of cancellation. Unchanged content does not prove cancellation.
- Human writes use SSH account permissions within the owning workspace, without changing model policy.
  At most 256 receipts are retained; settled receipts expire after 24 hours, uncertain ones do not.
  Admission fails explicitly at capacity. Client buffers are capped at 32 Sessions.
- Drafts stay in the client plugin instance, including across tab closes, without disk storage or model submission.
  Save before page refresh, app restart, or plugin reload/disable: these discard in-memory drafts.

Syntax highlighting, new files/Save As, restart recovery and file completion/quick open are not included.
Native local-open/Finder actions are still not Remote-SSH editor actions. PR #18 also routes
raw remote Bash workdirs by their workspace identity without weakening sandbox containment.

### 0.5.2: M0 concurrency and lifecycle fixes

- Reads and retirement share a handle lifecycle lock. Closed handles return
  neither cached data nor bytes from a reused FD. Workspace root duplication
  also coordinates with close; already-borrowed FDs can finish their operation.
- All clients of one helper daemon share publication locks for inline and
  chunked writes. Competing saves with the same old version produce one success
  and one `E_STALE_VERSION`; unrelated files remain concurrent. Other daemons,
  other helper builds, and external editors are outside this guarantee.
- Workspace allocation reserves its identity and capacity before opening a
  directory. Bounded cancellation records prevent late publication, including
  during session shutdown; pending allocations keep their cancellation pinned.
- Human-terminal rollback requires an explicit close or cancellation receipt.
  Unconfirmed cleanup remains retryable; timeouts and `closed: false` alone do
  not mean an allocation was revoked. This release adds no remote editing UI.

### 0.5.1: reconnect, input and cleanup hardening

- Human terminals wait through transient transport failures within the original
  helper session's retention window, retaining their process and output cursor.
  Explicit disconnect, permanent failures and expiry stop recovery; they do not
  reactivate a closed connection or silently create a replacement terminal.
  Stalled read/status responses can retire a blackholed transport and resume the
  same session; an absolute recovery budget prevents endless retry.
- Input and resize use separate acknowledged sequence lanes instead of filling
  the shared 4,096-entry operation journal. Retry never duplicates the same input;
  an unresolved sent mutation poisons its lane rather than claiming rollback.
- Allocation reserves bounded cleanup capacity. Existing resources can still be
  retired when the operation journal is full. Expiry sweeps run under continuous
  connection traffic. Installer cancellation waits for SSH child closure, with a
  bounded TERM-to-KILL escalation when necessary.
- CI adds Darwin process/PTY regressions and mandatory positive Linux bubblewrap
  execution, not merely tests that an unavailable sandbox fails closed.
- Markdown file images are read through their document's owning session, including
  relative Unicode/space paths, and use revocable Blob URLs. Limits are 4 MiB per
  image, 16 MiB retained and 64 images per document cache. Failed/oversized images
  show a notice and never fall back to the Host-only `/api/file` route. Local
  documents retain their own session identity too.

These changes do not constitute full remote editor integration. See the file
identity boundaries below.

### Native remote file and user-terminal panels (since 0.5.0)

Open an SSH workspace Session and select the official **工作区文件** (Workspace files)
or **新建终端** (New terminal) on the sidebar start page. The plugin routes these
native panels to the current remote workspace. No model prompt is required.

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

### Reliability and interaction improvements in 0.4.0

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
