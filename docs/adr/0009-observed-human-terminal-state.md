# ADR-0009: Observed human terminal state

Status: implemented and accepted for 0.10.0 on 2026-10-16; final merge is tracked in PR #22. DSH remains
0.2.0-rc.2. Transfer manifest/capability v1 is unchanged and remains restart-readable.

## Identity and ownership

An optional wrapper around the **public** `terminalController.create(agent, request,
signal)` puts the Session/terminal id and registered SSH root in AsyncLocalStorage.
The existing Agent-scoped subprocess router associates the returned remote PTY with
that request. Model terminals, direct subprocess calls outside this request, and
local Sessions do not opt in. No controller private owner map, renderer DOM patch,
duplicate input attachment, or terminal-output marker parser is used.

`sshRemoteTerminalState.list/context` uses `workspaceFileScope` for authorization
and the public `terminalController.list` as the retained terminal roster. Changed
Session roots are refused; controller reload clears the association lifetime.
Old terminals remain usable but display unobserved/unknown. Observations never
change official input ownership, terminal idle-reclamation, screen recovery, process
termination, Agent cwd, sandbox permissions or approval rules.

## New shells only

The helper advertises `shellState.version=1`. Human `process/start` opts in with
`shellObservation:true` only for full-user PTYs. Old helpers explicitly show unsupported.
Only the standard `-i` Bash/Zsh invocation is rewritten; custom argument profiles
remain raw. Bash requires 4.4+, Zsh 5.8+; unsupported/failed initialization is visible.

Per-terminal temporary startup code is in a private 700 directory with 600 files,
covered by the installed helper asset SHA. No user rc file is changed. Bash sources
the original `.bashrc`, preserves PS0 and PROMPT_COMMAND, and uses a scalar prompt
composition for Bash 4.4/5.0 (array composition for 5.1+). Custom DEBUG/extdebug or
readonly prompt settings fall back to raw. Zsh preserves user `.zshenv`/`.zshrc`,
ZDOTDIR and existing preexec/precmd arrays. Basic (non-array) precmd/preexec functions
can suppress arrays on failure, so those profiles retain their original hooks and
explicitly fall back; disabled RCS also stays unchanged. Startup code is removed on release.
Unusual global startup overrides may prevent hooks from loading; after ten seconds
the status explicitly reports raw/unsupported instead of manufacturing a prompt.

References: [Bash interactive behavior](https://www.gnu.org/software/bash/manual/html_node/Interactive-Shell-Behavior.html),
[Bash 5.1 release notes](https://lists.gnu.org/archive/html/info-gnu/2020-12/msg00003.html),
[Zsh hook functions](https://zsh.sourceforge.io/Doc/Release/Functions.html#Hook-Functions).

## Bounded independent observations

The shell uses builtin printf to a private nonblocking pipe inherited only by the
task, not its guardian. Frames contain an instance nonce, sequence, event kind,
exit status, cwd, command and truncation flags. Each frame is below PIPE_BUF;
full pipes do not block shell I/O. A separate bounded reader checks frames and
sequence ordering. Invalid/gapped events cannot produce a confirmed command exit.
Missing Bash start events can also be empty input or an interrupt and are labeled
accordingly. Ignored/disabled history yields unknown command text, never the previous
entry. Receipt timestamps supply monotonic durations, not performance benchmarks.

`process/shellState` returns a bounded snapshot, independent of output reads.
A bounded optional snapshot also accompanies normal output-pump responses so the
final observation can be retained before a fast-exiting process is released, even
if the panel was never opened. It is metadata, not a parsed output marker, and its
failure cannot fail output delivery. Older checkpoint replies cannot replace newer ones.
Host observation acquisition has a three-second total abort bound, including
reconnection waits. Failure preserves old observations as stale. Polling does not
classify silence as completion. A prompt means the foreground shell has returned,
not that background work ended; nested SSH/tmux programs remain one outer running
command and do not expose their inner cwd or commands.

Host memory per terminal: at most 40 KiB raw output + 24 KiB serialized metadata;
helper keeps at most sixteen/16 KiB completed command records plus bounded current
metadata/channel buffers. At most 128 Host associations, evicting closed entries;
list responses are limited to 64 terminals. Nothing is persisted by this feature.
The shell's own pre-existing history policy remains unchanged.

Output is observed inside the existing pump, never by adding a draining stream
consumer. Errors in observation cannot fail the official output lane. Exit/cleanup
and retained output semantics remain owned by the existing terminal implementation.
Metadata is not a security boundary: same-UID programs can forge or disable hooks.

## Explicit context handoff

The public sidebar panel and native terminal tab menu expose status. Context export
is at most 64 KiB and removes VT/control sequences. React/textareas render it as text.
The user previews and may trim the fragment, then explicitly inserts it. Public
`inputActions.captureInsertion/insertText` guards the **original** Session's draft
revision and selection. Changed drafts, Session switches, locked input or unavailable
actions refuse insertion; the preview/copy path remains. No automatic submit or
full-draft replacement exists. Users should check for secrets before sharing output.

## Validation boundary

Tests cover real helper Bash/Zsh PTYs, command/exit correspondence, pipelines,
multiline input, cd, Ctrl-C, background return, startup hooks, ignored history,
metadata corruption/gaps/bounds, local delegation, concurrent Session ownership,
stale observations, bounded context, preview and revision-safe insertion.
The minimum Bash 4.4 is built only in an isolated test directory, not installed.
Opt-in SSH smoke uses a synthetic HOME and temporary workspace and verifies same
terminal instance across transport loss. Transfer upgrade smoke writes only 28 bytes
and verifies the 0.9.0 confirmed offset survives 0.10.0, without automatic resume.
Web/Desktop acceptance and cross-platform CI are merge gates. On 2026-10-16,
Desktop was normally restarted with the candidate, and validated command status,
Unicode cwd, interactive Ctrl-C, the native tab menu, context preview, changed-draft
refusal and explicit insertion preserving the original draft. No model request was
sent. Remote file preview/quick open and native mention candidates were checked;
local workspaces did not show SSH actions. Synthetic drafts/terminal were cleared
and the prior user conversation restored. Web also tested final metadata retention
when a terminal exits before its status panel is opened. CI includes the isolated
Bash 4.4 floor and the existing Node/Python/macOS/Linux matrix.
