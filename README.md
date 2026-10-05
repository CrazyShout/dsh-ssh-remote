# dsh-ssh-remote

[English](README.en.md) | 中文

面向 DeepSeek Harness Web / Desktop 的 Codex 风格 SSH 远程工作区插件。它从本机 OpenSSH 配置发现
具体 Host，通过标准「添加工作区」选择远端目录，并把 DSH 原生文件、Shell 和终端操作
路由到远端的版本化 helper。

## 0.5.1：断线、输入和资源回收加固

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

## 人工远程文件与终端面板（0.5.0 起）

打开一个 SSH 工作区会话，点击 **远程文件** 或 **远程终端**：空会话的入口在输入框
上方，已有对话的入口在会话顶部。复用 DSH 原生右侧栏，不需要发送模型消息。

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
提供侧栏但缺少具体文件/终端面板时按钮禁用，均不会阻止整个插件加载。
文件面板是预览器，不是可保存的远程代码编辑器。设计见
[ADR-0005](docs/adr/0005-native-remote-panels.md)。

## 0.4.0 的可靠性与交互改进

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

## 架构

默认数据平面已经改为：

```text
本机 DSH Web
  └─ dsh-ssh-remote
      └─ system OpenSSH（保留原始 Host alias）
          └─ 按内容寻址的 Python helper
              └─ 用户私有 Unix-socket daemon
                  ├─ dirfd 隔离文件系统
                  ├─ 进程 / PTY supervisor
                  └─ 可恢复 client session
```

这个设计借鉴 Codex App Server 中很有价值的原则：版本化多路复用控制通道、健康检查、
能力协商、有界输出、稳定资源 ID 和断线恢复，但不会把两者描述成兼容协议。参考
[Codex App Server 官方文档](https://developers.openai.com/codex/app-server)和
[ADR-0004](docs/adr/0004-remote-helper-v1.md)。

当前已经实现：

- **OpenSSH 是唯一连接事实来源**：`Host`、`Include`、`Match`、ssh-agent、Keychain、
  证书、FIDO/PKCS#11、ProxyJump、ProxyCommand、known_hosts 和 host-key 策略都交给
  本机 `ssh`，插件不再复制一套残缺配置。
- **自动安装 helper**：插件包携带 helper，按 SHA-256 存入用户私有版本目录，经 SSH
  stdin 上传并校验后发布；不用 sudo、`curl | sh`、postinstall 或远端包管理器。
- **统一添加工作区**：本地目录与 SSH alias 共用原生选择器；远程浏览、新建目录和路径
  校验默认都走 helper。
- **版本化远端文件**：读取返回稳定 stat token 或 SHA-256+文件身份强 token；写入使用
  同目录临时 inode、fsync、版本复核、原子发布、no-replace 创建和 operationId 去重。
- **远端 Shell**：模型使用的 `ctx.shell` 在本地 sandbox argv 生成前完成远程路由，避免
  把 macOS 的 sandbox 命令错误拿到 Linux 执行；前台和后台进程都有有界输出并可跨
  connector 重连继续读取。
- **真实远端 PTY**：helper 使用远端账号的登录 shell，并管理 PTY、前台 PGID、signal、
  输出 cursor、内部 resize、TERM→KILL 退出和资源回收。
- **远端 sandbox**：Linux 上的 `read-only` / `workspace-write` 进程与 PTY 使用
  bubblewrap。缺少可验证 runner 时失败即关闭，绝不静默升级为远端账号完整权限。
- **恢复和诊断**：私有 daemon 会在恢复窗口内保留 workspace、文件读取 cursor、进程和
  PTY。设置页展示安装中、连接中、已连接、能力受限、重连中、错误，以及版本、能力、
  Retry、Disconnect 和已脱敏诊断。
- **显式兼容路径**：旧 DSH host 设置仍可使用加固后的 ssh2/SFTP 实现；helper 失败后
  不会静默切换过去。

## 当前 DSH 上游边界

0.5.1 面向 DSH `0.2.0-rc.2`。取消的连接探测即使遇到 broken pipe，也会回收 daemon
连接计数；握手阶段的连接级错误保留原始错误代码和提示。早期版本的 `dsh-settings` register API 和
`ShellExecutor` 的 `run`/`start` 接口已分别被标准 Cordis `Config` 和单一
`execute()` 方法取代，插件已随之适配。SSH 上传中断只会令本次连接失败。
当前公开接口仍带来以下用户可见限制：

1. Harness Workspace 必须是真实本地目录，因此插件仍会创建一个很小的本地 anchor，
   只把这个 anchor 及其后代映射到 `ssh://alias/remote/path`。远端源码不会复制进去。
2. 底层 `SubprocessRuntime.spawn()` 是同步接口，必须立即返回本机 PID。直接使用该底层
   seam 的调用仍保留「每进程 system SSH」兼容路由；正常模型 Shell 与终端走 helper。
3. 当前模型 terminal tool 没有 resize verb；人工终端面板已支持自动 resize，模型
   暂时无法主动发出 resize 请求。
4. DSH 历史、配置、插件和 agent loop 仍运行在本机。本插件提供远端执行/文件平面，
   不会虚构第二套 Harness 控制面。
5. DSH `listDir()` 暂无分页契约；标准 FS 遇到超过 1000 项的目录会诚实失败，工作区
   选择器则使用有界的「只扫描目录」模式。原生文件面板有独立的 `truncated` 契约，
   展示有界结果并明确标注截断，不将缺失项伪装成完整目录。
6. DSH 原生「在本机应用打开 / 在 Finder 中显示」及其快捷键仍是**本机操作**，不是
   SSH 编辑器集成。当前接口缺少会话身份，可能打开空 anchor 或本机同名路径；远程
   工作区请使用面板内预览和远程终端，**不要用这些本机打开入口访问远端文件**。
   插件不能只隐藏按钮就声称修好了绕过按钮的快捷键；完整修复需上游提供带会话身份
   的打开契约和可拦截的快捷键。详见 [ADR-0006](docs/adr/0006-reliability-and-file-identity.md)。

要删除 anchor 和最后一层路由 hook，仍需 DSH 上游提供一等
`{ hostId, remotePath, runtime }` 工作区契约。

## 环境要求

- 本机 Node.js 22 或更高版本。
- 要求 DSH `0.2.0-rc.2` 或兼容的更新 `0.2.x` 版本。
- `~/.ssh/config` 中存在具体 Host alias，且 `ssh <alias>` 的 batch 连接可用。
- 远端是 POSIX 系统并提供 Python 3.8 或更高版本。
- DSH 的远程 `glob` / `grep` 搜索需要远端 PATH 中提供 `rg`（ripgrep）。插件会使用
  远端二进制并转换工作区路径，不会把本机打包的可执行文件发送到另一种操作系统运行。
- `read-only` / `workspace-write` 进程和 PTY 隔离需要 Linux bubblewrap (`bwrap`)；
  文件操作本身始终独立使用 dirfd 限制。

请把 User、Port、代理和认证信息写在 OpenSSH 配置里，不要编码为
`ssh://user@host:port`：

```sshconfig
Host devbox
  HostName devbox.example.com
  User you
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
```

若以后删除该具体 alias，已持久化工作区会在新建 SSH 连接前失败即关闭，不会把 alias
退化成普通 DNS 主机名继续连接。

在 Web 使用前先运行一次 `ssh devbox`，按你的 OpenSSH 策略核对新主机指纹。

helper 连接固定使用 `BatchMode=yes`。已由 agent/Keychain 托管的密钥、证书和预授权
硬件密钥继续由 OpenSSH 处理，但 Web 后台连接无法回答交互式密码、PIN、passphrase 或
MFA 提示；请先准备好 agent/登录会话。

## 安装与使用

```sh
# npm 发布后
dsh plugin --profile web add dsh-ssh-remote

# 直接从 GitHub 安装
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote'
```

重启 `dsh web`，打开「设置 → 内置插件 → SSH Remote」，可以先连接，也可以直接在「添加工作区」
中选择主机。首次连接会自动安装匹配版本的 helper。

官方 Desktop 复用同一套 Web 客户端和 Host 插件接口。在桌面应用的插件管理页面中安装
`github:CrazyShout/dsh-ssh-remote`，然后重启应用，即可使用「SSH Remote」设置和远程
目录工作区选择器。请确认桌面应用内置的是兼容的 DSH `0.2.x` 引擎，最低版本为
`0.2.0-rc.2`；旧 `0.1.x` 引擎应继续使用插件 `0.3.1`（Git commit `1432649`）。
不同桌面发行版的 profile 可能不同，CLI 的 `--profile web` 安装命令不应代替桌面应用
自己的插件管理入口。

Harness 会把精确映射保存在 `$DSH_HOME/ssh-workspace-anchors.json`，anchor 目录位于
`$DSH_HOME/ssh-workspace-anchors/`。其他本地路径继续使用原来的本机 provider。

## 安全模型

- JSONL 单帧上限 1 MiB；stdout 只承载协议，stderr 只保留有界、凭据脱敏的诊断尾部。
- helper runtime 目录权限为 `0700`，Unix socket 为 `0600`；恢复必须同时通过稳定
  clientId 与恒定时间比较的随机 token。
- `workspace/open` 是唯一接受绝对路径的文件请求；后续请求只能使用 root fd 下的相对
  路径，拒绝 `..`、NUL 和符号链接穿越。
- 文件与进程 mutation 都携带稳定 `operationId`。只有密码学恢复到同一 server session
  后，断线 mutation 才允许最多重放一次。
- 输出、资源、并发请求、operation journal 和 retention 全部有硬上限；完成记录只会在
  超过恢复安全窗口后过期。
- 插件不会修改 `~/.ssh/config`、私钥或 known_hosts。

POSIX 没有通用的「仅当路径仍指向 inode X 时 rename」原语。helper 会串行化自身写入、
在发布前复核身份和内容并原子发布，但任意不合作的外部 writer 仍可能卡入最后一次检查到
rename 的极短窗口。能力会诚实报告 `externalWriterRaceFree: false`。

## 开发

```sh
npm ci
npm run test:helper
npm test
npm run build
# 可选真实远端验收：自动创建并清理一个 /tmp/dsh-ssh-smoke.* 测试目录
node scripts/smoke-remote.mjs YOUR_SSH_ALIAS
```

CI 覆盖 Node 22/24 与 Python 3.8/3.9/3.10/3.12。仓库提交 `lib/`，因为 DSH 可以直接从
Git 安装，不应依赖安装时执行构建脚本。

设计记录：

- [ADR-0003：Codex remote parity 边界](docs/adr/0003-codex-remote-parity.md)
- [ADR-0004：远端 helper v1](docs/adr/0004-remote-helper-v1.md)

## License

MIT
