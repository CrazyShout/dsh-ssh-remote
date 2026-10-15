# ADR-0008: Durable, session-authorized human file transfers

Status: implemented for 0.9.0; release acceptance is tracked separately in ROADMAP.
DSH baseline: 0.2.0-rc.2. No model file limit, SSH configuration or Desktop carrier changes.

## Flow and limits

The public sidebar owns selection/preview/start/pause/resume/cancel/per-file retry.
`sshRemoteTransfers` uses the standard `workspaceFileScope` lookup for every control
request. Existing `connection.fetch` routes carry authenticated 256 KiB HTTP chunks;
the established helper channel carries bounded base64 chunks, not whole files or
terminal output. The carrier retains its cookie, Host/Origin and streaming trust fence.

Single file and batch: **1 TiB (1,099,511,627,776 bytes)**. Two active files globally
per Host; 10,000 manifest entries, 8 MiB path data, 200-entry / 128 KiB response pages.
Multiple download roots (up to 100) use workspace-relative destination names.
Overlapping roots, case/Unicode aliases and unsafe names fail explicitly. Scans have
a 15 s budget; no truncated successful manifests. Default exclusions include `.git`,
credential directories, `.env*`, keys and common build caches. Symlinks are not traversed.
The model-facing file tool remains limited to **64 MiB**.

## Persistent protocol v1

The content-addressed installer embeds `dsh_transfer.py` into the single-file helper;
the combined bytes are covered by its normal SHA-256. `transfers.version=1` and
`persistent=true` are required capabilities. No silent fallback to an older helper.

Control methods: `identity`, `scan`/`scanClose`, `stat`, `mkdir`, `job`, `open`,
`claim`, `verify`, `renew`, `read`, `write`, `finish`, `pause`, `cancel`, `status`.
The Host provides `plan`, paginated `append`/`page`, `list`, `control` and `file`.
Durable v1 schemas are independent of plugin releases and must remain readable in 0.10.0.

Host metadata: `$DSH_HOME/ssh-transfers/v1/<job-id>/` (700; JSON files 600).
Remote metadata: `~/.local/state/dsh-ssh-remote/transfers/v1/` (700/600).
Neither stores credentials or file bodies. A durable random installation identity,
SSH alias, canonical workspace root, directory inode and immutable manifest bind a task.
Receipts are small and per-file; manifest pages are immutable. At most 64 Host jobs
and 20,000 remote receipt entries are retained; quota failures are explicit.

Remote job/file leases (45 s) and an advisory store lock fence competing executors.
Browser heartbeat renews both levels; a Host pauses its own orphaned execution after
40 s without activity. A crashed owner can temporarily prevent a new claim until
its lease expires. Reload/restart never resumes automatically: upload files must be
reselected and fully hashed; download folders must be reauthorized and checked.

Uploads use an owned no-follow same-directory staging inode. Each acknowledged
offset follows fsync and a durable receipt. A pre-write intent records an unconfirmed
tail; restart verifies the confirmed prefix before truncating only that tail.
Verification is incremental (4 MiB per call). Changed sources, staging inode swaps,
prefix corruption and changed remote identity are refused. Publication is atomic,
no-overwrite by default, or guarded by an explicitly confirmed target version.
Commit intent and exact-inode receipts reconcile unknown publication; cancellation
never claims a completed publication was undone.

Downloads use browser File System Access, not a path on the DSH Host. A nonce-marked
job folder contains closed blocks (up to 4 MiB) and per-file JSON checkpoints.
An opaque destination binding is persisted on the Host before the first data
operation; selecting a different folder is refused even when the offset is zero.
Unclosed writable streams are never a checkpoint. Resume hashes closed blocks and
compares the remote prefix before continuing. Final output is composed through a
bounded writable stream with an exclusive writer and a second target-version check.
Full SHA-256 is checked again; lost publication responses reconcile content first.
Staging plus final output can temporarily require approximately twice the file size.

## Cleanup and boundaries

Pause retains partials. Cancel removes only positively owned uncompleted staging;
completed files and created directories remain and are listed. Cleanup is bounded;
unconfirmed work stays `cleanup-pending` and can be retried. Seven idle days expire
partials when the relevant remote workspace is accessible. Remote sweeps process
100 records at a time; the Host attempts one expired job at a time. Browser cleanup
requires fresh permission for the original folder. Unknown files inside a staging
folder prevent deletion. Closed task records can be explicitly forgotten.
An empty local ownership receipt is retained until Host Forget is acknowledged;
missing staging in an unrelated directory is never proof of cleanup. Cancel stops
remote work without waiting for a new picker grant; local cleanup can be authorized later.

File System Access must be available in a secure Desktop/Chromium context. Unsupported
browsers receive a clear error: no ZIP, whole-file Blob, silent renaming or Host-local
download substitute. Browser file permissions follow the browser/OS; the plugin
does not bypass a denied picker or directory grant.

External writers can bypass advisory coordination/version checks; no absolute
cross-program atomic compare-and-swap is claimed. Transfers do not preserve remote
ownership, timestamps, executable bits on download or hard links. Upload replacement
preserves regular permission bits; new uploads use 644. No model request is sent.

## Evidence boundary

Use small real transfers, Chinese/space names and empty directories. Simulate large
offsets, 4 GiB and 1 TiB limits without creating huge/sparse files. Test interrupted
chunk/commit, disk-full, permission denial, stale identity, duplicate requests,
checksum failure, cleanup and restart. A 1 TiB size contract is **not** a TB-scale
throughput, duration or storage-performance measurement.
