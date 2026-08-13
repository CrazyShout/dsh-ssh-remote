import { defineTool } from '@deepseek-ai/dsh-tools';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';
import { SshRemoteService } from './registry.js';
import { expandHome } from './ssh-config.js';
export const name = 'dsh-ssh-remote';
export const inject = ['tools'];
/** Settings namespace name. */
const SETTINGS_NS = settingsNamespace('ssh-remote');
/** `ssh-remote` settings schema: named hosts with optional ProxyJump. */
const SshRemoteSettingsSchema = z.object({
    hosts: z
        .array(z.object({
        name: z.string(),
        host: z.string(),
        port: z.number().min(1).max(65535).default(22),
        user: z.string().default(''),
        identityFile: z.string().default(''),
        proxyJump: z.string().default(''),
    }))
        .default([]),
});
const OUTPUT = {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
};
const TOOL_DESCRIPTION = 'Manage SSH remote workspaces for DeepSeek Harness. ' +
    'Actions: list (all workspaces), add (register ssh://user@host:port/path), remove, connect, disconnect, ' +
    'exec (run a shell command), read (read a text file), write (write a text file), stat, list_dir. ' +
    'Host names may match entries configured in Settings (ssh-remote), which can carry a ProxyJump.';
export function apply(ctx) {
    // Resolve host configs from the `ssh-remote` settings namespace when a
    // settings provider is mounted; otherwise fall back to ~/.ssh/config alone.
    let hostResolver;
    const settings = ctx.settings;
    if (settings) {
        const scope = settings.register(SETTINGS_NS, SshRemoteSettingsSchema);
        const resolve = () => {
            const hosts = scope.get().hosts;
            return (host) => {
                const h = hosts.find((x) => x.name === host || x.host === host);
                if (!h)
                    return undefined;
                return {
                    host: h.host,
                    port: h.port,
                    username: h.user || undefined,
                    privateKey: h.identityFile ? readPrivateKey(h.identityFile) : undefined,
                    proxyJump: h.proxyJump || undefined,
                };
            };
        };
        hostResolver = resolve();
    }
    const service = new SshRemoteService(ctx, hostResolver);
    ctx.tools.register(defineTool({
        name: 'ssh_remote',
        description: TOOL_DESCRIPTION,
        parameters: {
            action: {
                type: 'string',
                required: true,
                description: 'list | add | remove | connect | disconnect | exec | read | write | stat | list_dir',
            },
            id: {
                type: 'string',
                description: 'Workspace id returned by list/add (required for every action except list/add).',
            },
            uri: {
                type: 'string',
                description: 'ssh://user@host:port/path for the remote workspace (required for add).',
            },
            title: {
                type: 'string',
                description: 'Optional display title (add only).',
            },
            path: {
                type: 'string',
                description: 'Remote absolute path, or workspace-relative path (read/write/stat/list_dir).',
            },
            command: {
                type: 'string',
                description: 'Shell command to run (exec only).',
            },
            content: {
                type: 'string',
                description: 'Text content to write (write only).',
            },
        },
        output: OUTPUT,
        async execute(args) {
            const result = await run(service, args);
            return JSON.stringify(result, null, 2);
        },
    }));
    return () => {
        void service.dispose();
    };
}
function readPrivateKey(path) {
    try {
        return readFileSync(expandHome(path), 'utf8');
    }
    catch {
        return undefined;
    }
}
async function run(service, args) {
    switch (args.action) {
        case 'list':
            return { workspaces: service.list() };
        case 'add': {
            if (!args.uri)
                throw new Error('add requires uri');
            return { workspace: service.add(args.uri, args.title) };
        }
        case 'remove': {
            return { removed: service.remove(requireId(args.id)) };
        }
        case 'connect': {
            await service.connect(requireId(args.id));
            return { ok: true };
        }
        case 'disconnect': {
            await service.disconnect(requireId(args.id));
            return { ok: true };
        }
        case 'exec': {
            if (!args.command)
                throw new Error('exec requires command');
            return service.exec(requireId(args.id), args.command);
        }
        case 'stat': {
            return { stat: await service.stat(requireId(args.id), requirePath(args.path)) };
        }
        case 'list_dir': {
            return { entries: await service.listDir(requireId(args.id), requirePath(args.path)) };
        }
        case 'read': {
            return { content: await service.readText(requireId(args.id), requirePath(args.path)) };
        }
        case 'write': {
            if (args.content === undefined)
                throw new Error('write requires content');
            await service.writeText(requireId(args.id), requirePath(args.path), args.content);
            return { ok: true };
        }
        default:
            throw new Error(`unknown action: ${args.action}`);
    }
}
function requireId(id) {
    if (!id)
        throw new Error('this action requires id');
    return id;
}
function requirePath(path) {
    if (!path)
        throw new Error('this action requires path');
    return path;
}
//# sourceMappingURL=index.js.map