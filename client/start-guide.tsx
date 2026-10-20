import { t } from './locale.js';
import { useState } from 'react';
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { mutedStyle } from './presentation.js';
/** Contextual help in the official plugin page/settings, never a launch modal. */
export function GettingStarted({ expanded = false }: {
    expanded?: boolean;
}) {
    const [notice, setNotice] = useState('');
    const command = 'ssh -o BatchMode=yes devbox true';
    return <details open={expanded} style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.6 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('开始使用')}</summary>
    <ol style={{ margin: '12px 0', paddingLeft: 20, display: 'grid', gap: 12 }}>
      <li><strong>{t('先确认 SSH 可用')}</strong><p style={{ ...mutedStyle, margin: '4px 0' }}>{t('在 DSH 所在机器配置 SSH Host 别名，远端需要 Python 3.8+。将命令中的 devbox 换成你的别名。')}</p>
        <code style={{ overflowWrap: 'anywhere' }}>{command}</code>{' '}
        <Button size="sm" variant="ghost" onClick={() => void writeClipboard(command).then(ok => setNotice(ok ? t('已复制检查命令。') : t('剪贴板不可用，请手动复制命令。')))}>{t('复制命令')}</Button>
      </li>
      <li><strong>{t('添加远程工作区')}</strong><p style={{ ...mutedStyle, margin: '4px 0' }}>{t('从官方“添加工作区”入口选择 SSH 主机，再选择远端文件夹。Desktop 与 Web 的插件配置分别管理。')}</p>
      </li>
      <li><strong>{t('开始开发')}</strong><p style={{ ...mutedStyle, margin: '4px 0' }}>{t('使用官方“工作区文件”和“新建终端”；SSH 标识打开快速查找、传输、转发及终端状态。')}</p>
      </li>
    </ol>
    <p style={mutedStyle}>{t('首次安装后如未出现入口，请保存工作并重启当前 DSH。搜索需要远端 ripgrep；它不是建立连接的前提。')}</p>
    <a href="https://github.com/CrazyShout/dsh-ssh-remote/blob/main/docs/TROUBLESHOOTING.md" target="_blank" rel="noreferrer">{t('安装与连接排错')}</a>
    {notice && <p role="status">{notice}</p>}
  </details>;
}
