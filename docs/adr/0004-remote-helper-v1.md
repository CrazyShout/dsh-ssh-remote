# ADR-0004：Phase 2 远端 Helper v1 与当前 DSH 的完成边界

- 状态：**已实施，等待 0.3.0 发布**
- 日期：2026-08-30
- 插件版本：`0.3.0`
- Helper 协议：`dshRpc = "1"`

## 决定

`dsh-ssh-remote` 的默认执行平面改为：

```text
本机 DSH
  └─ RemoteHelperManager
       └─ system OpenSSH（保留原始 Host alias）
            └─ helper connect --stdio
                 └─ 远端 per-user Unix socket daemon
                      ├─ root-dirfd 文件系统
                      ├─ process/PTY supervisor
                      ├─ 有界输出与游标
                      └─ session resume / health
```

system OpenSSH 独占 SSH config、agent、known_hosts、Match、ProxyJump、证书与硬件密钥
语义。插件不再尝试用 `ssh2` 复刻这些能力；`ssh2` 只保留为显式 compatibility fallback。

Helper 由插件包携带，经本机 SHA-256 校验后通过 SSH stdin 上传到用户私有版本目录；不用
`curl | sh`、不用 sudo、没有 postinstall。首次连接自动安装，版本兼容通过握手判断。

## 为什么采用 App Server 风格

OpenAI 官方 App Server 文档把富客户端集成定义为双向 JSON-RPC，并提供 stdio、WebSocket
和 Unix socket transport。文档还明确建议非本机连接使用 TLS 或 SSH port-forward，且
WebSocket/远端 Code Mode transport 仍属 experimental：

- https://developers.openai.com/codex/app-server

本插件不复制 Codex 协议，但复用这些经过验证的架构原则：版本握手、单一控制通道、严格
framing、健康检查、有界队列、远端 supervisor 与断线恢复。

## Helper v1 保证

### 协议

- JSONL，每行一个 `dshRpc: "1"` 帧，默认上限 1 MiB；
- 服务端 `server/hello` 后才允许 `initialize`；协议区间和 capability 必须相交；
- request id、process id、stream cursor 均为字符串；
- mutation 使用 `operationId` 去重；不明确的断线结果绝不自动重放；
- stdout 只承载协议，stderr 只承载限长、脱敏诊断；
- 每个 host single-flight、心跳、full-jitter 重连和显式状态机。

### 文件系统

- `workspace/open` 是唯一接收绝对路径的入口；返回绑定 root directory fd 的 handle；
- 后续路径必须相对、无 NUL、不得通过 `..` 越界；
- 逐组件 `openat + O_NOFOLLOW`（能力标记 `dirfd-no-follow`），写入始终基于父目录 fd；
- version 使用 dev、inode、size、纳秒 mtime/ctime，并在读取时加入 SHA-256；
- 读取对同一个 fd 做前后 `fstat`；中途变化失败；
- 覆盖写使用同目录私有 temp、`fsync`、版本复核和原子 replace；
- 大文件通过显式 cursor 的有界 read/write chunk 传输，不突破 1 MiB frame；
- `createIfAbsent` 使用 no-replace hardlink 发布；
- `read-only` 与 `workspace-write` 在远端再次执行权限检查。

通用 POSIX 仍不存在“仅当目标仍指向指定 inode 才 rename”的外部 CAS。v1 保证所有 helper
写入线性化、最终检查前的外部变化可检测、发布本身原子；不保证任意不合作外部 writer 在
最后检查与 rename 之间绝无竞态，capability 固定报告
`externalWriterRaceFree: false`。

### Process / PTY

- argv 结构化传输，不经过拼接 shell；
- 进程独立 process group，daemon 负责 wait/reap 和 TERM→KILL；
- PTY 使用远端 `openpty`、真实 foreground PGID、`killpg` 和 `TIOCSWINSZ`；
- 输出在 daemon 中持续 drain，按单调 cursor 保留有界 ring；
- SSH connector 断开不杀远端 session；同一 client instance 可重连恢复；
- `workspace-write/read-only` 仅在远端存在可验证 sandbox runner 时开放，否则失败关闭；
- Linux 当前使用 bubblewrap capability；`danger-full-access` 直接使用 SSH 账号权限。

## 当前 DSH rc.2 的硬边界

截至 2026-08-30，npm 可安装最新版仍是 `0.1.1-rc.2`。接口核查确认：

1. Workspace 仍要求本机 realpath，因此 anchor 暂时不能删除；
2. `SubprocessRuntime.spawn()` 同步返回含立即 PID 的 handle，不能无损映射到异步长连接 RPC；
3. subprocess spec 没有 host/authority；
4. terminal/subprocess handle 只有初始 rows/cols，没有 resize seam；
5. FS 没有原子 `readWithVersion`；工具仍是 `stat → read`；
6. 一个 Cordis Context 仍只有一个 execution-world subprocess provider。

因此 0.3.0 在当前上游能诚实完成：

- 文件、浏览、状态和 persistent PTY 默认走长连接 helper；
- 模型 `ctx.shell` 在远程 workspace 走 helper，并在远端应用 sandbox policy；
- 直接 `ctx.subprocess.spawn()` 的兼容路由仍使用每进程 system SSH，本机 provider 只保留
  本地 SSH client 的同步 PID、stdio、spill 与 teardown；它不声称能证明任意远端
  daemonized descendant 已完全停稳；
- 终端 helper 内部支持 resize，但当前 DSH 工具无法发出 resize 请求；
- 本地 anchor 和唯一一层精确路由 monkey patch 保留到上游提供 host-aware runtime。

这些限制不是实现欠账伪装成完成项。Phase 3 仍需 DSH 上游提供一等
`{ hostId, remotePath, runtime }` 工作区、async host-aware process seam、终端 resize 和原子
read-with-version。

## Fallback 规则

Compatibility fallback 只允许由旧版 DSH host 设置或组合代码显式选择；helper 失败不会自动
回退。fallback 必须发生在操作开始前，并在状态 UI 明示。

允许 fallback：

- 旧版 host 记录明确走兼容 SFTP；
- 组合代码显式注册导出的 `LegacySsh2RemoteTerminalBackend`；
- 在操作开始前由调用方根据 capability 明确选择兼容实现。

禁止静默 fallback：

- SSH host-key / authentication 失败；
- helper hash、协议或 framing 损坏；
- mutation 或 process start 结果未知；
- 已经获得远端 operation id 后连接断开。

## 成功标准

- helper 协议与安装故障注入测试；
- helper/fallback 文件契约测试；
- PGID signal、PTY output cursor、断线 resume；
- symlink swap / root rename / no-replace 并发测试；
- Node 22/24 + Python 3.9/3.10/3.12 CI；
- 真实 `hk-wsl` 的 install、browse、read/write、shell、PTY、断线恢复和 sandbox smoke；
- UI 展示 helper version、capabilities、connected/degraded/error、Retry/Disconnect/Diagnostics；
- 独立安全/生命周期审查无 P0/P1。
