# dsh-ssh-remote

[English](README.en.md) | 中文

面向 DeepSeek Harness 的 Codex 风格 SSH 远程工作区插件。它从本机 OpenSSH 配置发现
具体 Host，通过标准「添加工作区」选择远端目录，并把 DSH 原生文件、Shell 和终端操作
路由到远端的版本化 helper。

## 0.3.0 的架构

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

npm 当前可安装的 DSH 基线仍是 `0.1.1-rc.2`，其公开接口带来四个用户可见限制：

1. Harness Workspace 必须是真实本地目录，因此插件仍会创建一个很小的本地 anchor，
   只把这个 anchor 及其后代映射到 `ssh://alias/remote/path`。远端源码不会复制进去。
2. 底层 `SubprocessRuntime.spawn()` 是同步接口，必须立即返回本机 PID。直接使用该底层
   seam 的调用仍保留「每进程 system SSH」兼容路由；正常模型 Shell 与终端走 helper。
3. 当前 terminal tool 没有 resize verb。helper 与 backend 已实现 resize，但 DSH 暂时
   无法让模型发出请求。
4. DSH 历史、配置、插件和 agent loop 仍运行在本机。本插件提供远端执行/文件平面，
   不会虚构第二套 Harness 控制面。
5. DSH `listDir()` 暂无分页契约；标准 FS 遇到超过 1000 项的目录会诚实失败，工作区
   选择器则使用有界的「只扫描目录」模式，因此大源码目录仍可导航。

要删除 anchor 和最后一层路由 hook，仍需 DSH 上游提供一等
`{ hostId, remotePath, runtime }` 工作区契约。

## 环境要求

- 本机 Node.js 22 或更高版本。
- 要求 DSH `0.1.1-rc.2` 或兼容的更新 `0.1.x` 版本。
- `~/.ssh/config` 中存在具体 Host alias，且 `ssh <alias>` 的 batch 连接可用。
- 远端是 POSIX 系统并提供 Python 3.9 或更高版本。
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

重启 `dsh web`，打开「设置 → SSH Remote」，可以先连接，也可以直接在「添加工作区」
中选择主机。首次连接会自动安装匹配版本的 helper。

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
```

CI 覆盖 Node 22/24 与 Python 3.9/3.10/3.12。仓库提交 `lib/`，因为 DSH 可以直接从
Git 安装，不应依赖安装时执行构建脚本。

设计记录：

- [ADR-0003：Codex remote parity 边界](docs/adr/0003-codex-remote-parity.md)
- [ADR-0004：远端 helper v1](docs/adr/0004-remote-helper-v1.md)

## License

MIT
