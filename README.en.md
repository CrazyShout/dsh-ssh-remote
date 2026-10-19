# dsh-ssh-remote

English | [中文](README.md) · [Download 0.11.1](https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v0.11.1) · [Changelog](CHANGELOG.md)

SSH development workspaces for DeepSeek Harness: browse and edit remote files, reference code, open terminals, forward ports, and transfer files. Uses your existing OpenSSH configuration and DSH's native file and terminal panels.

![Remote workbench: quick open, transfers, ports and terminal status](docs/images/remote-tools.png)

## Requirements

Compatibility targets: **DSH 0.2.0-rc.2 / 0.2.1-rc.2**; Desktop uses its bundled runtime. See the [0.11.0 acceptance record](docs/releases/0.11.0-acceptance.md) for the tested scope. Windows hosts are not validated; forwarding currently requires a macOS / Linux host.

| Purpose | Requirement |
| --- | --- |
| Desktop | Official DSH Desktop, which includes its own Node and package manager. |
| CLI / Web | DSH 0.2.0-rc.2 or 0.2.1-rc.2, Node 22+, and `dsh` / `pnpm` on PATH. |
| Basic SSH connection | Local OpenSSH, a concrete Host alias, non-interactive authentication, and Python 3.8+ on the remote. |
| File search and `@` completion | Remote `rg` (ripgrep); Git discovery also needs remote Git. |
| Restricted model commands | Remote Linux and working bubblewrap. Basic browsing and human terminals do not require it. |

Install DSH first using the [official instructions](https://github.com/deepseek-ai/deepseek-harness). Check each plugin Release for verified compatibility with other DSH versions.

## Install

### Desktop / Web: use the official plugin page

1. Open **Plugins / 插件** in the left sidebar and choose **Add plugin / 添加插件**.
2. Paste this complete address and click **Install / 安装**:

```text
https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.11.1/dsh-ssh-remote-0.11.1.tgz
```

3. Version 0.11.0 removes `ssh2` / `cpu-features` and their native build prompts. Review any other dependency prompts in the official installer; do not globally allow unknown build scripts.
4. Click **Enable now / 立即启用** after installation (listed as `dsh-ssh-remote`), then fully restart that Desktop instance or Web server.

![Pasting a pinned release address into the official plugin installer](docs/images/install.png)

The package includes built runtime files: no clone or compilation is needed. Installation still downloads runtime dependencies. **The npm package named `dsh-ssh-remote` belongs to another project: use the complete address above.** Desktop and Web use separate profiles and need separate installation.

### CLI: install into the Web profile

```sh
dsh --version
pnpm --version
dsh plugin --profile web add 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.11.1/dsh-ssh-remote-0.11.1.tgz'
```

Restart your existing `dsh web` server after installation. Stop it with Ctrl-C in its terminal before starting `dsh web` again. After a blocked-build retry, also check that the bundle is enabled in Plugins. For Desktop, use the application's plugin page.

The fixed Git tag is an alternative source and requires local Git:

```sh
dsh plugin --profile web add 'github:CrazyShout/dsh-ssh-remote#v0.11.1'
```

You can also download the release `.tgz` and install its **absolute local path** through the same UI or CLI. Use the release's `SHA256SUMS` to verify the downloaded package.

## First connection: five steps

1. Reuse an existing concrete alias in your local `~/.ssh/config`, or add a minimal one:

   ```sshconfig
   Host devbox
     HostName your-server.example.com
     User your-user
   ```

2. Run `ssh devbox`, verify the host fingerprint on first connection, and confirm login works. Type `exit` to return. See [connection troubleshooting](docs/TROUBLESHOOTING.md) for encrypted keys, passwords and MFA.
3. In DSH choose **Add workspace / 添加工作区 → devbox**, browse or enter a remote path, then open the folder.
4. The first connection deploys the matching Python helper automatically. **Settings → Built-in plugins → SSH Remote** also provides connect, retry and diagnostics.
5. Open **Workspace files / 工作区文件** to preview a file, then **New terminal / 新建终端** and run `pwd`. Verify the remote directory. No model message is needed.

Keep custom `Port`, `IdentityFile` and `ProxyJump` settings in OpenSSH; do not duplicate them in the plugin. Background connections use `BatchMode=yes`: ensure `ssh -o BatchMode=yes devbox true` succeeds after preparing your SSH agent or login session.

## Upgrade legacy hosts

0.11.0 uses system OpenSSH + the Python helper only. The SFTP backend and both SSH2 terminal exports were removed. Existing OpenSSH aliases need no migration. For old plugin host settings, open **Settings → SSH Remote → 迁移旧 SSH 配置**, review the diff, then explicitly confirm backup, write and connection verification. Nothing edits SSH configuration at startup; private-key contents are never imported. Unmigrated workspaces never fall back to local files. See the bilingual [migration guide](docs/MIGRATION-0.11.md).

## Everyday use

| Task | Entry point |
| --- | --- |
| Browse and preview files | Native **Workspace files / 工作区文件** |
| Edit and save text | Preview-tab menu **编辑远程文本**, or **编辑** after selecting a quick-open result |
| Find a file | **SSH · host → 快速打开**, or native `@` completion |
| Run commands | Native **New terminal / 新建终端** |
| See cwd, exit status and terminal context | Terminal-tab menu **查看 SSH 终端状态** |
| Open TensorBoard, Jupyter or a development website | **远程工作台 → 端口转发** |
| Upload/download files and folders | **远程工作台 → 文件传输** |
| Use remote skills | Native `/` menu in a remote Session; project and remote-user `.dsh/skills` / `.agents/skills` |

Blank Sessions show the SSH badge above the composer. The native sidebar start page also offers **远程工作台**. Local Sessions retain their normal file and terminal behavior.

In 0.11.1, the directory path field navigates after a 300 ms pause, while Enter / **前往** submits immediately. Invalid paths retain the draft and previous listing. Helper installation and direct commands now preserve quoting through fish/tcsh login shells; per-command terminal observation still uses the existing Bash/Zsh hooks.

Remote skills support `<name>/SKILL.md` and flat Markdown with DSH frontmatter and invocation controls. Remote sources win same-category duplicates; local-only and bundled skills remain available. Bodies are read fresh, catalogs expire within 60 seconds, and no skill is copied locally or executed automatically. The four default roots are supported, without symlink following or remote custom `DSH_HOME`/`DSH_AGENTS_HOME` discovery. See [troubleshooting](docs/TROUBLESHOOTING.md) for limits and refresh behavior.

The workbench combines **quick open, transfers, ports, and terminal status**. Arrow keys select files, Enter previews, and Escape clears selection. Narrow panes use a section menu. Transfers follow select → review → start and keep running when switching sections.

The text editor supports complete UTF-8 files up to **256 KiB**. Transfers support **1 TiB per file/batch**: small real samples and simulated boundaries were tested, not TB-scale performance. Save editor drafts before restarting; transfers require source/destination reauthorization after restart. Human terminals run with the SSH account's permissions.

DSH's Finder/local-application actions still refer to the local machine. Use the native preview and remote editor for SSH files. See [technical reference](docs/TECHNICAL.md) for limits, permissions and recovery guarantees.

## Update, roll back and remove

- **Update:** copy the desired package address from [Releases](https://github.com/CrazyShout/dsh-ssh-remote/releases). Follow the rc.2 plugin page's advice to remove the old plugin, then install and enable the new version. Web CLI users can repeat the `add` command above in the same profile to replace the version. Restart afterwards. Save drafts and pause transfers first; a restart ends live human terminals.
- **Roll back to 0.11.0:** install the previous public archive and restart. Migrated OpenSSH settings remain; use the migration wizard to undo them first if needed.

```sh
dsh plugin --profile web add 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.11.0/dsh-ssh-remote-0.11.0.tgz'
```

0.11.0 was validated with both DSH baselines but lacks these fish, directory-input and remote-skill fixes. Rolling back the plugin does not require downgrading DSH. v0.10.2 remains available separately.

- **Disable:** switch off the bundle in the plugin page, retaining its files and settings; restart if requested by DSH.
- **Remove:** use the corresponding application's plugin page. For Web, stop the server and run:

```sh
dsh plugin --profile web remove dsh-ssh-remote
```

Removal affects only that profile's plugin; it does not delete remote projects, local conversation history or SSH configuration. Existing remote workspaces need the plugin to work; reinstalling can reuse their saved mappings.

## Help and development

- [Troubleshooting](docs/TROUBLESHOOTING.md): install errors, dependency builds, authentication and missing remote tools.
- [Report an issue](https://github.com/CrazyShout/dsh-ssh-remote/issues) with plugin/DSH versions, Desktop or Web, installation source and the first actual error. Omit credentials.
- [Technical reference and development](docs/TECHNICAL.md), [roadmap](docs/ROADMAP.md), [release procedure](docs/RELEASING.md), [changelog](CHANGELOG.md).

MIT License.
