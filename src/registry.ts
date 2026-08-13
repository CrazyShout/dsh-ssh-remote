import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SshConnectionManager, type SshHostConfig } from './connection.js';
import { expandHome } from './ssh-config.js';
import type { RemoteWorkspace, SshConnectionStatus } from './types.js';
import { formatSshUri, parseSshUri } from './types.js';

const SETTINGS_NS = settingsNamespace('ssh-remote');

/** `ssh-remote` settings schema: named hosts with optional ProxyJump. */
const SshRemoteSettingsSchema = z.object({
  hosts: z
    .array(
      z.object({
        name: z.string(),
        host: z.string(),
        port: z.number().min(1).max(65535).default(22),
        user: z.string().default(''),
        identityFile: z.string().default(''),
        proxyJump: z.string().default(''),
      }),
    )
    .default([]),
});

export interface SshHostEntry {
  name: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
}

type StatusListener = (change: { workspaceId: string; status: SshConnectionStatus; reason?: string }) => void;

interface SettingsLike {
  register(ns: unknown, schema: unknown): void;
  get(ns: unknown): { hosts: SshHostEntry[] } | undefined;
  update(ns: unknown, patch: unknown): Promise<void>;
}

function persistPath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-remote-workspaces.json');
}

/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes workspace + host-config operations to
 * both the model tool and (through `@Remote` methods) the Web client.
 */
export class SshRemoteService extends TypertRemoteService {
  readonly connections: SshConnectionManager;
  private readonly workspaces = new Map<string, RemoteWorkspace>();
  private readonly listeners = new Set<StatusListener>();
  private readonly hostResolver?: (host: string) => SshHostConfig | undefined;

  constructor(ctx: Context) {
    super(ctx, 'sshRemote');
    this.hostResolver = this.registerSettings();
    this.connections = new SshConnectionManager(this.hostResolver);
    this.load();
    this.connections.onStatus((key, status, reason) => {
      for (const ws of this.workspaces.values()) {
        if (this.keyOf(ws.uri) === key) {
          ws.status = status;
          if (reason) ws.lastError = reason;
          this.emit({ workspaceId: ws.id, status, reason });
        }
      }
      this.save();
    });
  }

  private get settings(): SettingsLike | undefined {
    return this.ctx.get('settings') as SettingsLike | undefined;
  }

  private registerSettings(): ((host: string) => SshHostConfig | undefined) | undefined {
    const settings = this.settings;
    if (!settings) return undefined;
    settings.register(SETTINGS_NS, SshRemoteSettingsSchema);
    return (host: string) => {
      const hosts = settings.get(SETTINGS_NS)?.hosts ?? [];
      const h = hosts.find((x) => x.name === host || x.host === host);
      if (!h) return undefined;
      return {
        host: h.host,
        port: h.port,
        username: h.user || undefined,
        privateKey: h.identityFile ? this.readKey(h.identityFile) : undefined,
        proxyJump: h.proxyJump || undefined,
      };
    };
  }

  private readKey(path: string): string | undefined {
    try {
      return readFileSync(expandHome(path), 'utf8');
    } catch {
      return undefined;
    }
  }

  /** Read the configured hosts (Web Remote). */
  @Remote('config')
  config(): { hosts: SshHostEntry[] } {
    return { hosts: this.settings?.get(SETTINGS_NS)?.hosts ?? [] };
  }

  /** Replace the configured hosts (Web Remote). */
  @Remote('saveConfig')
  async saveConfig(args: { hosts: SshHostEntry[] }): Promise<{ ok: boolean }> {
    if (!this.settings) throw new Error('settings provider not mounted');
    await this.settings.update(SETTINGS_NS, { hosts: args.hosts });
    return { ok: true };
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): RemoteWorkspace[] {
    return [...this.workspaces.values()];
  }

  get(id: string): RemoteWorkspace | undefined {
    return this.workspaces.get(id);
  }

  add(uri: string, title?: string): RemoteWorkspace {
    const parsed = parseSshUri(uri);
    const id = `${parsed.host}-${Date.now().toString(36)}`;
    const record: RemoteWorkspace = {
      id,
      uri: formatSshUri(parsed),
      title: title ?? `${parsed.user ? parsed.user + '@' : ''}${parsed.host}`,
      status: 'disconnected',
      createdAt: Date.now(),
    };
    this.workspaces.set(id, record);
    this.save();
    return record;
  }

  remove(id: string): boolean {
    const ws = this.workspaces.get(id);
    if (!ws) return false;
    void this.connections.close(ws.uri);
    this.workspaces.delete(id);
    this.save();
    return true;
  }

  async connect(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`no such workspace: ${id}`);
    await this.connections.transport(ws.uri);
  }

  async disconnect(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`no such workspace: ${id}`);
    await this.connections.close(ws.uri);
  }

  async exec(id: string, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.exec(command);
  }

  async stat(id: string, path: string): Promise<{ type: string; size: number } | undefined> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.sftp(async (sftp) => {
      const st = await statP(sftp, this.remotePath(ws.uri, path));
      return st ? { type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other', size: st.size } : undefined;
    });
  }

  async listDir(id: string, path: string): Promise<Array<{ name: string; type: string; size: number }>> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.sftp(async (sftp) => {
      const entries = await readdirP(sftp, this.remotePath(ws.uri, path));
      return entries.map((e) => ({
        name: e.filename,
        type: e.attrs.isDirectory() ? 'directory' : e.attrs.isFile() ? 'file' : 'other',
        size: e.attrs.size,
      }));
    });
  }

  async readText(id: string, path: string): Promise<string> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.sftp(async (sftp) => {
      const buf = await readFileP(sftp, this.remotePath(ws.uri, path));
      return buf.toString('utf8');
    });
  }

  async writeText(id: string, path: string, content: string): Promise<void> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    await transport.sftp(async (sftp) => {
      await writeFileP(sftp, this.remotePath(ws.uri, path), Buffer.from(content, 'utf8'));
    });
  }

  async dispose(): Promise<void> {
    await this.connections.dispose();
    this.workspaces.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────

  private require(id: string): RemoteWorkspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`no such workspace: ${id}`);
    return ws;
  }

  private keyOf(uri: string): string {
    const u = parseSshUri(uri);
    return `${u.host}:${u.port}:${u.user}`;
  }

  private remotePath(uri: string, path: string): string {
    if (path.startsWith('/')) return path;
    return join(parseSshUri(uri).path, path).replace(/\/+$/, '') || '/';
  }

  private emit(change: { workspaceId: string; status: SshConnectionStatus; reason?: string }): void {
    for (const l of this.listeners) l(change);
  }

  private load(): void {
    try {
      const raw = readFileSync(persistPath(), 'utf8');
      const list = JSON.parse(raw) as RemoteWorkspace[];
      for (const ws of list) {
        if (ws && typeof ws.id === 'string' && typeof ws.uri === 'string') {
          ws.status = 'disconnected';
          ws.lastError = undefined;
          this.workspaces.set(ws.id, ws);
        }
      }
    } catch {
      /* no persisted workspaces */
    }
  }

  private save(): void {
    try {
      const file = persistPath();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify([...this.workspaces.values()], null, 2));
    } catch {
      /* best effort */
    }
  }
}

// ── sftp promisify helpers ────────────────────────────────────────────────

function statP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<import('ssh2').Stats | undefined>((resolve) => {
    sftp.stat(path, (err, st) => resolve(err ? undefined : st));
  });
}

function readdirP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<Array<{ filename: string; attrs: import('ssh2').Stats }>>((resolve, reject) => {
    sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list)));
  });
}

function readFileP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<Buffer>((resolve, reject) => {
    sftp.readFile(path, (err, buf) => (err ? reject(err) : resolve(buf)));
  });
}

function writeFileP(sftp: import('ssh2').SFTPWrapper, path: string, data: Buffer) {
  return new Promise<void>((resolve, reject) => {
    sftp.writeFile(path, data, (err) => (err ? reject(err) : resolve()));
  });
}
