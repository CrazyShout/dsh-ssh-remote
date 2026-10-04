import { DshRpcProtocolError } from './protocol.js';
import { RemoteHelperRpcError } from './rpc-client.js';
import { redactHelperDiagnostic } from './installer.js';
/** Unknown failures are deliberately manual-retry, never an install loop. */
export function classifyConnectionError(error, stderr = '', established = false) {
    const message = redactHelperDiagnostic(`${error instanceof Error ? error.message : String(error)}\n${stderr}`);
    const result = (errorCode, retryable, hint) => ({ errorCode, retryable, hint });
    if (/host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|no .*host key.*known/iu.test(message)) {
        return result('SSH_HOST_KEY', false, '请在本机终端核对主机指纹；插件不会修改 known_hosts。');
    }
    if (/permission denied.*(?:publickey|password|keyboard-interactive)|authentication failed|too many authentication failures|sign_and_send_pubkey|incorrect passphrase|agent refused/iu.test(message)) {
        return result('SSH_AUTH', false, '请先在终端验证 SSH alias，并将密钥解锁到 ssh-agent；后台连接无法输入密码或 MFA。');
    }
    if (/python3?:.*(?:not found|No such file)|python.*(?:3\.8|version.*unsupported|version.*required)/iu.test(message)) {
        return result('PYTHON_REQUIRED', false, '远端需要 PATH 中可用的 Python 3.8 或更新版本。');
    }
    if (error instanceof DshRpcProtocolError || /unsupported.*protocol|protocol.*(?:incompatible|unsupported)|helper sha256 mismatch/iu.test(message)) {
        return result('HELPER_PROTOCOL', false, '请检查插件与 helper 版本或安装完整性，再手动重试。');
    }
    if (/no longer present|invalid.*alias|Bad configuration option|Bad port|Could not resolve hostname|Name or service not known|nodename nor servname|bad permissions|Permission denied|Read-only file system|No space left/iu.test(message)) {
        return result('SSH_CONFIG', false, '请检查本机 SSH 配置、主机名以及远端用户目录权限或磁盘空间。');
    }
    if (error instanceof RemoteHelperRpcError) {
        return result(error.code, error.retryable, error.retryable
            ? '远端暂时不可用，将自动退避重试；也可以停止连接。' : '远端拒绝本次连接，请查看错误原因后手动重试。');
    }
    if (/timed? ?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|Connection (?:reset|refused|closed)|Network is unreachable|No route to host|Broken pipe/iu.test(message)
        || (established && /transport.*(?:exited|closed)|stdout (?:ended|closed)|health check failed/iu.test(message))) {
        return result('SSH_NETWORK', true, '连接暂时中断，将自动退避重试；也可以停止连接。');
    }
    return result('SSH_UNKNOWN', false, '无法确认这是临时故障，已停止自动重试；请查看诊断后手动重试。');
}
//# sourceMappingURL=connection-error.js.map