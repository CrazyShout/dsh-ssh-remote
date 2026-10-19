/** Quote data for a POSIX script, not for an unknown SSH login shell. */
export declare function quotePosix(value: string): string;
/**
 * sshd first parses its command with the account's login shell (possibly fish
 * or tcsh). Pass only a fixed, single-quoted Python expression through that
 * shell. Python is already a helper prerequisite; exec preserves stdin, status
 * and process ownership without an extra script file or base64 executable.
 */
export declare function remoteShCommand(script: string, login?: boolean): string;
//# sourceMappingURL=ssh-command.d.ts.map