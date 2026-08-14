import { execFile } from 'node:child_process';
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** An effective SSH target resolved by the local OpenSSH client. */
export interface SshConfigHost {
  /** Concrete `Host` alias from the user's SSH config. */
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  identityFiles?: string[];
  proxyJump?: string;
  proxyCommand?: string;
}

export interface SshGResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SshGRunner = (configPath: string, alias: string) => Promise<SshGResult>;

interface SshDirective {
  keyword: string;
  values: string[];
}

const PATTERN_HOST = /[!*?[\]{}()]/u;
const GLOB_PATTERN = /[*?[\]{}()]/u;

/** The same local OpenSSH entrypoint Codex Remote documents and discovers. */
export function userSshConfigPath(): string {
  return join(homedir(), '.ssh', 'config');
}

/**
 * Parse one SSH config document without resolving OpenSSH precedence. This is
 * intentionally useful only for discovery and tests; connection settings are
 * resolved with `ssh -G`, not with this partial parser.
 */
export function parseSshConfig(text: string): SshConfigHost[] {
  const hosts: SshConfigHost[] = [];
  let current: SshConfigHost[] = [];

  for (const directive of parseDirectives(text)) {
    if (directive.keyword === 'host') {
      current = directive.values
        .filter(isConcreteAlias)
        .map((host) => ({ host, identityFiles: [] }));
      hosts.push(...current);
      continue;
    }
    if (directive.keyword === 'match') {
      current = [];
      continue;
    }
    for (const host of current) {
      const value = directive.values.join(' ');
      if (directive.keyword === 'hostname' && host.hostName === undefined) host.hostName = value;
      else if (directive.keyword === 'user' && host.user === undefined) host.user = value;
      else if (directive.keyword === 'port' && host.port === undefined) host.port = parsePort(value);
      else if (directive.keyword === 'identityfile') {
        const path = expandSshPath(value);
        host.identityFiles?.push(path);
        host.identityFile ??= path;
      } else if (directive.keyword === 'proxyjump' && host.proxyJump === undefined) host.proxyJump = value;
      else if (directive.keyword === 'proxycommand' && host.proxyCommand === undefined) host.proxyCommand = value;
    }
  }

  return hosts;
}

/**
 * Discover concrete aliases from `~/.ssh/config` and recursively referenced
 * `Include` files. Pattern-only Host blocks are not returned.
 */
export function collectSshAliases(configPath = userSshConfigPath()): string[] {
  if (!existsSync(configPath)) return [];

  const aliases = new Set<string>();
  const visited = new Set<string>();
  const entrypoint = resolve(configPath);
  const configRoot = dirname(entrypoint);

  const visit = (candidate: string): void => {
    const absolutePath = resolve(candidate);
    if (visited.has(absolutePath) || !isFile(absolutePath)) return;
    visited.add(absolutePath);

    let text: string;
    try {
      text = readFileSync(absolutePath, 'utf8');
    } catch {
      return;
    }

    for (const directive of parseDirectives(text)) {
      if (directive.keyword === 'host') {
        for (const alias of directive.values) {
          if (isConcreteAlias(alias)) aliases.add(alias);
        }
      } else if (directive.keyword === 'include') {
        for (const include of directive.values) {
          for (const includedPath of expandInclude(include, configRoot)) visit(includedPath);
        }
      }
    }
  };

  visit(entrypoint);
  return [...aliases].sort((a, b) => a.localeCompare(b));
}

export function hasConcreteSshAlias(alias: string, configPath = userSshConfigPath()): boolean {
  return collectSshAliases(configPath).includes(alias);
}

/** Resolve one alias through the user's actual OpenSSH implementation. */
export async function resolveOpenSshHost(
  alias: string,
  configPath = userSshConfigPath(),
  runner: SshGRunner = runSshG,
): Promise<SshConfigHost | undefined> {
  if (!existsSync(configPath)) return undefined;
  const result = await runner(configPath, alias);
  if (result.code !== 0) return undefined;
  return parseOpenSshResolvedConfig(alias, result.stdout);
}

/** Discover aliases, then resolve effective HostName/User/Port/etc with `ssh -G`. */
export async function discoverSshHosts(
  configPath = userSshConfigPath(),
  runner: SshGRunner = runSshG,
): Promise<SshConfigHost[]> {
  const aliases = collectSshAliases(configPath);
  const resolved = await Promise.all(
    aliases.map((alias) => resolveOpenSshHost(alias, configPath, runner)),
  );
  return resolved.filter((host): host is SshConfigHost => host !== undefined);
}

/** Parse the normalized, effective configuration emitted by `ssh -G`. */
export function parseOpenSshResolvedConfig(alias: string, text: string): SshConfigHost | undefined {
  let hostName: string | undefined;
  let user: string | undefined;
  let port: number | undefined;
  let proxyJump: string | undefined;
  let proxyCommand: string | undefined;
  const identityFiles: string[] = [];

  for (const directive of parseDirectives(text)) {
    const value = directive.values.join(' ');
    if (directive.keyword === 'hostname' && hostName === undefined) hostName = value;
    else if (directive.keyword === 'user' && user === undefined) user = value;
    else if (directive.keyword === 'port' && port === undefined) port = parsePort(value);
    else if (directive.keyword === 'identityfile' && value.toLowerCase() !== 'none') {
      identityFiles.push(expandSshPath(value));
    } else if (directive.keyword === 'proxyjump' && value.toLowerCase() !== 'none' && proxyJump === undefined) {
      proxyJump = value;
    } else if (directive.keyword === 'proxycommand' && value.toLowerCase() !== 'none' && proxyCommand === undefined) {
      proxyCommand = value;
    }
  }

  if (!hostName) return undefined;
  return {
    host: alias,
    hostName,
    user,
    port: port ?? 22,
    identityFile: identityFiles[0],
    identityFiles,
    proxyJump,
    proxyCommand,
  };
}

/** Expand common home-directory spellings emitted by OpenSSH. */
export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return path;
}

/** Compatibility helper for callers/tests that already have parsed entries. */
export function resolveSshAlias(alias: string, config: SshConfigHost[]): SshConfigHost | undefined {
  return config.find((host) => host.host === alias);
}

async function runSshG(configPath: string, alias: string): Promise<SshGResult> {
  return new Promise((resolveResult) => {
    execFile(
      'ssh',
      ['-G', '-F', configPath, alias],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = typeof (error as NodeJS.ErrnoException & { code?: number } | null)?.code === 'number'
          ? (error as unknown as { code: number }).code
          : error
            ? 1
            : 0;
        resolveResult({ code, stdout, stderr });
      },
    );
  });
}

function parseDirectives(text: string): SshDirective[] {
  const directives: SshDirective[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const match = /^(\S+)(?:\s+|\s*=\s*)(.*)$/u.exec(line);
    if (!match) continue;
    const keyword = match[1].toLowerCase();
    const values = splitSshWords(match[2]);
    if (values.length > 0) directives.push({ keyword, values });
  }
  return directives;
}

function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '#') return line.slice(0, index);
  }
  return line;
}

function splitSshWords(value: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const char of value.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/u.test(char)) {
      if (current) {
        words.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (escaped) current += '\\';
  if (current) words.push(current);
  return words;
}

function isConcreteAlias(alias: string): boolean {
  return alias.length > 0 && !PATTERN_HOST.test(alias);
}

function expandInclude(value: string, configRoot: string): string[] {
  const expanded = expandHome(value);
  const pattern = isAbsolute(expanded) ? expanded : resolve(configRoot, expanded);
  if (!GLOB_PATTERN.test(pattern)) return isFile(pattern) ? [pattern] : [];
  try {
    return globSync(pattern).filter(isFile);
  } catch {
    return [];
  }
}

function expandSshPath(path: string): string {
  if (path === '%d') return homedir();
  if (path.startsWith('%d/') || path.startsWith('%d\\')) return join(homedir(), path.slice(3));
  return expandHome(path);
}

function parsePort(value: string): number | undefined {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : undefined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
