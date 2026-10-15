// One source for both Host and Client strict wire descriptors.
import * as z from 'zod/mini';
const id = z.string().check(z.regex(/^[a-zA-Z0-9-]{16,80}$/u));
const bytes = z.int().check(z.gte(0), z.lte(2 ** 40)), cursor = z.int().check(z.gte(0), z.lte(10000));
const path = z.string().check(z.maxLength(4096)), sha = z.string().check(z.regex(/^[0-9a-f]{64}$/u));
const optional = z.optional, limitedArray = (item, limit) => z.array(item).check(z.maxLength(limit));
const entry = z.object({ path, kind: z.enum(['file', 'directory', 'excluded']), size: optional(bytes), version: optional(z.string()), reason: optional(z.string()) });
const file = z.extend(entry, { index: cursor, id, state: z.enum(['queued', 'verifying', 'transferring', 'complete', 'paused', 'failed', 'unknown', 'skipped']),
  offset: bytes, sha256: optional(sha), error: optional(z.string()), replaceVersion: optional(z.nullable(z.string())) });
const job = z.object({ id, direction: z.enum(['upload', 'download']), rootUri: z.string(), alias: z.string(), target: path,
  sources: optional(limitedArray(path, 100)), destination: optional(id),
  state: z.enum(['preparing', 'ready', 'running', 'paused', 'complete', 'cancelled', 'cleanup-pending', 'expired']),
  count: cursor, appended: cursor, totalBytes: bytes, created: z.number(), updated: z.number(), error: optional(z.string()), live: z.boolean(), nonce: id });
const page = z.object({ job, entries: limitedArray(file, 200), next: cursor, done: z.boolean(), run: optional(id) });
const plan = z.object({ id, direction: z.enum(['upload', 'download']), target: path, sources: optional(limitedArray(path, 100)), count: optional(cursor), totalBytes: optional(bytes) });
const append = z.object({ id, after: cursor, entries: limitedArray(entry, 200) });
const control = z.object({ id, action: z.enum(['resume', 'pause', 'cancel', 'heartbeat', 'forget']), run: id, destination: optional(id) });
const request = z.object({ id, index: cursor, run: id, action: z.enum(['begin', 'verify', 'finish', 'skip', 'retry']), sha256: optional(sha), offset: optional(bytes), replace: optional(z.boolean()) });
const result = z.object({ file, state: optional(z.string()), verifyOffset: optional(bytes), prefix: optional(sha) });
const scope = { name: 'workspaceFileScope', wire: 'workspaceFileScopeId', source: 'lookup', lookup: 'workspaceFileScope',
  codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => z.string() } };
const parameter = (name, schema) => ({ name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol: `dsh-ssh-remote#transfer/${name}`, create: () => schema } });
const invocation = (method, parameters, schema, cancel = false) => ({
  id: `dsh-ssh-remote#sshRemoteTransfers/${method}`, service: 'sshRemoteTransfers', namespace: 'sshRemoteTransfers', method,
  invocation: { kind: 'direct' }, parameters: [scope, ...parameters], ...(cancel ? { cancellation: { parameter: 'signal' } } : {}),
  result: { mode: 'strict', typeSymbol: `dsh-ssh-remote#transfer/${method}Result`, create: () => schema },
  sourceLocation: { file: 'src/transfers.ts', line: 1, column: 1 },
});
export const transferInvocations = [invocation('list', [], limitedArray(job, 64), true), invocation('plan', [parameter('request', plan)], page),
  invocation('append', [parameter('request', append)], page), invocation('page', [parameter('id', id), parameter('cursor', cursor)], page, true),
  invocation('control', [parameter('request', control)], page), invocation('file', [parameter('request', request)], result)];
