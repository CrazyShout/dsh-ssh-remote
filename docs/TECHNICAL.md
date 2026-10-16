# 技术参考 / Technical reference

[安装与使用](../README.md) · [English quick start](../README.en.md) · [排错 / Troubleshooting](TROUBLESHOOTING.md)

## 中文

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
[ADR-0004](adr/0004-remote-helper-v1.md)。

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

当前版本面向 DSH `0.2.0-rc.2`。取消的连接探测即使遇到 broken pipe，也会回收 daemon
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
   的打开契约和可拦截的快捷键。详见 [ADR-0006](adr/0006-reliability-and-file-identity.md)。
   新增独立的“用 VS Code Remote-SSH 打开”入口可以另行探索，不必等待原生入口的完整改造。

要删除 anchor 和最后一层路由 hook，仍需 DSH 上游提供一等
`{ hostId, remotePath, runtime }` 工作区契约。


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

- [ADR-0003：Codex remote parity 边界](adr/0003-codex-remote-parity.md)
- [ADR-0004：远端 helper v1](adr/0004-remote-helper-v1.md)


## English

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
and [ADR-0004](adr/0004-remote-helper-v1.md).

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

Version The current plugin targets DSH `0.2.0-rc.2`. Cancelled connection probes
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
6. Native **Open in a local app / Reveal in Finder**, including the keyboard
   shortcut, are local-only actions, not SSH editor integration. Their rc.2
   contracts omit session identity and can open an empty anchor or an unrelated
   same-named local path. Use in-app previews and the remote terminal for SSH
   files, not those local-open actions. Hiding a button does not guard the
   keyboard/menu path. A complete fix requires an upstream session-aware open
   contract and shortcut guard; see [ADR-0006](adr/0006-reliability-and-file-identity.md).
   A separate, explicitly labelled VS Code Remote-SSH action can be explored
   independently; it need not wait for full replacement of the native actions.

Removing the anchor and the last routing hooks requires an upstream first-class
`{ hostId, remotePath, runtime }` workspace contract.


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

- [ADR-0003: Codex remote parity boundary](adr/0003-codex-remote-parity.md)
- [ADR-0004: Remote helper v1](adr/0004-remote-helper-v1.md)
