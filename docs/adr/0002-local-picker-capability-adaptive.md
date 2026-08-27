# ADR-0002：本机目录选择按组合 picker 的能力自适应（browse 优先，native 兜底）

- 状态：**已实施**
- 日期：2026-08-26
- 影响范围：`client/index.tsx` 组合目录流、`client/local-browse.ts`

## 背景

插件把 `conversation.hero.workspace.directoryFlow` 与
`sidebar.workspaces.directoryFlow` 两个 slot 以 `single` kind 遮蔽（priority -100），
从而提供「本机 + SSH」合一的添加工作区流。其中本机分支无条件调用
`ctx.workspaces.pickDirectory()` → wire `host.pickDirectory`。

该 wire 方法只在组合 picker 提供 **native** 能力时被服务（apiproxy 直接检查
`ctx.directoryPicker.capability().kind`）。headless 宿主——典型如 WSL 里没有
Zenity/KDialog 的 Ubuntu——会被 `directory-picker-auto` 组合为 **browse** 能力，
此时调用直接失败：

```text
directory picker failed: host.pickDirectory needs the native capability;
the composed picker serves "browse"
```

Harness 自带的 browse 占位者（`ui-directory-picker-browse`，走
`host.listDirectory`/`host.createDirectory` 的应用内浏览器）本可以工作，
但它同样被本插件的遮蔽者顶掉了。结果：SSH 工作区一切正常，唯独无法添加本机目录。

## 决定

1. **本机分支按能力自适应，且仅对显式能力不可用兜底**。打开对话框时用无害的
   家目录 `listDirectory()` 探测：成功 ⇒ browse 能力可用；只有抛出
   `DirectoryBrowseError` 且 `rpcError.code === 'directory-picker-unavailable'`
   （组合未提供 browse 能力的明确信号，探测结果或探测后的竞态浏览调用都可能
   携带该信号）才判定为不可用并回退系统选择器。权限、超时、传输、内部等其余
   失败一律原样重抛：探测失败显示在对话框内，浏览中途（进入/导航/新建文件夹）
   失败也保留在对话框内可重试，绝不触发原生兜底。
2. **本地与远端共用同一浏览视图**。引入 `target = {kind:'local'} |
   {kind:'ssh', alias}`，面包屑、条目列表、新建文件夹、提交全部按 target
   分派（本地提交 = `onPicked(path)`；SSH 提交 = 原 materialize/锚点流程）。
3. **WSL 快速锚点**。进入本机浏览后列一次 `/mnt`：单字母子目录生成
   「Windows · X:」chip。这覆盖核心场景——一个跑在 WSL 里的 DSH 同时服务
   Linux 侧（`/home/...`）与 Windows 侧（`/mnt/c/Users/...`）的工作区；
   非 WSL 布局下 `/mnt` 没有单字母目录，锚点行自然为空。
4. **不读取能力种类广播**。协议不向客户端广播 composed capability（README 明确
   "the client needs no advertisement"）；我们探测的是"这次调用是否可用"，
   而非假设某种能力标记存在，因此对协议演进保持钝感。

## 后果

- headless / WSL 宿主恢复添加本机工作区的能力；桌面 native 组合的行为不变。
- 只有显式的 `directory-picker-unavailable` 才会切换原生选择器；真实浏览错误
  （权限、超时、传输、内部）始终留在对话框内重试，避免把「目录真的读不出来」
  误判为「选择器不可用」而跳进无法感知宿主文件系统的原生对话框。
- `/mnt/...` 下创建的工作区是普通 Harness 工作区，fs/subprocess 走宿主本地
  provider（即 WSL 视角），性能与换行符语义遵循 WSL 跨文件系统的既有行为。
- 新增纯函数 `windowsDriveAnchors` / `probeLocalBrowse` /
  `isDirectoryPickerUnavailable`（`test/local-browse.test.ts` 覆盖），
  组件逻辑保持无 IO、可测。
