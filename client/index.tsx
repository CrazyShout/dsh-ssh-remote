import { useEffect, useState } from 'react';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import TYPERT_REMOTE from '../lib/typert.remote-client.js';

export const name = 'dsh-ssh-remote-client';
export const inject = ['remote', 'slots', 'locale'];

interface HostEntry {
  name: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
}

interface SshRemote {
  config(): Promise<{ ok: true; value: { hosts: HostEntry[] } } | { ok: false; error: { message: string } }>;
  saveConfig(req: { hosts: HostEntry[] }): Promise<{ ok: true; value: { ok: boolean } } | { ok: false; error: { message: string } }>;
}

const EMPTY: HostEntry = { name: '', host: '', port: 22, user: '', identityFile: '', proxyJump: '' };

export async function apply(ctx: ClientContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remote = ctx.remote as any;
  const disposeMount = await remote.$mount(TYPERT_REMOTE);
  const ssh = remote.sshRemote as SshRemote;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slots = ctx.slots as any;
  // register(options, component): the component receives the composed props
  // (runtime + locale + render slots + the inject share). Business data rides
  // the options.inject factory, not a closure over the component.
  const disposeTab = slots.inject('settings.plugins.tab', () =>
    slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'ssh-remote',
        order: 20,
        label: () => 'SSH Remote',
        inject: () => ({ ssh }),
      },
      SshRemotePanel,
    ),
  );

  return () => {
    disposeTab?.();
    void disposeMount?.();
  };
}

function SshRemotePanel({ ssh }: { ssh: SshRemote }) {
  const [hosts, setHosts] = useState<HostEntry[]>([]);
  const [draft, setDraft] = useState<HostEntry>(EMPTY);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function load() {
    const r = await ssh.config();
    if (r.ok) setHosts(r.value.hosts);
    else setError(r.error.message);
  }

  useEffect(() => {
    void load();
  }, []);

  function set<K extends keyof HostEntry>(k: K, v: HostEntry[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function add() {
    if (!draft.name || !draft.host) {
      setError('name and host are required');
      return;
    }
    const next = [...hosts.filter((h) => h.name !== draft.name), { ...draft }];
    const r = await ssh.saveConfig({ hosts: next });
    if (r.ok) {
      setHosts(next);
      setDraft(EMPTY);
      setSaved(true);
      setError('');
    } else {
      setError(r.error.message);
    }
  }

  async function remove(name: string) {
    const next = hosts.filter((h) => h.name !== name);
    const r = await ssh.saveConfig({ hosts: next });
    if (r.ok) setHosts(next);
    else setError(r.error.message);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
      <h3 style={{ margin: 0 }}>SSH Remote Hosts</h3>
      {hosts.length === 0 && <div style={{ color: '#888' }}>No hosts configured.</div>}
      {hosts.map((h) => (
        <div key={h.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          <span style={{ flex: 1 }}>
            <b>{h.name}</b> — {h.user ? h.user + '@' : ''}{h.host}:{h.port}
            {h.proxyJump ? ` (jump: ${h.proxyJump})` : ''}
          </span>
          <button onClick={() => void remove(h.name)}>Remove</button>
        </div>
      ))}

      <hr style={{ width: '100%' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="name *" value={draft.name} onChange={(v) => set('name', v)} />
        <Field label="host *" value={draft.host} onChange={(v) => set('host', v)} />
        <Field label="port" value={String(draft.port)} onChange={(v) => set('port', Number(v) || 22)} />
        <Field label="user" value={draft.user} onChange={(v) => set('user', v)} />
        <Field label="identityFile" value={draft.identityFile} onChange={(v) => set('identityFile', v)} />
        <Field label="proxyJump" value={draft.proxyJump} onChange={(v) => set('proxyJump', v)} />
      </div>
      <button onClick={() => void add()}>Add host</button>
      {saved && <div style={{ color: '#22c55e' }}>Saved.</div>}
      {error && <div style={{ color: '#ef4444' }}>{error}</div>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
