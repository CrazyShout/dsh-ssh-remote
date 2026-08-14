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
