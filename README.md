![dsh-ssh-remote — Your remote workspace. Right here.](docs/images/banner.png)

[English](README.en.md) · [下载 0.13.0](https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v0.13.0) · [更新记录](CHANGELOG.md) · [排错](docs/TROUBLESHOOTING.md)

**远程开发，像在本地一样顺手。**

在 DeepSeek Harness 中打开 SSH 工作区，用原生文件面板和终端开发。复用 `~/.ssh/config`，支持远程编辑、`@` 文件引用、端口转发和文件传输，无需在服务器运行完整 DSH。

## 安装：复制、安装、连接

已有可用的 **DSH** 和 **SSH 别名**？直接从这里开始。Desktop 自带运行时，不必额外安装 Node。

### Desktop / Web

1. 打开左侧 **插件 → 添加插件**，粘贴下面的完整地址。
2. 点击 **安装 → 立即启用**。首次安装或从 0.11.x 升级后，保存工作并完整重启当前 DSH；日后按更新结果提示操作。
3. 点击 **添加工作区**，选择 SSH 主机与远端文件夹，即可使用官方 **工作区文件** 和 **新建终端**。

~~~text
https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.13.0/dsh-ssh-remote-0.13.0.tgz
~~~

无需克隆、编译或复制插件目录。安装器仍需联网下载运行依赖。

插件详情中的 **开始使用** 可随时展开查看连接步骤；界面跟随 DSH 的中文／英文设置，不另设语言开关。已有 0.12.0 的用户可直接在插件详情检查更新。

> **请使用完整地址。** npm 上同名的 `dsh-ssh-remote` 属于其他项目。Desktop 与 Web 使用独立 profile，需分别安装。

### CLI / Web：一条安装命令

~~~sh
dsh plugin --profile web add 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.13.0/dsh-ssh-remote-0.13.0.tgz'
~~~

安装后重新启动 `dsh web`；已有服务先在它的终端按 Ctrl-C。**Desktop 请使用应用自己的插件页。**

<details>
<summary>其他安装方式与安装界面</summary>

![在官方插件页面粘贴固定版本安装地址](docs/images/install.png)

固定 Git Tag（需要本机 Git）：

~~~sh
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote#v0.13.0'
~~~

也可下载 Release 的 `.tgz`，在插件页输入其绝对路径；`SHA256SUMS` 用于校验下载包。遇到依赖脚本提示时按官方安装器确认，不要全局放开未知脚本。0.11.0 起已移除 `ssh2` / `cpu-features` 原生构建依赖。

</details>

## 打开之后能做什么

![实际 Web 界面：SSH 远程工作台](docs/images/remote-tools.png)

| 日常操作 | 入口 |
| --- | --- |
| 浏览、预览文件 | 官方侧栏 **工作区文件** |
| 编辑并保存文本 | 文件页签菜单 **编辑远程文本**，或快速打开中的 **编辑** |
| 找到并引用代码 | **SSH · 主机 → 快速打开**，或输入框中的原生 `@` |
| 运行命令 | 官方侧栏 **新建终端** |
| 查看目录、命令退出码与上下文 | 终端页签菜单 **查看 SSH 终端状态** |
| 访问 TensorBoard、Jupyter、开发网页 | **远程工作台 → 端口转发** |
| 上传、下载文件或目录 | **远程工作台 → 文件传输** |
| 使用远端 skill | 当前远程会话的原生 `/` 技能菜单 |

顶部 **SSH · 主机** 打开统一远程工作台；空会话入口在输入框上方。本地会话仍使用原来的文件和终端，不会被接管。

连接圆点：绿＝SSH/helper 已连接，黄＝连接中或能力受限，灰色空心＝未连接或状态未知，红＝连接错误。悬停或键盘聚焦可查看完整路径和原因。绿点不代表所有远端功能都已经验证。

## 第一次使用 SSH？

先按 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness)安装 DSH，再准备本机 OpenSSH 别名：

~~~sshconfig
Host devbox
  HostName your-server.example.com
  User your-user
~~~

运行 `ssh devbox`，首次连接时核对主机指纹，确认能登录后 `exit`。插件后台使用非交互认证，因此还需确认：

~~~sh
ssh -o BatchMode=yes devbox true
~~~

随后按上面的三步安装连接，在原生终端运行 `pwd` 验证远端目录，无需发送模型消息。首次连接会部署匹配的 Python helper；主机诊断位于 **设置 → 内置插件 → SSH Remote**。自定义 `Port`、`IdentityFile`、`ProxyJump` 仍写在 OpenSSH 配置中，不必在插件里重复填写。

## 环境与边界

已验收 DSH **0.2.0-rc.2 / 0.2.1-rc.2**；其他版本以对应 Release 的验收记录为准。

| 用途 | 要求 |
| --- | --- |
| Desktop | 官方 DSH Desktop，自带 Node 和包管理器 |
| CLI / Web | Node 22+，`dsh` 与 `pnpm` 可用 |
| 基础远程连接 | 本机 OpenSSH、可用的非交互认证；远端 Python 3.8+ |
| 文件搜索与 `@` 补全 | 远端 ripgrep；Git 工作区索引还需要 Git |
| 模型受限命令执行 | 远端 Linux 和 bubblewrap；浏览文件、人工终端不要求它 |

- 文本编辑：完整 UTF-8 文件，最大 **256 KiB**；重启前保存草稿。
- 文件传输：单文件、单批上限 **1 TiB**；小样本实测、容量边界模拟，未测试 TB 级吞吐。重启续传需重新授权源或目标目录。
- 端口转发：目前仅验收 macOS / Linux 本机；Windows 尚无完整 Desktop/SSH 验收。
- 远端技能：默认发现项目及用户的 `.dsh/skills`、`.agents/skills`，不跟随符号链接、不自动执行脚本。
- DSH 的 Finder / 本机应用入口仍是本机操作；远端文件使用面板预览和远程编辑。

详细范围见[技术参考](docs/TECHNICAL.md)。从旧 SFTP/插件 host 配置迁移见[迁移指南](docs/MIGRATION-0.11.md)；已有 OpenSSH 别名无需迁移，升级不会自动改写 SSH 配置。

## 更新、回退与卸载

**应用内更新：** 打开 **插件 → dsh-ssh-remote → 检查更新**。发现稳定版后点击 **更新到版本号 → 确认更新**，无需返回仓库或复制新链接。默认在页面可见时每 6 小时检查一次；可在同页关闭自动检查，手动检查仍可用。提醒只显示一次，不自动安装。

更新调用 DSH 官方安装服务，保留依赖审批与兼容性检查。安装完成与新版生效会分别显示；若提示需要重启，请先保存草稿、暂停传输。**更新重载可能结束 SSH 终端和端口转发；插件不会自动重启 DSH。** 断线或响应丢失时选择 **重新确认结果**，不会自动重复安装。

源码 `link:` / 本地目录安装只提示版本，使用 Git 同步，不会被安装包覆盖。0.11.2 及更早版本尚无此入口，需要先按上方步骤安装当前版本。也可随时从 [Releases](https://github.com/CrazyShout/dsh-ssh-remote/releases) 手动选择固定版本；若 DSH 拒绝直接替换某种来源，按官方插件页提示处理，不自动卸载旧版。Web CLI 仍可在同一 profile 再次运行 `add`。

**回退到 0.12.0：** 在插件页安装上一正式版本，或使用：

~~~sh
dsh plugin --profile web add 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.12.0/dsh-ssh-remote-0.12.0.tgz'
~~~

按提示重启。0.12.0 已验证上述两版 DSH，helper 与 0.13.0 相同；已迁移的 OpenSSH 配置保留。

**停用 / 卸载：** 使用对应应用的插件页。Web 也可停止服务后运行：

~~~sh
dsh plugin --profile web remove dsh-ssh-remote
~~~

不会删除远端项目、本地会话或 SSH 配置。已有远程工作区需要插件才能访问，重新安装可复用保存的映射。

## 帮助与开发

[排错指南](docs/TROUBLESHOOTING.md) · [提交 Issue](https://github.com/CrazyShout/dsh-ssh-remote/issues) · [技术参考](docs/TECHNICAL.md) · [路线图](docs/ROADMAP.md) · [发布流程](docs/RELEASING.md) · [更新记录](CHANGELOG.md)

反馈时附上插件 / DSH 版本、Desktop 或 Web、安装来源及第一个实际错误；不要提交凭据。

MIT License.
