import { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { SshRemoteService } from './registry.js';

export const name = 'dsh-ssh-remote';
export const inject = ['tools'];

const OUTPUT = {
  schema: { type: 'string' } as const,
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
};

const TOOL_DESCRIPTION =
  'Manage SSH remote workspaces for DeepSeek Harness. ' +
  'Actions: list (all workspaces), add (register ssh://user@host:port/path), remove, connect, disconnect, ' +
  'exec (run a shell command), read (read a text file), write (write a text file), stat, list_dir. ' +
  'Connection status is tracked per workspace.';

export function apply(ctx: Context) {
  const service = new SshRemoteService(ctx);

  ctx.tools.register(
    defineTool({
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
    }),
  );

  return () => {
    void service.dispose();
  };
}

async function run(
  service: SshRemoteService,
  args: {
    action: string;
    id?: string;
    uri?: string;
    title?: string;
    path?: string;
    command?: string;
    content?: string;
  },
): Promise<unknown> {
  switch (args.action) {
    case 'list':
      return { workspaces: service.list() };
    case 'add': {
      if (!args.uri) throw new Error('add requires uri');
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
      if (!args.command) throw new Error('exec requires command');
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
      if (args.content === undefined) throw new Error('write requires content');
      await service.writeText(requireId(args.id), requirePath(args.path), args.content);
      return { ok: true };
    }
    default:
      throw new Error(`unknown action: ${args.action}`);
  }
}

function requireId(id: string | undefined): string {
  if (!id) throw new Error('this action requires id');
  return id;
}

function requirePath(path: string | undefined): string {
  if (!path) throw new Error('this action requires path');
  return path;
}
