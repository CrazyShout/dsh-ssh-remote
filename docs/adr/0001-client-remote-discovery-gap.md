# ADR-0001：第三方插件向 Web 客户端暴露 Remote 的方式（自我注册，非运行时发现）

- 状态：**已修正（原结论过于悲观）**
- 日期：2026-08-14
- 影响范围：`dsh-ssh-remote` 的「Web 设置 GUI」/「工作区选择器」计划

> ⚠️ **修正（同日后续核实）**：本 ADR 原结论「第三方插件无法向 Web 客户端暴露 Remote」
> 是**错的**。正确结论见文末「修正」一节。核心事实：`dsh-api-remotes` 的 client 半
> `inject = ["remote"]` 后，在运行时调用 `ctx.remote.$mount(contribution)` 注册描述符——
> 这是**运行时调用**，任何第三方 client half 都能照做。

## 背景

想给 `dsh-ssh-remote` 做一个 Web 设置页，让用户在浏览器里配置 SSH 主机（含 ProxyJump）。
DSH 的标准做法是通过 Typert Remote：host 侧 `@Remote('config')` / `@Remote('saveConfig')`，
客户端 `ctx.remote.sshRemote.config()` 调用。为此已实现：

- `SshRemoteService extends TypertRemoteService` + `@Remote` 方法；
- 手写 `./typert`（host manifest）与 `./remote`（client descriptors）产物；
- `declare module '@deepseek-ai/cordis'` 的 `Context.sshRemote` 增广。

## 发现（证据来自已安装包源码，非 README）

### 1. Host 侧：`dsh-typert-loader` 只扫 `./typert`，且要求 host face

`@deepseek-ai/dsh-typert-loader/lib/index.js`：

- `const TYPERT_HOST_EXPORT = "./typert";`（约 line 40）——只认识 host face 导出。
- `if (manifest.face !== "host") throw ...`（约 line 81）——只接受 `face === "host"`。
- 全文无任何 `./remote` 常量或处理分支。

→ 我的 `./typert`（host manifest）会被它发现并注册进 `ctx.typert`，这部分成立。

### 2. Client 侧：Remote face 是构建期静态烘焙，无运行时发现

`@deepseek-ai/dsh-api-remotes/lib/client.js`：

- `TYPERT_REMOTE$1` ~ `TYPERT_REMOTE$5` 五个常量（约 line 4296 / 4496 / 5089 / 5690 / 5816），
  对应内置的 5 个 Remote face（goals / commands / pluginInventory / message-feedback / cordis-host-runner）；
- 它们在 line 5916-5920 被直接拼进客户端注册表，**编译期烘焙**，不是从第三方包的 `./remote` 运行时加载。

→ 第三方插件的 `./remote` 产物没有任何运行时消费者；`ctx.remote.sshRemote` 无法在客户端注册。

### 3. 官方已知限制原文佐证

`@deepseek-ai/dsh-typert-loader/README.md`「Known Limitations」：

> **"Discovery imports only the host face; client runtimes need a separate composition owner before equivalent discovery is added."**

## 结论

第三方插件**当前无法**通过标准 Typert Remote 机制向 Web 客户端暴露可调用接口。
「Web 设置 GUI」这条路走不通，除非：

1. DSH 补上客户端 Remote 运行时发现；或
2. 修改 DSH 客户端构建，把本插件的 `./remote` 描述符烘焙进去（改 host 源码，非插件能力）。

## 决定

- **放弃「Web 设置 GUI」**（标准 Remote 机制）。
- 宿主配置改用两条**可用**路径：
  - `~/.dsh/settings.yaml` 的 `ssh-remote: hosts: [...]`（含 `proxyJump`，schema 已核实）；
  - `ssh_remote` 模型工具（`add`/`connect`/`exec`/`read`/`write`）。
- 保留已就位的 `./typert` + `./remote` 产物与 `TypertRemoteService`：一旦 DSH 补上客户端发现，
  这些是即插即用的地基，无需返工。

## 修正（2026-08-14 后续核实，推翻原「dead end」结论）

原结论把「运行时自动发现」和「自我注册」混为一谈。重新核实 `dsh-api-remotes/lib/client.js`：

```js
// dsh-api-remotes/lib/client.js（client 半）
const inject = ["remote"];                       // 注入 ctx.remote
async function apply(ctx) {
  for (const contribution of [TYPERT_REMOTE$4, ...]) {
    disposers.push(await ctx.remote.$mount(contribution));  // 运行时注册！
  }
}
```

关键事实：

- `ctx.remote.$mount(contribution)`（`contribution = { package, descriptors }`）是**运行时**注册 API；
- `dsh-api-remotes` 的 5 个 `TYPERT_REMOTE` 常量是「构建期烘焙进来的描述符」，但**注册动作本身是运行时 `$mount`**；
- 因此**任何第三方 client half 都能**：`inject = ["remote"]`，`apply` 里 `ctx.remote.$mount(自己的 TYPERT_REMOTE)`，
  从而让 `ctx.remote.sshRemote.config()` 可用。

这正是 `dsh-typert-loader/README` 所说「client runtimes need a separate composition owner」——那个
「composition owner」**由插件自己的 client half 充当**，不是死路。

### 修订后的决定

- 「Web 设置 GUI」/「工作区选择器」**可行**：client half 自我注册 Remote 后，即可渲染表单、
  读 `ctx.remote.sshRemote.config()`、写 `ctx.remote.sshRemote.saveConfig()`。
- 保留 `./remote` 产物（`TYPERT_REMOTE`）+ host 侧 `./typert` + `TypertRemoteService`，两者都派上用场。
- 仍需验证：client half 里 `$mount` 后的 `ctx.remote.sshRemote.*` 真机调用闭环（下一步 spike）。

## 后果 / 后续

- host 侧 Remote（`./typert` + `TypertRemoteService` + Context 增广）**照常需要**，是 `$mount` 对端。
- client half 需：`inject: ["remote"]` + `apply` 里 `$mount(TYPERT_REMOTE)`。
- 优先顺序修正为：先做 **client half 自我注册 + 工作区选择器 GUI**（用户明确诉求），
  再做「透明文件路由」。

## 第二次修正：挂载者不能在同一注入作用域直接消费动态 namespace

真机验证发现，`ctx.remote.$mount(TYPERT_REMOTE)` 虽然已经注册描述符，但 Cordis 仍要求
消费者显式注入动态子服务 `remote.sshRemote`。仅声明 `inject = ['remote']` 后直接读取
`ctx.remote.sshRemote` 会报：

```text
cannot get property "remote.sshRemote" without inject
```

也不能把 `remote.sshRemote` 加进同一个顶层 `inject`：顶层 `apply` 必须先运行 `$mount()`
才能提供它，这会形成自等待。最终结构是：

1. 顶层 client half 只注入 `remote` 并挂载 contribution；
2. 挂载完成后创建 `ctx.inject(['remote.sshRemote', 'slots'], ...)` 子作用域；
3. 子作用域消费 Remote namespace 并注册 UI；
4. 卸载时先等待子作用域销毁，再等待 contribution unmount。

这保持了 Cordis 的显式依赖和生命周期所有权，也避免挂载者与消费者形成循环依赖。

## 第三次修正：SSH 配置归 OpenSSH 所有，Web Remote 只做发现

对照 Codex Remote 的官方文档与当前桌面端行为后，撤销“浏览器表单维护 host/user/port/
identityFile/proxyJump”的产品设计。新的边界是：

1. `~/.ssh/config` 是唯一的新连接配置源；递归发现 `Include` 中的具体 Host 别名；
2. 最终连接字段必须通过 `ssh -G -F ~/.ssh/config <alias>` 解析，不能用插件的局部解析器模拟；
3. Web Remote 的 `config()` 只返回发现结果与 config 路径，不再暴露 `saveConfig()`；
4. ProxyJump/ProxyCommand 字节流委托给系统 OpenSSH，插件的 `ssh2` 仅承载最终 SSH/SFTP 会话；
5. 旧 `ssh-remote.hosts` 只作为尚未迁移别名的只读 fallback，不能覆盖同名 OpenSSH alias。

这样避免终端、Codex 和 DSH 各保存一份 SSH 参数，也让 Include、Host 通配默认值、Match 与
多跳 ProxyJump 继续由 OpenSSH 负责解释。

## 第四次修正：用本地锚点桥接 DSH Workspace，并启用精确全局路由

核查 DSH Workspace Registry 后确认：当前核心创建流程会对候选目录执行本机
`realpath/stat`，不能直接登记 `ssh://` URI。插件不修改 Workspace 私有实现，而采用兼容层：

1. 用户在插件接管的「添加工作区」流程里选择 SSH alias 并通过 SFTP 浏览目录；
2. 选择完成后，在 `$DSH_HOME/ssh-workspace-anchors/` 创建空的本地锚点，把
   `anchorPath -> ssh://alias/remote/path` 写入 `ssh-workspace-anchors.json`；
3. 将锚点交回 DSH 原生 `onPicked()`，由核心照常创建、展示和管理 Workspace；
4. host 启动时包装全局 `ctx.fs` 与 `ctx.subprocess`，但只对已登记锚点自身及其子路径生效：
   文件操作委托 SFTP，命令和 PTY 委托系统 OpenSSH；其他路径调用原 provider；
5. 使用路径边界判断并优先最长锚点，避免 `/anchor/x` 误命中 `/anchor/xyz` 或嵌套映射。

之所以需要全局包装，是 DSH 的文件系统和 subprocess 是共享服务，而 Workspace Registry
没有公开按工作区注入 provider 的扩展点。这个决定已取得用户对“完整远程工作区路由”的明确
授权；风险通过精确映射、可恢复 disposer、原 provider 透传和回归测试收敛。远程会话需使用
`Full access`，否则 Harness 的本地沙箱可能阻止 `ssh` 建立网络连接。
