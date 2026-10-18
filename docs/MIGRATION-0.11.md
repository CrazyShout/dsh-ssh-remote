# 0.11：迁移旧主机 / Migrating legacy hosts

## 中文

**已有 OpenSSH Host 别名无需迁移。** 只有仍把主机写在插件旧 `hosts` 设置里的用户需要此步骤。0.11.0 删除 SSH2/SFTP 后端以及 `LegacySsh2RemoteTerminalBackend`、`Ssh2RemoteTerminalBackend` 导出，这是破坏性变更。未迁移的工作区会提示配置要求，不会尝试本机同名目录或旧后端。

1. 保存编辑草稿并暂停传输。在 **设置 → 内置插件 → SSH Remote → 迁移旧 SSH 配置** 点击 **检查旧配置**。
2. 核对别名、目标、端口和文件差异。别名重名或含不支持字符时，输入新别名后重新检查；已有主机不会被覆盖。
3. 点击 **确认、备份并迁移**。插件将旧目标写入独立 `~/.ssh/dsh-ssh-remote.conf`，在主配置的全局开头加入 `Include`，不重写原来的 Host/Match 块。OpenSSH 的首值优先规则仍由 `ssh -G` 验证。
4. 连接验证成功的主机才会恢复工作区映射。原 anchor 目录和 DSH 会话 ID 保留。验证失败时保留配置和具体错误，工作区不重映射；可以回滚、排除连接错误后重新迁移。
5. 需要撤销时点击 **回滚本次迁移**。重启后可在 **恢复或回滚已有迁移** 输入记录 ID。记录及原配置备份位于 `$DSH_HOME/ssh-migrations/<ID>.json`（目录 700、文件 600）。如果操作中断，先核对该记录；若配置存在后续人工修改，自动回滚会拒绝覆盖，应手动比对备份。

仅复制密钥**路径**，不读取私钥内容、不修改 known_hosts、不降低主机指纹校验。迁移接口只用于已认证的管理界面，不提供给模型，也不在启动或升级时自动调用。多个外部程序不遵守协调锁的同时编辑，仍存在最后检查与原子替换之间的 POSIX 竞争窗口。

向导写入要求主配置和已有片段是有界的普通文件；符号链接配置会明确拒绝，不会覆盖链接。此类 dotfiles 配置请先在其管理工具中手动添加别名和 Include。

卸载插件保留迁移后的 OpenSSH 配置；不要因为卸载就删除其他应用正在使用的 SSH 主机。回退插件可安装 [v0.10.2](https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v0.10.2)，不需要撤销已经可用的 OpenSSH 别名。

## English

**Existing OpenSSH aliases need no migration.** Only the old plugin `hosts` settings require it. Version 0.11.0 removes SSH2/SFTP and the two terminal backend exports named above. Unmigrated workspaces fail with guidance rather than falling back to local files.

In **Settings → Built-in plugins → SSH Remote**, choose **检查旧配置** (preview). Resolve alias conflicts and review the exact before/after configurations. **确认、备份并迁移** explicitly authorizes a backup, the dedicated `~/.ssh/dsh-ssh-remote.conf`, and a global leading `Include`. Existing Host/Match blocks remain intact. `ssh -G` checks effective target resolution; only successfully connected aliases remap workspaces. Anchor paths and Session IDs remain unchanged.

Use **回滚本次迁移** to undo, or enter a recorded migration ID in **恢复或回滚已有迁移** after restart. Private versioned journals at `$DSH_HOME/ssh-migrations/<ID>.json` also allow recovery from interrupted writes. Rollback checks both files and refuses later external edits. The original config is in the journal; compare it manually if automatic recovery is refused. As with other POSIX guarded writes, uncoordinated external writers can still race the final check/rename window.

The migration copies key paths only, never private-key contents. It does not relax host-key checks, modify known_hosts, run at startup, or expose a model tool. Uninstalling the plugin does not remove migrated OpenSSH configuration. The previous public archive, v0.10.2, remains the rollback point; working OpenSSH aliases can be retained.
