# dsh-ssh-remote

[English](README.en.md) | 中文 · [下载 0.11.1](https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v0.11.1) · [更新记录](CHANGELOG.md)

在 DeepSeek Harness 中使用 SSH 远程开发工作区：浏览和编辑远端文件、引用代码、打开终端、转发端口和传输文件。直接复用本机 OpenSSH 配置，以及 DSH 官方文件、终端界面。

![远程工作台：快速打开、文件传输、端口转发与终端状态](docs/images/remote-tools.png)

## 环境要求

兼容基线为 **DSH 0.2.0-rc.2 / 0.2.1-rc.2**；新版 Desktop 使用其自带运行时。验收范围与记录见 [0.11.0 验收记录](docs/releases/0.11.0-acceptance.md)。Windows 本机尚未验收；端口转发当前只支持 macOS / Linux 本机。

| 用途 | 需要准备 |
| --- | --- |
| Desktop | 安装官方 DSH Desktop；它自带 Node 和包管理器，不必另外安装。 |
| CLI / Web | DSH 0.2.0-rc.2 或 0.2.1-rc.2、Node 22+，并让 `dsh` 和 `pnpm` 在 PATH 中可用。 |
| 基础远程连接 | 本机 OpenSSH、具体 Host alias、可用的非交互 SSH 认证；远端 Python 3.8+。 |
| 远端文件搜索与 `@` 补全 | 远端 `rg`（ripgrep）；Git 工作区索引还需要远端 Git。 |
| 模型受限命令执行 | 远端 Linux 和可用的 bubblewrap；基础文件浏览和人工终端不要求它。 |

尚未安装 DSH？请先按 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness)安装。其他 0.2.x 版本是否兼容，以对应 Release 的验收记录为准。

## 安装

### Desktop / Web：推荐使用插件页面

1. 打开 DSH 左侧 **插件** 页面，点击 **添加插件**。
2. 粘贴以下完整地址，点击 **安装**：

```text
https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.11.1/dsh-ssh-remote-0.11.1.tgz
```

3. 0.11.0 已移除 `ssh2` / `cpu-features`，不再需要这两个包的原生构建。若出现其他依赖提示，按官方安装器核对；不要全局允许未知脚本。
4. 安装完成后点击 **立即启用**（插件列表中名称为 `dsh-ssh-remote`），然后完整重启当前 Desktop 或 Web 服务。

![在官方插件页面粘贴固定版本安装地址](docs/images/install.png)

这是预构建安装包，无需克隆仓库或运行编译命令；安装仍会联网下载运行依赖。**npm 上同名的 `dsh-ssh-remote` 属于其他项目，请使用本页完整地址。** Desktop 与 Web 有各自的 profile，需要分别安装。

### CLI：安装到 Web profile

```sh
dsh --version
pnpm --version
dsh plugin --profile web add 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.11.1/dsh-ssh-remote-0.11.1.tgz'
```

安装完成后，重启原来的 `dsh web` 服务。已有服务时先在它的终端按 Ctrl-C，再运行 `dsh web`。若曾遇到构建拦截，重试成功后还需在插件页确认已启用。Desktop 请使用应用自己的插件页面。

需要从 GitHub 源码地址安装时，使用固定版本（此方式需要本机 Git）：

```sh
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote#v0.11.1'
```

也可以从 Release 下载 `.tgz`，在插件页面输入它的**绝对路径**，或用同一 CLI 命令安装该路径。Release 的 `SHA256SUMS` 用于核对下载包。

## 首次连接：五步走

1. 在本机 `~/.ssh/config` 中使用一个具体别名；已有可用别名可直接复用：

   ```sshconfig
   Host devbox
     HostName your-server.example.com
     User your-user
   ```

2. 运行 `ssh devbox`，确认能登录，首次连接时核对主机指纹；完成后用 `exit` 退出。加密密钥、密码或 MFA 的准备见[连接排错](docs/TROUBLESHOOTING.md)。
3. 在 DSH 中点击 **添加工作区 → devbox**，浏览或输入远端目录，选择 **打开此文件夹**。
4. 首次连接会自动部署匹配的 Python helper。主机也可在 **设置 → 内置插件 → SSH Remote** 中连接、重试和查看诊断。
5. 在官方右侧栏打开 **工作区文件** 预览一个文件，再用 **新建终端** 执行 `pwd`，确认显示的是远端目录。这个过程不需要给模型发消息。

自定义端口、密钥和跳板机仍写在 OpenSSH 配置中，例如 `Port`、`IdentityFile`、`ProxyJump`；插件里不用重复配置。后台连接使用 `BatchMode=yes`，因此终端中的交互登录成功后，还需确保 `ssh -o BatchMode=yes devbox true` 能成功。

## 从旧 SSH 设置升级

0.11.0 统一使用 system OpenSSH + Python helper，移除了旧 SFTP 后端和两个 SSH2 终端导出。已有 `~/.ssh/config` 主机无需迁移；仍用插件旧 host 设置的用户请到 **设置 → SSH Remote → 迁移旧 SSH 配置**，先检查差异，再确认备份、写入和验证连接。升级不会自动修改 SSH 配置或私钥；未迁移工作区不会回退到本机。详见[迁移指南](docs/MIGRATION-0.11.md)。

## 常用功能

| 你想做什么 | 从哪里进入 |
| --- | --- |
| 浏览、预览远端文件 | 官方侧边栏 **工作区文件** |
| 编辑文本并保存 | 文件预览页签菜单 **编辑远程文本**，或在快速打开中选中文件后点击 **编辑** |
| 快速找文件 | 顶部 **SSH · 主机名 → 快速打开**，或输入框中的原生 `@` |
| 运行命令 | 官方侧边栏 **新建终端** |
| 查看目录、退出码和终端上下文 | 终端页签菜单 **查看 SSH 终端状态** |
| 访问 TensorBoard / Jupyter / 开发网页 | **远程工作台 → 端口转发** |
| 上传、下载文件与目录 | **远程工作台 → 文件传输** |
| 使用远端 skill | 当前远程会话的原生 `/` 技能菜单；支持项目和远端用户的 `.dsh/skills`、`.agents/skills` |

空会话的 SSH 入口位于输入框上方；官方侧边栏首页也提供 **远程工作台** 卡片。本地会话保持原来的文件与终端体验。

工作台包含 **快速打开｜文件传输｜端口转发｜终端状态**。方向键选择文件，Enter 预览，Escape 取消选择；窄面板使用分区菜单。传输按“选择 → 核对清单 → 开始”操作，切换分区不停止传输。

0.11.1 的目录路径输入在停顿 300 ms 后自动检查并导航；Enter / **前往** 仍可立即提交。失败时保留输入与原列表，不会误选旧目录。fish / tcsh 登录 shell 的 helper 安装与直连命令引号已修复；终端命令状态感知仍仅支持原有 Bash / Zsh hook。

远程 skill 支持 `<名称>/SKILL.md` 和平铺 Markdown，沿用 DSH frontmatter 与调用开关；同类别同名时远端优先，本机独有和内置 skill 保留。正文按需重新读取，目录缓存最多 60 秒；不复制到本机、不自动执行脚本。当前使用四个默认目录，不跟随符号链接，不读取远端自定义 `DSH_HOME`/`DSH_AGENTS_HOME`。发现限额与刷新说明见[排错指南](docs/TROUBLESHOOTING.md)。

文本编辑支持完整 UTF-8 文件，最大 **256 KiB**；传输单文件、单批上限 **1 TiB**，已用小样本实测并模拟容量边界，未做 TB 级性能测试。编辑草稿需在重启前保存；传输重启后需要重新授权源或目标目录。人工终端使用 SSH 账号权限。

DSH 的 Finder / 本机应用打开入口仍是本机操作；远端文件请使用面板预览和远程编辑。更多容量、权限与恢复边界见[技术参考](docs/TECHNICAL.md)。

## 更新、回退和卸载

- **更新**：到 [Releases](https://github.com/CrazyShout/dsh-ssh-remote/releases) 复制目标版本的安装包地址。按 rc.2 插件页面提示先卸载旧插件、再安装并启用新版；Web CLI 可在原 profile 再次运行上面的 `add` 命令替换版本。完成后重启。先保存编辑草稿，暂停传输；重启会结束仍存活的人工终端。
- **回退到 0.11.0**：安装上一正式版本的安装包，然后重启。已迁移的 OpenSSH 配置保留；需要撤销迁移时先在迁移向导中回滚。

```sh
dsh plugin --profile web add 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.11.0/dsh-ssh-remote-0.11.0.tgz'
```

0.11.0 已验证上述两版 DSH，但不含本轮 fish、目录输入和远程 skill 修复；回退不需要降级 DSH。更早的 v0.10.2 仍保留。

- **停用**：在插件页面关闭该组合包，保留安装文件和配置；按界面提示重启。
- **卸载**：在对应应用的插件页面卸载。Web 也可以停止服务后运行：

```sh
dsh plugin --profile web remove dsh-ssh-remote
```

卸载只移除该 profile 的插件，不删除远端项目、本地会话历史或 SSH 配置。之前的远程工作区需要插件才能继续访问；重新安装后可继续使用保存的映射。

## 获取帮助与参与开发

- 安装失败、依赖构建、SSH 认证、缺少远端工具：[排错指南](docs/TROUBLESHOOTING.md)。
- [提交 Issue](https://github.com/CrazyShout/dsh-ssh-remote/issues)：请带上插件/DSH 版本、Desktop 或 Web、安装来源及第一个实际错误；不要提交凭据。
- [技术参考与开发命令](docs/TECHNICAL.md)、[开发路线图](docs/ROADMAP.md)、[发布流程](docs/RELEASING.md)、[更新记录](CHANGELOG.md)。

MIT License.
