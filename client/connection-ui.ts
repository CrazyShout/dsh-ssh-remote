import { t } from './locale.js';
import type { CSSProperties } from 'react';
import type { RemoteResult, HelperHostStatus } from 'dsh-ssh-remote/ssh';
const MUTATION_DEADLINE_MS = 30000;
export const READ_DEADLINE_MS = 30000;
/** Wrap a throwing service call into the dialog's result envelope. */
export async function asResult<T>(run: () => Promise<T>): Promise<RemoteResult<T>> {
    try {
        return { ok: true, value: await run() };
    }
    catch (reason) {
        return { ok: false, error: { message: messageOf(reason) } };
    }
}
/** Bound non-cancellable host RPCs so a wedged transport cannot lock the dialog forever. */
export function withMutationDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
    return withDeadline(operation, t('{value1} 超过 {value2} 秒；结果未知，请刷新后核对。', { value1: label, value2: MUTATION_DEADLINE_MS / 1000 }), MUTATION_DEADLINE_MS);
}
export function withReadDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
    return withDeadline(operation, t('{value1} 超过 {value2} 秒，请重试。', { value1: label, value2: READ_DEADLINE_MS / 1000 }), READ_DEADLINE_MS);
}
export function withDeadline<T>(operation: Promise<T>, message: string, milliseconds: number, onTimeout?: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (run: () => void): void => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            run();
        };
        const timer = setTimeout(() => {
            finish(() => {
                onTimeout?.();
                reject(new Error(message));
            });
        }, milliseconds);
        operation.then(value => finish(() => resolve(value)), reason => finish(() => reject(reason)));
    });
}
export function messageOf(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}
export const subtleText: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 };
export const dimmedText: CSSProperties = { color: 'var(--dsw-alias-label-dimmed)', fontSize: 11 };
export function helperStateLabel(state: HelperHostStatus['status']): string {
    return ({
        disconnected: t('未连接'),
        installing: t('正在安装'),
        connecting: t('正在连接'),
        connected: t('已连接'),
        degraded: t('已连接（能力受限）'),
        reconnecting: t('正在重连'),
        error: t('错误'),
    } as const)[state];
}
export function helperCapabilitySummary(capabilities: Record<string, unknown>): string {
    const names = Object.entries(capabilities)
        .filter(([, value]) => value !== false && value !== null)
        .map(([name]) => name);
    return names.length === 0 ? t('等待握手') : names.join(' · ');
}
export function searchSummary(helper: HelperHostStatus): string {
    const search = helper.environment?.search;
    if (search === undefined)
        return t('远程搜索：未检查（连接后检查 rg）');
    return search.available
        ? t('远程搜索：可用{value1}', { value1: search.version ? ` · ${search.version}` : '' }) : t('远程搜索：不可用；请在远端安装 ripgrep，确保 rg 在登录环境 PATH 中，然后点击诊断重新检查。{value1}', { value1: search.error ? ` ${search.error}` : '' });
}
