# 安装与连接排错 / Troubleshooting

[中文快速开始](../README.md) · [English quick start](../README.en.md)

## 远程 run_code 与控制连接 / Remote PTC and control transport

0.13.1 修复旧版将本机 Node、bootstrap 和 sandbox runner 路径发送到远端、并丢失独立控制通道的问题（#35）。保持官方 PTC provider，无需改成其他执行器。远端仍需要可用的 Node：

```sh
ssh devbox 'sh -lc "command -v node; node --version"'
```

若报 `E_NODE_RUNTIME_UNSUPPORTED`，登录 PATH 选中的 Node 没有 `stripTypeScriptTypes`（例如系统 Node 12 与 NVM Node 24 并存）。请让远端登录环境选择受支持 Node，或在远程专用 profile 中显式配置官方 PTC launch；不要把本机绝对路径当作远端路径。插件不会自动安装 Node 或修改 PATH。`E_SANDBOX_UNAVAILABLE` 需修复远端 bubblewrap，不应通过自动提升权限绕过。

升级会产生新的 helper 内容哈希。保存工作后重载并重连；旧 daemon 不会被强制结束，也不会原地获得认证修复（#36）。认证错误应检查当前包/连接是否匹配，不删除凭据、关闭校验或清空所有 helper 目录来“修复”。

English: use the official PTC provider with remote Node supporting TypeScript
stripping. A bundled Desktop Node is not a remote runtime. A stale login PATH can
select an older system Node despite a newer NVM installation. Correct that
environment or use an explicit official launch configuration in a remote-only
profile. No automatic installation, local execution or full-access fallback is
performed. Reload/reconnect after upgrading; existing old daemons are not patched
in place. Authentication errors must not be worked around by disabling checks or
deleting control credentials. The security boundary excludes unrestricted
programs already running as the same Unix account.

## 0.11.1：fish、目录路径与远程技能

- fish/tcsh 主机在 helper 安装时报引号语法错误：升级到 0.11.1 后重试，无需更改登录 shell。仍需要远端 PATH 中的 Python 3.8+。fish 的命令状态 hook 不在本次范围，原生终端仍可使用。
- 路径输入停顿 300 ms 后自动导航，Enter / 前往可立即提交。输入法组词时不导航；失败保留原列表，修改或刷新后重试。尚未确认的输入不能用“打开此文件夹”误提交旧目录。
- 远程会话原生 `/` 菜单现在发现远端项目 `.dsh/skills`、`.agents/skills`（最近 Git 根目录；无 Git 时为当前工作区），以及远端用户 `~/.dsh/skills`、`~/.agents/skills`。`~/.dsh/skills/.system` 排除。支持目录包 `name/SKILL.md` 与平铺 `.md`，必须包含有效的 YAML `name` 和 `description`。
- 保留 DSH 的 `disable-model-invocation` / `user-invocable` 开关。远端同类别同名技能优先；未被覆盖的本机与内置技能保留。原始内容不复制到本机；路径和相对资源指向该远程会话，不自动运行 skill 脚本。
- 正文按需重新读取，目录缓存最多 60 秒；通过插件保存/上传后会失效。外部编辑后等缓存过期再打开菜单。没有远程文件 watcher 或 SSH 轮询。
- 单个技能最多 256 KiB；一次发现最多 1000 个候选文件、8 MiB 内容，最多四路读取。权限不足、超限会记录 `remote skills` 诊断并返回“不完整”，不会声称目录确实为空。单个格式错误文件被忽略，其他技能继续发现。
- 目前不跟随符号链接，不自动发现自定义远端 `DSH_HOME` / `DSH_AGENTS_HOME` 或其他技能目录。Windows 路径/注册表回归不等于完整 Windows Desktop/SSH 验收。

English: 0.11.1 fixes fish/tcsh script transport and debounces directory navigation. Remote skills use DSH's public provider, the four default project/user roots, native invocation flags and remote resource paths. Catalogs expire within 60 seconds without SSH polling; limits are 256 KiB per skill and 1000 files / 8 MiB per scan, with at most four reads. Permission/budget failures are incomplete observations. Symlinks and custom remote home overrides are not followed; full Windows Desktop acceptance remains outside the targeted Windows regression.

## 先确定问题发生在哪一步

| 现象 | 下一步 |
| --- | --- |
| 下载失败、GitHub 不通 | 从 Release 下载 .tgz 后用其绝对路径安装；仍需联网获取运行依赖。 |
| 安装器要求依赖构建确认 | 先检查显示的包名。官方界面支持确认并重试；不想构建可选原生模块时按下方精确禁用。 |
| 安装成功但没有 SSH 入口 | 确认安装在正在使用的 Web/Desktop profile、已启用，并完整重启对应 DSH。 |
| 主机未出现在添加工作区中 | 在本机 OpenSSH 配置中添加具体 Host alias；只有通配符的 Host 不是可选择的主机。 |
| Permission denied、密码或 MFA 提示 | 先在终端完成 SSH 身份认证；后台连接使用 BatchMode=yes，不能回答交互提示。 |
| 主机指纹不匹配 | 在终端核对远端主机身份，按自己的 SSH 策略处理；不要关闭主机校验。 |
| 缺少 Python | 在远端安装 Python 3.8+，让 SSH 登录环境能找到它，然后重试连接。 |
| 文件能预览，但搜索不可用 | 远端安装 rg；Git 工作区索引还需要 Git。在相同登录环境检查 PATH。 |
| 受限模式无法运行命令 | 需要 Linux 与可用的 bubblewrap；这不影响基础文件浏览和人工终端。 |
| 历史加载提示 v0 或 unknown message source | 属于 DSH 历史格式兼容问题，重新安装 SSH 插件不会迁移历史。 |

高级 SSH 选项仍放在本机配置中，例如 Port、IdentityFile、ProxyJump；不用在插件里重复填一遍。
可先用 `ssh -o BatchMode=yes devbox true` 检查后台认证是否可用。

## 旧 DSH 与安装失败排查

仍需保留 DSH `0.1.x` 时，先保留原有可用组合。插件 `0.3.1` 是旧版候选，其声明范围为
`>=0.1.1-rc.2 <0.2.0`；这不等于每个 `0.1.x` 版本都已实测。需要试用时应先备份 profile，
并固定提交，不要安装当前主分支：

```sh
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote#1432649a3227b78bc1309100333ec4887bb571e2'
```

安装失败时，从 DSH 输出的 **diagnostics 路径**查看 `pnpm.log` 中的首个实际错误：

- `installation rejected` / `incompatible with dsh`：先解决 DSH 与插件版本不匹配；
  放行构建脚本不能解决 API 不兼容。
- `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 或 `ERR_PNPM_IGNORED_BUILDS`：核对日志明确
  指出的包名和版本，可能是其他依赖。仅在审查那个包的脚本后决定是否精确授权，不要全局放行。
- Git、网络、registry 或权限错误：按对应错误处理；它们不是构建脚本问题。

若实际错误是 `Ignored build scripts: cpu-features@0.0.10, ssh2@1.17.0`，可以在该
profile 的 `pnpm-workspace.yaml` 中**合并**以下设置，然后重试原安装命令（安装包和 Git 均适用）：

```yaml
allowBuilds:
  'cpu-features@0.0.10': false
  'ssh2@1.17.0': false
```

保留原文件的其他字段和其他包的决策，不要重复创建 `allowBuilds` 键或覆盖整个文件。
若 pnpm 自动写入了 `cpu-features: set this to true or false` 和 `ssh2: set this to true or false`，
用上面的两个精确版本条目替换这两条待决项。
默认 Web 路径是 `~/.dsh/profiles/web/pnpm-workspace.yaml`，设置了 `DSH_HOME` 时以
实际 diagnostics 所属 profile 为准。这里的 `false` 是**明确禁用**，不是授权：这两个
版本的脚本只构建可选原生能力，`ssh2` 可以使用 JavaScript/Node crypto 实现，默认
system OpenSSH helper 路径不依赖这些原生模块。此策略已在 pnpm `11.21.0` 与 DSH
`0.2.0-rc.2` 的隔离 profile 验证；不同依赖版本应重新检查，不要照搬版本号。
不建议为此全局关闭脚本检查，也不要把同一 profile 中其他插件所需的构建全部跳过。

**CLI 重试成功但没有入口？** DSH `0.2.0-rc.2` 的 CLI 会保留首次构建被拦截时已下载的依赖，
再次安装可能不自动启用它。打开 DSH 的 **插件** 页面，启用 **dsh-ssh-remote** 组合包，然后重启。
不要通过反复重装或改 SSH 配置来解决这个启用状态问题。

DSH `0.1.7-rc.2` 和 `0.2.0-rc.2` 会在 Git 安装失败后附带通用的
“git-hosted plugins … prepare … allowBuilds” 提示。**仅有这句话不能确定失败原因**，
也不意味着本插件有 `prepare` 脚本。提交 Issue 时，请附上原始安装命令、各组件版本及
首个错误附近的日志；分享前删除 token、凭据和不希望公开的路径。


## English

0.11.0 no longer depends on ssh2/cpu-features. The exact optional-build workaround below applies only when rolling back to 0.10.2. Do not attribute other plugins’ build prompts to this version. Legacy hosts require the [explicit migration](MIGRATION-0.11.md).

Start with the first error, not the last generic hint. Check the running DSH profile and restart after installation. Desktop carries its own runtime; a separate CLI installation does not update it.

- Download: if GitHub is unreachable, download the release .tgz elsewhere and install its absolute local path. Runtime dependencies still require network access.
- Connection: use a concrete OpenSSH Host alias and prepare non-interactive authentication with `ssh -o BatchMode=yes devbox true`.
- Missing Python: install Python 3.8+ on the remote host and verify its login PATH.
- Search: install remote rg, and Git for Git workspace discovery. These are not required to establish the base connection.
- Restricted processes: require Linux and a usable bubblewrap runner. Human terminals retain the SSH account's permissions.
- Old v0 history errors belong to DSH history conversion, not plugin installation.

## 更新检查与远端 Node / Updates and remote Node

- 更新检查在运行 DSH 的 **Host** 发起，不在浏览器或 SSH 远端发起。展开插件详情中的“更新排错建议”，区分版本元数据、校验清单，以及 `ECONNRESET` / `ENOTFOUND` / 超时 / HTTP 限流；不要通过关闭 TLS 校验解决。
- 自动检查开启时，失败后在页面可见时约五分钟复查，成功后回到六小时间隔；关闭自动检查或隐藏页面不会继续轮询。手动“检查更新”跳过缓存。源码链接只检查，不被安装包覆盖。
- `run_code` 需要远端登录环境中的 Node，Desktop 自带 Node 不能代替。先比较 `ssh devbox 'node --version'` 与 `ssh devbox 'bash -lc "node --version"'`。若 NVM 位于 `.bashrc` 的非交互提前返回之后，DSH 可能仍选中旧系统 Node。由用户选择已安装的新版本，并让其 bin 目录在对应 shell 的非交互 PATH 中可见；插件不自动改 shell 配置。
- Update checks run on the DSH host, not in the browser or on the SSH server. Check the sanitized failure stage/code in plugin details and the host's proxy environment. TLS verification stays enabled. Failed visible automatic checks recover after five minutes; successful checks return to six hours.
- Remote PTC needs Node on the remote login PATH. An NVM setup placed after Bash's noninteractive return may leave that PATH on an old system Node. Select a suitable installed runtime explicitly and check both SSH command and login-shell versions; this is not a reason to reinstall the plugin.

## Older DSH versions and installation failures

If you must keep DSH `0.1.x`, preserve your existing working combination first.
Plugin `0.3.1` is a legacy candidate with declared support for
`>=0.1.1-rc.2 <0.2.0`, not a claim that every `0.1.x` release has been tested.
Back up the profile before trying it and pin the commit instead of installing
the current main branch:

```sh
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote#1432649a3227b78bc1309100333ec4887bb571e2'
```

On failure, open `pnpm.log` at the **diagnostics path printed by DSH** and find
the first actual error:

- `installation rejected` / `incompatible with dsh`: resolve the DSH/plugin
  version mismatch first. Approving build scripts cannot fix API incompatibility.
- `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` or `ERR_PNPM_IGNORED_BUILDS`: check the
  exact package and version named in the log; it may be another dependency.
  Review that package's scripts before granting an exact approval, never a
  blanket approval.
- Git, network, registry, or permission errors: address that error rather than
  changing build permissions.

If the actual error is `Ignored build scripts: cpu-features@0.0.10, ssh2@1.17.0`,
**merge** these settings into that profile's `pnpm-workspace.yaml`, then retry
the original install command (tarballs and Git sources both apply):

```yaml
allowBuilds:
  'cpu-features@0.0.10': false
  'ssh2@1.17.0': false
```

Keep unrelated fields and other packages' decisions; do not duplicate the
`allowBuilds` key or replace the whole file. The default Web path is
`~/.dsh/profiles/web/pnpm-workspace.yaml`; with a custom `DSH_HOME`, use the
profile containing the reported diagnostics instead. `false` **denies** these
builds, not approves them. These versions only build optional native features;
`ssh2` can use its JavaScript/Node crypto implementation, and the default system
OpenSSH helper does not depend on these native modules. This policy was tested
in an isolated pnpm `11.21.0` / DSH `0.2.0-rc.2` profile. Reassess other
dependency versions instead of copying version numbers blindly. Do not disable
script checks globally or skip all builds needed by other plugins in the same
profile.

If pnpm wrote `cpu-features: set this to true or false` and `ssh2: set this to true or false`,
replace those two undecided entries with the exact-version entries above.
After a blocked-build CLI retry, DSH `0.2.0-rc.2` may leave the already-downloaded bundle disabled.
Enable **dsh-ssh-remote** on the official **Plugins** page and restart; do not change SSH settings to fix this.

DSH `0.1.7-rc.2` and `0.2.0-rc.2` append a generic “git-hosted plugins …
prepare … allowBuilds” hint after failed Git installs. **That hint alone does
not identify the cause** or prove this plugin has a `prepare` script. When
filing an issue, include the original command, component versions, and the log
around the first error. Redact tokens, credentials, and private paths before
sharing it.
