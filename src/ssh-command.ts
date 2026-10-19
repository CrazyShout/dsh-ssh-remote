/** Quote data for a POSIX script, not for an unknown SSH login shell. */
export function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * sshd first parses its command with the account's login shell (possibly fish
 * or tcsh). Pass only a fixed, single-quoted Python expression through that
 * shell. Python is already a helper prerequisite; exec preserves stdin, status
 * and process ownership without an extra script file or base64 executable.
 */
export function remoteShCommand(script: string, login = false): string {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  return `exec python3 -c 'import base64,os;os.execlp("sh","sh","${login ? '-lc' : '-c'}",base64.b64decode("${encoded}").decode("utf-8"))'`;
}
