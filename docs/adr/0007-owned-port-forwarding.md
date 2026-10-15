# ADR-0007: owned local port forwarding

Date: 2026-10-15. Plugin: 0.8.0. DSH: 0.2.0-rc.2.
Status: implemented; platform acceptance is tracked in ROADMAP.md.

## Scope and authority

An explicit human action creates a local TCP forward for the selected SSH workspace.
The public `sshRemotePorts` service resolves `workspaceFileScope` for every call;
the client never supplies an SSH alias or raw workspace authority. The registered
canonical SSH workspace URI owns each record. Sessions in that same workspace can
manage it; other workspaces cannot. New connections require a concrete configured
alias. Removing an alias does not revoke access to list/stop existing resources.
Model tools and sandbox policy are unchanged. There is no helper protocol change.

Only `127.0.0.1:localPort -> alias:127.0.0.1:remotePort` is supported. Host ports
are 1024–65535, target ports 1–65535. No target hosts, URLs, shell snippets, reverse
forwarding, SOCKS, scanning or remote-service deployment are accepted by this API.

## OpenSSH ownership

Each forwarding guardian creates a mode-700 temporary directory and an independent
OpenSSH master with a short private Unix control socket. It disables inherited
forwardings, agent/X11 forwarding, local commands, remote commands and persistence.
Normal alias resolution, authentication, ProxyJump and host-key policy remain with
the user's OpenSSH configuration. No configuration is modified.

`ClearAllForwardings=yes` on the master would also remove a command-line `-L`.
Therefore the master is established first, then a separate `-F /dev/null -O forward`
control request adds exactly the loopback listener. The positive mux response is
the listener-established fact. No preflight port check substitutes for the actual
bind, and no existing listener/master is killed to recover from a conflict.

The optional remote TCP check uses the same owned master, fixed Python stdlib code,
and `ProxyCommand=false` to prevent fallback to a new connection if the socket is
gone. It reads no application data. TCP reachability is not HTTP health and does
not prove sshd permits forwarding (`AllowTcpForwarding` / `PermitOpen`); actual
channel refusal is reported independently when observed on the master. Missing
Python or blocked exec produces “unknown,” never an installation.

References: [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1),
[ssh_config(5)](https://man.openbsd.org/ssh_config.5).

## Lifecycle and boundedness

- Host reserves local port and operation identity before forking. Same identity and
  parameters are idempotent, including after Stop. Stop-before-create leaves a
  tombstone. No delayed ready/probe can reverse Stop. Recreate uses a new identity.
- At most eight active/reserved forwards globally. At most 1,024 receipts; settled,
  confirmed ones expire after 24 hours. Lists show up to 32 records, active first.
- A Node guardian owns actual ChildProcess handles, not remembered numeric PIDs.
  Parent IPC disconnect, TERM, INT and startup failure trigger bounded cleanup.
  Commands and startup have deadlines; TERM escalates to KILL on owned SSH handles.
  The Host never SIGKILLs the guardian while it retains cleanup responsibility.
- “Stopped” is returned only after cleanup acknowledgement and guardian close.
  Unexpected guardian exit without a receipt retains the port reservation and
  reports uncertain cleanup. It cannot silently create a replacement. This is
  conservative, not a claim that an arbitrarily SIGKILLed guardian can clean itself.
- Closing the panel or switching Sessions leaves explicit forwards running.
  Plugin disposal and Host exit stop them. No persistence or automatic reconnect.
  User-created remote services are never stopped by this feature.
- Client list reads time out in eight seconds; stale snapshots remain labeled.
  Operation errors survive refresh. Unknown creation outcomes retain their UUID
  and provide Stop rather than an automatic resubmission. Every pane pins its Session.

## Browser address and privacy

The listener is on the DSH Host, which need not be the Web browser's machine.
Even a localhost Web URL can tunnel a remote DSH Host. The native desktop scheme
is known local; Web requires explicit same-Host confirmation to enable Open.
Otherwise copy the Host loopback address and use a browser on that Host. Never
solve a mismatch with a public or LAN listener. Confirmation is pane-local.

Only base HTTP/HTTPS URLs are generated. Protocol selection does not add TLS.
No token-bearing URLs, credentials, service page content or probe payloads are
stored in forwarding records, logged, or added to model context. SSH diagnostics
are bounded and redacted. External links use `noopener noreferrer`.

## Acceptance and known boundaries

Unit/component tests cover workspace isolation, resource admission, unknown outcomes,
stop-before-create, delayed responses, stale status, error retention, local-browser
confirmation, inherited-forward suppression and alias removal. A real child-process
fixture verifies guardian parent-IPC loss, cancellation during startup and port release.
`scripts/smoke-port-forwards.mjs <alias>` opt-in acceptance uses a newly created remote
temporary directory and loopback HTTP/WebSocket server, then releases only those resources.

macOS/Linux OpenSSH control sockets are required. Windows Host, arbitrary destinations,
IPv6 targets, persistent forwards and reconnect policy are future work. Abruptly killing
the guardian itself (rather than its Host) can leave cleanup uncertain; no unsafe PID
recovery is attempted. Remote app login/TLS/browser-origin requirements remain the
application's responsibility. Native file previews, editing, completion and PTY do not
change; this release adds only an independently registered sidebar pane and service.
