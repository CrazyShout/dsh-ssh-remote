import type { CSSProperties } from 'react';
import type { RemoteResult, HelperHostStatus } from 'dsh-ssh-remote/ssh';
const MUTATION_DEADLINE_MS = 30_000;
export const READ_DEADLINE_MS = 30_000;
/** Wrap a throwing service call into the dialog's result envelope. */
export async function asResult<T>(run: () => Promise<T>): Promise<RemoteResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (reason) {
    return { ok: false, error: { message: messageOf(reason) } };
  }
}

/** Bound non-cancellable host RPCs so a wedged transport cannot lock the dialog forever. */
export function withMutationDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  return withDeadline(operation, `${label} 超过 ${MUTATION_DEADLINE_MS / 1000} 秒；结果未知，请刷新后核对。`, MUTATION_DEADLINE_MS);
}

export function withReadDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  return withDeadline(operation, `${label} 超过 ${READ_DEADLINE_MS / 1000} 秒，请重试。`, READ_DEADLINE_MS);
}

export function withDeadline<T>(operation: Promise<T>, message: string, milliseconds: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void): void => {
      if (settled) return;
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
    operation.then(
      value => finish(() => resolve(value)),
      reason => finish(() => reject(reason)),
    );
  });
}

export function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export const subtleText: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 };
export const dimmedText: CSSProperties = { color: 'var(--dsw-alias-label-dimmed)', fontSize: 11 };

export function helperStateLabel(state: HelperHostStatus['status']): string {
  return ({
    disconnected: '未连接',
    installing: '正在安装',
    connecting: '正在连接',
    connected: '已连接',
    degraded: '已连接（能力受限）',
    reconnecting: '正在重连',
    error: '错误',
  } as const)[state];
}

export function helperCapabilitySummary(capabilities: Record<string, unknown>): string {
  const names = Object.entries(capabilities)
    .filter(([, value]) => value !== false && value !== null)
    .map(([name]) => name);
  return names.length === 0 ? '等待握手' : names.join(' · ');
}

export function searchSummary(helper: HelperHostStatus): string {
  const search = helper.environment?.search;
  if (search === undefined) return '远程搜索：未检查（连接或重试后检查 rg）';
  return search.available
    ? `远程搜索：可用${search.version ? ` · ${search.version}` : ''}`
    : `远程搜索：不可用；请在远端安装 ripgrep，确保 rg 在登录环境 PATH 中，然后重试连接。${search.error ? ` ${search.error}` : ''}`;
}
