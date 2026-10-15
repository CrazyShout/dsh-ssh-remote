"""Best-effort shell observations, never an authority or an input/lifecycle owner.

The shell writes bounded frames to a private nonblocking pipe. Output is not parsed
for markers. All command data remains in memory; only startup code is temporary.
"""
import collections
import os
import secrets
import selectors
import shlex
import shutil
import tempfile
import threading
import time

LIMIT = 16 * 1024

# printf is a shell builtin. One bounded frame fits POSIX PIPE_BUF; EAGAIN must
# never delay a prompt. A dropped/partial frame is diagnosed by sequence/parser.
EMITTER = r'''
__dsh_observe_emit() {
  local LC_ALL=C __dsh_cwd="$PWD" __dsh_cmd="$4" __dsh_flags=''
  if [ ${#__dsh_cwd} -gt 1400 ]; then __dsh_cwd=''; __dsh_flags=cwd; fi
  if [ ${#__dsh_cmd} -gt 1400 ]; then __dsh_cmd="${__dsh_cmd:0:1400}"; __dsh_flags="$__dsh_flags command"; fi
  { builtin printf '%s\0%s\0%s\0%s\0%s\0%s\0%s\0' '@NONCE@' "$1" "$2" "$3" "$__dsh_cwd" "$__dsh_cmd" "$__dsh_flags" >&@FD@; } 2>/dev/null || :
}
'''
BASH = r'''
if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi
@EMITTER@
if [ "${BASH_VERSINFO[0]}" -lt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -lt 4 ]; }; then
  __dsh_observe_emit 0 unsupported 0 'Bash 4.4+ required'; return
fi
if [ -n "$(trap -p DEBUG)" ] || shopt -q extdebug || [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" =~ ^declare\ -[^[:space:]]*r ]] || [[ "$(declare -p PS0 2>/dev/null)" =~ ^declare\ -[^[:space:]]*r ]]; then
  __dsh_observe_emit 0 unsupported 0 'Custom DEBUG/extdebug/readonly prompt hook'; return
fi
__dsh_observe_epoch=0
__dsh_observe_history=''
__dsh_observe_prompt() {
  local __dsh_code=$?
  __dsh_observe_emit "$((__dsh_observe_epoch * 2))" prompt "$__dsh_code" ''
  __dsh_observe_epoch=$((__dsh_observe_epoch + 1))
  return "$__dsh_code"
}
__dsh_observe_arm() {
  local __dsh_code=$?
  __dsh_observe_history="$(HISTTIMEFORMAT= builtin history 1)"
  return "$__dsh_code"
}
__dsh_observe_start() {
  local __dsh_command='' __dsh_latest
  __dsh_latest="$(HISTTIMEFORMAT= builtin history 1)"
  # Ignored/disabled history must not turn the previous command into this one.
  # fc -1 skips the current history item inside PS0's command substitution.
  # Read the already-captured current item, including multiline content.
  if [ "$__dsh_latest" != "$__dsh_observe_history" ] && [[ "$__dsh_latest" =~ ^[[:blank:]]*[0-9]+[[:blank:]*]+(.*)$ ]]; then
    __dsh_command="${BASH_REMATCH[1]}"
  fi
  __dsh_observe_emit "$((__dsh_observe_epoch * 2 - 1))" start 0 "$__dsh_command"
}
PS0='$(__dsh_observe_start)'"${PS0-}"
if [ "${BASH_VERSINFO[0]}" -gt 5 ] || { [ "${BASH_VERSINFO[0]}" -eq 5 ] && [ "${BASH_VERSINFO[1]}" -ge 1 ]; }; then
  PROMPT_COMMAND=(__dsh_observe_prompt "${PROMPT_COMMAND[@]}" __dsh_observe_arm)
else
  # PROMPT_COMMAND only became array-aware in Bash 5.1. Preserve the effective
  # scalar hook in 4.4/5.0, including a trailing shell comment.
  PROMPT_COMMAND=$'__dsh_observe_prompt\n'"${PROMPT_COMMAND-}"$'\n__dsh_observe_arm'
fi
'''
ZSH_ENV = r'''
@RESTORE_ZDOTDIR@
if [[ -r "${ZDOTDIR-$HOME}/.zshenv" ]]; then source "${ZDOTDIR-$HOME}/.zshenv"; fi
typeset -g __dsh_observe_zdot_set=${+ZDOTDIR} __dsh_observe_zdot=${ZDOTDIR-}
if [[ ! -o rcs ]]; then
  @EMITTER@
  __dsh_observe_emit 0 unsupported 0 'Zsh RCS disabled by startup configuration'
  return
fi
ZDOTDIR=@TEMP@
'''
ZSH_RC = r'''
if (( __dsh_observe_zdot_set )); then ZDOTDIR=$__dsh_observe_zdot; else unset ZDOTDIR; fi
if [[ -r "${ZDOTDIR-$HOME}/.zshrc" ]]; then source "${ZDOTDIR-$HOME}/.zshrc"; fi
@EMITTER@
autoload -Uz is-at-least
if ! is-at-least 5.8; then __dsh_observe_emit 0 unsupported 0 'Zsh 5.8+ required'; return; fi
if (( $+functions[precmd] || $+functions[preexec] )); then
  # Basic functions run before hook arrays and may suppress those arrays on
  # failure. Keep such functions untouched instead of claiming complete events.
  __dsh_observe_emit 0 unsupported 0 'Custom basic precmd/preexec function; hook arrays remain untouched'
  return
fi
typeset -g __dsh_observe_seq=-1
__dsh_observe_prompt() {
  local __dsh_code=$?
  (( __dsh_observe_seq += 1 ))
  __dsh_observe_emit "$__dsh_observe_seq" prompt "$__dsh_code" ''
  return 0
}
__dsh_observe_start() {
  (( __dsh_observe_seq += 1 ))
  __dsh_observe_emit "$__dsh_observe_seq" start 0 "$1"
  return 0
}
precmd_functions=(__dsh_observe_prompt ${precmd_functions:#__dsh_observe_prompt})
preexec_functions=(__dsh_observe_start ${preexec_functions:#__dsh_observe_start})
'''


class ShellObservation:
    def __init__(self, argv, env):
        self.lock = threading.Lock()
        self.nonce = secrets.token_hex(16)
        self.pipe_read = self.pipe_write = -1
        self.directory = None
        self.stop = threading.Event()
        self.thread = None
        self.seq = -1
        self.revision = 0
        self.state = 'starting'
        self.reason = ''
        self.cwd = None
        self.current = None
        self.recent = collections.deque()
        self.started = time.monotonic()
        self.argv, self.env = list(argv), dict(env)
        shell = os.path.basename(argv[0])
        if shell not in ('bash', 'zsh') or argv[1:] != ['-i']:
            self.state, self.reason = 'unsupported', 'Only default interactive Bash/Zsh (-i) is instrumented; custom arguments are unchanged.'
            return
        try:
            self.pipe_read, self.pipe_write = os.pipe()
            os.set_blocking(self.pipe_read, False)
            os.set_blocking(self.pipe_write, False)
            self.directory = tempfile.mkdtemp(prefix='dsh-shell-hooks-')
            emitter = EMITTER.replace('@NONCE@', self.nonce).replace('@FD@', str(self.pipe_write))
            if shell == 'bash':
                self.write('bashrc', BASH.replace('@EMITTER@', emitter))
                self.argv = [argv[0], '--rcfile', os.path.join(self.directory, 'bashrc'), '-i']
            else:
                restore = 'ZDOTDIR=' + shlex.quote(env['ZDOTDIR']) if 'ZDOTDIR' in env else 'unset ZDOTDIR'
                self.write('.zshenv', ZSH_ENV.replace('@RESTORE_ZDOTDIR@', restore).replace('@TEMP@', shlex.quote(self.directory)).replace('@EMITTER@', emitter))
                self.write('.zshrc', ZSH_RC.replace('@EMITTER@', emitter))
                self.env['ZDOTDIR'] = self.directory
            self.thread = threading.Thread(target=self.read, daemon=True)
            self.thread.start()
        except Exception:
            self.close()
            self.argv, self.env = list(argv), dict(env)
            self.state, self.reason = 'unsupported', 'Temporary shell integration could not initialize; raw terminal retained.'

    def write(self, name, text):
        fd = os.open(os.path.join(self.directory, name), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out: out.write(text)

    def launched(self):
        if self.pipe_write >= 0:
            os.close(self.pipe_write); self.pipe_write = -1

    def unknown(self, reason):
        self.state, self.reason = 'unknown', reason
        if self.current:
            self.current['uncertain'] = True
        self.revision += 1

    def ingest(self, fields):
        try:
            nonce, sequence, kind, code, cwd, command, flags = [part.decode('utf-8', 'replace') for part in fields]
            sequence, code = int(sequence), int(code)
            if nonce != self.nonce or kind not in ('start', 'prompt', 'unsupported') or not 0 <= sequence < 2 ** 53 or not 0 <= code <= 255:
                raise ValueError()
        except (ValueError, TypeError):
            self.unknown('Invalid shell metadata; state is not authoritative.'); return
        if sequence <= self.seq:
            self.unknown('Out-of-order shell metadata.'); return
        gap = sequence != self.seq + 1
        self.seq, self.revision = sequence, self.revision + 1
        self.cwd = cwd or None
        self.reason = ('Command start not observed (empty input, interrupt, or missing metadata).' if gap else '')
        if flags: self.reason = 'Shell metadata was truncated: ' + flags.strip()
        if kind == 'unsupported':
            self.state, self.reason = 'unsupported', command; return
        now = time.monotonic()
        if kind == 'start':
            if self.current:
                self.current['uncertain'] = True; self.recent.append(self.current)
            self.current = {'command': command or None, 'cwd': self.cwd, 'startedAt': int(time.time() * 1000),
                            'elapsedMs': None, 'exitCode': None, 'uncertain': bool(flags), '_start': now}
            self.state = 'running'
        else:
            if self.current:
                self.current['elapsedMs'] = int((now - self.current['_start']) * 1000)
                self.current['uncertain'] |= gap
                self.current['exitCode'] = None if self.current['uncertain'] else code
                self.recent.append(self.current); self.current = None
            self.state = 'prompt'
        while len(self.recent) > 16 or sum(len(str(row).encode()) for row in self.recent) > LIMIT:
            self.recent.popleft()

    def read(self):
        selector = selectors.DefaultSelector(); buffered = b''
        marker = self.nonce.encode() + b'\0'
        try:
            selector.register(self.pipe_read, selectors.EVENT_READ)
            while not self.stop.is_set():
                if not selector.select(0.1): continue
                try: chunk = os.read(self.pipe_read, 8192)
                except BlockingIOError: continue
                if not chunk:
                    with self.lock:
                        if not self.stop.is_set() and self.state != 'unsupported': self.unknown('Shell metadata channel closed.')
                    break
                buffered += chunk
                with self.lock:
                    while buffered:
                        pos = buffered.find(marker)
                        if pos < 0:
                            self.unknown('Invalid shell metadata frame.'); buffered = buffered[-len(marker):]; break
                        if pos:
                            self.unknown('Partial shell metadata frame.'); buffered = buffered[pos:]
                        if buffered.count(b'\0') < 7:
                            if len(buffered) > 4096: self.unknown('Oversized shell metadata frame.'); buffered = b''
                            break
                        parts = buffered.split(b'\0', 7); buffered = parts[7]
                        if sum(map(len, parts[:7])) > 4096: self.unknown('Oversized shell metadata frame.')
                        else: self.ingest(parts[:7])
        except (OSError, ValueError):
            with self.lock:
                if not self.stop.is_set(): self.unknown('Shell metadata reader unavailable.')
        finally: selector.close()

    def snapshot(self, exited=False):
        with self.lock:
            if self.state == 'starting' and time.monotonic() - self.started > 10:
                self.state, self.reason = 'unsupported', 'Shell hook did not initialize; raw terminal remains usable.'
            def public(row):
                return {key: value for key, value in row.items() if not key.startswith('_')}
            return {'instance': self.nonce, 'sequence': str(self.seq), 'revision': self.revision,
                    'state': 'exited' if exited else self.state, 'reason': self.reason, 'cwd': self.cwd,
                    'current': public(self.current) if self.current else None,
                    'recent': [public(row) for row in self.recent]}

    def close(self):
        self.stop.set()
        if self.thread: self.thread.join(0.3)
        for name in ('pipe_read', 'pipe_write'):
            fd = getattr(self, name)
            if fd >= 0:
                try: os.close(fd)
                except OSError: pass
                setattr(self, name, -1)
        if self.directory:
            shutil.rmtree(self.directory); self.directory = None
