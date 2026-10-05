#!/usr/bin/env python3
"""DSH remote helper protocol v1 MVP (Python 3.8+, stdlib only)."""
from __future__ import annotations

import argparse
import base64
import errno
import hashlib
import hmac
import json
import os
import platform
import pwd
import queue
import re
import secrets
import select
import selectors
import shutil
import signal as signalmod
import stat as statmod
import struct
import subprocess
import socket
import sys
import threading
import time
from collections import deque
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple

import fcntl
import termios

PROTOCOL = "1"
VERSION = "0.5.1"
MAX_FRAME = 1_048_576
MAX_READ = 64 * 1024 * 1024
MAX_INLINE_READ = 512 * 1024
MAX_WRITE = 64 * 1024 * 1024
MAX_WRITE_CHUNK = 256 * 1024
OUTPUT_LIMIT = 2 * 1024 * 1024
MAX_WORKSPACES = 64
MAX_PROCESSES = 32
MAX_READ_HANDLES = 64
MAX_WRITE_HANDLES = 16
MAX_OPERATIONS = 4096
MAX_CLEANUP_IDENTITIES = 4096
MAX_OUTSTANDING = 128
MAX_CONCURRENT = 32
MAX_SESSIONS = 16
MAX_CONNECTIONS = 64
DAEMON_SWEEP_INTERVAL = 0.5
MAX_LIST_SCAN = 100_000
ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
SENSITIVE_ENV_PATTERN = re.compile(r"KEY|PASSWORD|SECRET|TOKEN", re.IGNORECASE)
PROCESS_RESERVED = object()


def build_id() -> str:
    try:
        with open(__file__, "rb") as source: return hashlib.sha256(source.read()).hexdigest()[:16]
    except OSError:
        return hashlib.sha256((VERSION + os.path.abspath(__file__)).encode()).hexdigest()[:16]


def login_shell() -> str:
    candidates = [os.environ.get("SHELL")]
    try: candidates.append(pwd.getpwuid(os.getuid()).pw_shell)
    except (KeyError, OSError): pass
    candidates.append("/bin/sh")
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.startswith("/") and "\0" not in candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return "/bin/sh"


_BWRAP_RESULT: Any = False
_SPAWN_BROKER: Any = None
_SPAWN_BROKER_LOCK = threading.Lock()


class SpawnBroker:
    """Long-lived parent task for Popen, required by bwrap pdeath semantics."""
    def __init__(self):
        self.requests: Any = queue.Queue(maxsize=MAX_OUTSTANDING)
        self.thread = threading.Thread(target=self.run, name="dsh-helper-spawn", daemon=True)
        self.thread.start()

    def run(self) -> None:
        while True:
            function, done, box = self.requests.get()
            try: box.append((True, function()))
            except BaseException as exc: box.append((False, exc))
            finally: done.set()

    def call(self, function: Any) -> Any:
        done, box = threading.Event(), []
        self.requests.put((function, done, box)); done.wait()
        ok, value = box[0]
        if ok: return value
        raise value


def spawn_in_broker(function: Any) -> Any:
    global _SPAWN_BROKER
    with _SPAWN_BROKER_LOCK:
        if _SPAWN_BROKER is None: _SPAWN_BROKER = SpawnBroker()
        broker = _SPAWN_BROKER
    return broker.call(function)


def bwrap_available() -> Optional[str]:
    global _BWRAP_RESULT
    if _BWRAP_RESULT is not False: return _BWRAP_RESULT
    candidate = shutil.which("bwrap") if platform.system() == "Linux" else None
    if candidate:
        probe_fd = -1
        try:
            probe_fd = os.open(os.path.realpath(os.path.expanduser("~")), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            probe = subprocess.run([candidate, "--die-with-parent", "--unshare-pid", "--ro-bind", "/", "/",
                                    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
                                    "--dir", "/tmp/dsh-helper-probe", "--bind-fd", str(probe_fd),
                                    "/tmp/dsh-helper-probe", "--", "/bin/true"],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   pass_fds=(probe_fd,), timeout=2, check=False)
            candidate = candidate if probe.returncode == 0 else None
        except (OSError, subprocess.SubprocessError): candidate = None
        finally:
            if probe_fd >= 0:
                try: os.close(probe_fd)
                except OSError: pass
    _BWRAP_RESULT = candidate
    return candidate


def valid_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or ID_PATTERN.fullmatch(value) is None:
        raise RpcError("E_INVALID_PARAMS", field + " must match [A-Za-z0-9._:-]{1,128}")
    return value


class RpcError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False, data: Any = None):
        super().__init__(message)
        self.code, self.message, self.retryable, self.data = code, message, retryable, data


def fail_os(exc: OSError) -> RpcError:
    code = {
        errno.ENOENT: "E_NOT_FOUND", errno.EEXIST: "E_EXISTS",
        errno.EACCES: "E_PERMISSION_DENIED", errno.EPERM: "E_PERMISSION_DENIED",
        errno.ELOOP: "E_SYMLINK", errno.ENOTDIR: "E_NOT_DIRECTORY",
        errno.EISDIR: "E_NOT_FILE", errno.ENOSPC: "E_NO_SPACE",
    }.get(exc.errno, "E_IO")
    return RpcError(code, exc.strerror or str(exc), code == "E_IO")


def capture_environment_probe(argv: List[str], env: Optional[Dict[str, str]] = None) -> Tuple[str, Optional[str]]:
    """Bound diagnostic subprocess output and lifetime, without shell interpolation."""
    child = spawn_in_broker(lambda: subprocess.Popen(
        argv, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True,
    ))
    assert child.stdout is not None
    output = bytearray(); deadline = time.monotonic() + 5
    selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
    error = None
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0: error = "search probe timed out"; break
            if not selector.select(remaining): error = "search probe timed out"; break
            chunk = os.read(child.stdout.fileno(), min(4096, 8193 - len(output)))
            if not chunk: break
            output.extend(chunk)
            if len(output) > 8192: error = "search probe output exceeded limit"; break
        if error is None:
            try: child.wait(timeout=max(0.01, deadline-time.monotonic()))
            except subprocess.TimeoutExpired: error = "search probe timed out"
    finally:
        selector.close(); child.stdout.close()
        if error is not None:
            try: os.killpg(child.pid, signalmod.SIGKILL)
            except OSError: pass
        try: child.wait(timeout=1)
        except subprocess.TimeoutExpired: pass
    return output.decode("utf-8", "replace"), error


def check_environment() -> Dict[str, Any]:
    """Probe the same login-shell PATH as search, with bounded output/time."""
    command = "p=$(command -v rg) || exit 127; printf '__DSH_RG_PATH__%s\\n' \"$p\"; rg --version 2>/dev/null | head -n 1"
    output, error = capture_environment_probe(["sh", "-lc", command])
    if error is not None: return {"search": {"available": False, "error": error}}
    lines = output.splitlines()
    path = next((line[len("__DSH_RG_PATH__"):] for line in lines if line.startswith("__DSH_RG_PATH__")), None)
    version = next((line for line in lines if line.startswith("ripgrep ")), None)
    if not path or not version: return {"search": {"available": False, "error": "ripgrep is not available in the remote login-shell PATH"}}
    return {"search": {"available": True, "path": path[:1024], "version": version[:256]}}


def process_environment(supplied: Any = None) -> Dict[str, str]:
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith("DSH_") and SENSITIVE_ENV_PATTERN.search(key) is None}
    if supplied is not None:
        if not isinstance(supplied, dict): raise RpcError("E_INVALID_PARAMS", "env must be an object")
        for key, value in supplied.items():
            if not isinstance(key, str) or not isinstance(value, str) or "\0" in key + value or "=" in key:
                raise RpcError("E_INVALID_PARAMS", "invalid environment entry")
            env[key] = value
    return env


def resolve_executable(params: Dict[str, Any]) -> Dict[str, str]:
    command = params.get("command")
    if not isinstance(command, str) or not command or "\0" in command or len(command) > 4096:
        raise RpcError("E_INVALID_PARAMS", "command must be a non-empty executable path or PATH name")
    if not os.path.isabs(command) and "/" in command:
        raise RpcError("E_INVALID_PARAMS", "relative executable paths have no resolution base")
    env = process_environment(params.get("env"))
    if params.get("login", False) and not os.path.isabs(command):
        # The bundled-ripgrep seam executes through sh -lc. Keep this explicit
        # lookup mode separate from the helper's direct-process environment.
        script = "p=$(command -v \"$1\") || exit 127; printf '__DSH_EXECUTABLE__%s\\n' \"$p\""
        output, error = capture_environment_probe(["sh", "-lc", script, "dsh-executable-lookup", command], env)
        if error is not None: raise RpcError("E_ENVIRONMENT_PROBE", error, True)
        candidates = [line[len("__DSH_EXECUTABLE__"):] for line in output.splitlines() if line.startswith("__DSH_EXECUTABLE__")]
        candidate = os.path.expanduser(candidates[-1]) if candidates else None
    else:
        candidate = command if os.path.isabs(command) else shutil.which(command, path=env.get("PATH", os.defpath))
    if candidate is None or not os.path.isfile(candidate) or not os.access(candidate, os.X_OK):
        raise RpcError("E_EXECUTABLE_NOT_FOUND", "executable is not installed in the remote execution environment")
    return {"path": os.path.realpath(candidate)}


def frame(obj: Dict[str, Any]) -> bytes:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode() + b"\n"
    if len(raw) > MAX_FRAME:
        raise RpcError("E_FRAME_TOO_LARGE", "response exceeds 1 MiB")
    return raw


def read_frame(stream: Any) -> Optional[Dict[str, Any]]:
    raw = stream.readline(MAX_FRAME + 1)
    if not raw:
        return None
    if len(raw) > MAX_FRAME or not raw.endswith(b"\n"):
        raise RpcError("E_FRAME_TOO_LARGE", "request exceeds 1 MiB")
    try:
        obj = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RpcError("E_INVALID_FRAME", "request is not valid UTF-8 JSON") from exc
    if not isinstance(obj, dict) or obj.get("dshRpc") != PROTOCOL:
        raise RpcError("E_INVALID_FRAME", "missing dshRpc protocol marker")
    return obj


def path_parts(path: Any) -> List[str]:
    if not isinstance(path, str) or "\0" in path or path.startswith("/"):
        raise RpcError("E_INVALID_PATH", "workspace path must be relative")
    out: List[str] = []
    for part in path.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            raise RpcError("E_OUTSIDE_ROOT", "path escapes workspace root")
        try: encoded = part.encode("utf-8")
        except UnicodeEncodeError as exc: raise RpcError("E_PATH_ENCODING", "paths must be valid UTF-8") from exc
        if len(encoded) > 255:
            raise RpcError("E_INVALID_PATH", "path component is too long")
        out.append(part)
    return out


def kind(st: os.stat_result) -> str:
    if statmod.S_ISREG(st.st_mode): return "file"
    if statmod.S_ISDIR(st.st_mode): return "directory"
    if statmod.S_ISLNK(st.st_mode): return "symlink"
    return "other"


def meta(st: os.stat_result, version: Optional[str] = None) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "type": kind(st), "size": st.st_size, "mode": statmod.S_IMODE(st.st_mode),
        "uid": st.st_uid, "gid": st.st_gid,
        "mtimeNs": st.st_mtime_ns, "ctimeNs": st.st_ctime_ns,
    }
    if version is not None: result["version"] = version
    return result


def stat_version(st: os.stat_result) -> str:
    payload = {"dev": st.st_dev, "ino": st.st_ino, "size": st.st_size,
               "mode": statmod.S_IMODE(st.st_mode), "mtimeNs": st.st_mtime_ns, "ctimeNs": st.st_ctime_ns}
    token = base64.urlsafe_b64encode(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).decode().rstrip("=")
    return "s1:" + token


def version_for(fd: int, data: bytes, before: os.stat_result) -> str:
    return version_for_digest(fd, hashlib.sha256(data).hexdigest(), before)


def version_for_digest(fd: int, digest: str, before: os.stat_result) -> str:
    after = os.fstat(fd)
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
    if any(getattr(before, x) != getattr(after, x) for x in fields):
        raise RpcError("E_CHANGED_DURING_READ", "file changed while it was read", True)
    payload = {
        "dev": before.st_dev, "ino": before.st_ino, "size": before.st_size,
        "mtimeNs": before.st_mtime_ns, "ctimeNs": before.st_ctime_ns,
        "sha256": digest,
    }
    token = base64.urlsafe_b64encode(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).decode().rstrip("=")
    return "v1:" + token


def strong_version_fd(fd: int, maximum: int = MAX_WRITE) -> Tuple[os.stat_result, str]:
    before = os.fstat(fd)
    if not statmod.S_ISREG(before.st_mode): raise RpcError("E_NOT_FILE", "target is not a regular file")
    if before.st_size > maximum: raise RpcError("E_TOO_LARGE", "file exceeds strong-version limit")
    os.lseek(fd, 0, os.SEEK_SET); digest = hashlib.sha256(); total = 0
    while True:
        chunk = os.read(fd, 65536)
        if not chunk: break
        total += len(chunk)
        if total > maximum: raise RpcError("E_TOO_LARGE", "file exceeds strong-version limit")
        digest.update(chunk)
    return before, version_for_digest(fd, digest.hexdigest(), before)


class Workspace:
    def __init__(self, path: str, access: str):
        if access not in ("read-only", "workspace-write", "danger-full-access"):
            raise RpcError("E_INVALID_PARAMS", "invalid workspace access")
        if not os.path.isabs(path): raise RpcError("E_INVALID_PATH", "workspace root must be absolute")
        self.path = os.path.realpath(path)
        try: self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        except OSError as exc: raise fail_os(exc)
        self.access = access

    def close(self) -> None:
        if self.fd >= 0: os.close(self.fd); self.fd = -1

    def dirfd(self, parts: List[str]) -> int:
        fd = os.dup(self.fd)
        try:
            for part in parts:
                nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd); fd = nxt
            return fd
        except OSError as exc:
            os.close(fd); raise fail_os(exc)

    def parent(self, path: Any) -> Tuple[int, str, List[str]]:
        parts = path_parts(path)
        return self.dirfd(parts[:-1]), parts[-1] if parts else "", parts

    def open_file(self, path: Any) -> int:
        parent, name, _ = self.parent(path)
        try:
            if not name: raise RpcError("E_NOT_FILE", "workspace root is not a file")
            return os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
        except OSError as exc: raise fail_os(exc)
        finally: os.close(parent)


class Server:
    def __init__(self, server_id: Optional[str] = None, resume_supported: bool = False):
        self.workspaces: Dict[str, Workspace] = {}
        self.operations: Dict[str, Tuple[str, Dict[str, Any], float]] = {}
        self.path_locks: Dict[str, threading.Lock] = {}
        self.path_lock_refs: Dict[str, int] = {}
        self.operation_locks: Dict[str, threading.Lock] = {}
        self.resources_lock = threading.RLock()
        self.cleanup_lock = threading.RLock()
        self.closed_resources: Dict[Tuple[str, str], Tuple[Dict[str, Any], float]] = {}
        self.cancelled_processes: Dict[str, float] = {}
        self.released_processes: Dict[str, Dict[str, Any]] = {}
        self.read_handles: Dict[str, Dict[str, Any]] = {}
        self.write_handles: Dict[str, Dict[str, Any]] = {}
        self.processes: Dict[str, "ProcessRecord"] = {}
        self.initialized = False; self.resume_supported = resume_supported; self.resume_next = False
        self.client_id: Optional[str] = None; self.detached_at: Optional[float] = None; self.attached = False
        self.retention_ms = 600000 if resume_supported else 0
        self.started = time.monotonic()
        self.server_id = server_id or secrets.token_hex(16); self.session_id = secrets.token_hex(16)
        self.resume_token = secrets.token_urlsafe(32)

    def capabilities(self) -> Dict[str, Any]:
        return {
            "filesystem": {
                "confinement": "dirfd-no-follow", "internalSymlinks": False,
                "strongVersion": "sha256-stat-v1",
                "chunkedWrite": {"supported": True, "maxBytes": MAX_WRITE, "maxChunkBytes": MAX_WRITE_CHUNK},
                "guardedWrite": {"helperLinearizable": True, "externalWriterRaceFree": False,
                                 "createNoReplace": True, "durableRename": True},
            },
            "process": {"supported": True, "sandbox": "bwrap" if bwrap_available() else "none",
                        "restrictedFailClosed": True, "cwdConfinement": "dirfd-checked", "sequencedWrite": True},
            "pty": {"supported": hasattr(os, "openpty"), "resize": True, "foregroundPgid": "verified",
                    "sequencedResize": True},
            "session": {"resume": self.resume_supported},
            "environment": {"check": True, "resolveExecutable": True},
        }

    def workspace(self, params: Dict[str, Any]) -> Workspace:
        wid = params.get("workspaceId")
        with self.resources_lock:
            if not isinstance(wid, str) or wid not in self.workspaces:
                raise RpcError("E_UNKNOWN_WORKSPACE", "unknown workspace")
            return self.workspaces[wid]

    @contextmanager
    def locked_path(self, key: str):
        with self.resources_lock:
            lock = self.path_locks.setdefault(key, threading.Lock())
            self.path_lock_refs[key] = self.path_lock_refs.get(key, 0) + 1
        lock.acquire()
        try: yield
        finally:
            lock.release()
            with self.resources_lock:
                refs = self.path_lock_refs.get(key, 1) - 1
                if refs <= 0 and self.path_locks.get(key) is lock:
                    self.path_locks.pop(key, None); self.path_lock_refs.pop(key, None)
                else: self.path_lock_refs[key] = refs

    def read_bytes(self, ws: Workspace, path: Any, maximum: Any) -> Tuple[bytes, os.stat_result, str]:
        limit = MAX_READ if maximum is None else int(maximum)
        if limit < 0 or limit > MAX_READ: raise RpcError("E_INVALID_PARAMS", "invalid maxBytes")
        fd = ws.open_file(path)
        try:
            before = os.fstat(fd)
            if not statmod.S_ISREG(before.st_mode): raise RpcError("E_NOT_FILE", "target is not a regular file")
            if before.st_size > limit: raise RpcError("E_TOO_LARGE", "file exceeds maxBytes")
            chunks, total = [], 0
            while True:
                chunk = os.read(fd, min(65536, limit + 1 - total))
                if not chunk: break
                chunks.append(chunk); total += len(chunk)
                if total > limit: raise RpcError("E_TOO_LARGE", "file exceeds maxBytes")
            data = b"".join(chunks)
            return data, before, version_for(fd, data, before)
        finally: os.close(fd)

    def guarded(self, opid: Any, params: Dict[str, Any], fn: Any) -> Dict[str, Any]:
        opid = valid_id(opid, "operationId")
        digest = hashlib.sha256(json.dumps(params, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        with self.resources_lock:
            now = time.monotonic(); ttl = max(self.retention_ms / 1000, 600)
            expired = [key for key, value in self.operations.items()
                       if now-value[2] >= ttl and not self.operation_locks[key].locked()]
            for key in expired:
                del self.operations[key]; self.operation_locks.pop(key, None)
            if opid not in self.operation_locks and len(self.operation_locks) >= MAX_OPERATIONS:
                raise RpcError("E_RESOURCE_LIMIT", "operation journal is full")
            lock = self.operation_locks.setdefault(opid, threading.Lock())
        with lock:
            with self.resources_lock: old = self.operations.get(opid)
            if old:
                if old[0] != digest: raise RpcError("E_OPERATION_CONFLICT", "operationId was reused with different params")
                return old[1]
            try: result = fn()
            except Exception:
                with self.resources_lock:
                    if opid not in self.operations and self.operation_locks.get(opid) is lock:
                        self.operation_locks.pop(opid, None)
                raise
            with self.resources_lock: self.operations[opid] = (digest, result, time.monotonic())
            return result

    def prune_cleanup(self) -> None:
        # Called with resources_lock. Live resources reserve their retirement
        # slot at allocation; expiry only drops identities outside replay TTL.
        now = time.monotonic(); ttl = max(self.retention_ms / 1000, 600)
        self.closed_resources = {key: value for key, value in self.closed_resources.items() if now-value[1] < ttl}
        self.cancelled_processes = {key: stamp for key, stamp in self.cancelled_processes.items() if now-stamp < ttl}
        self.released_processes = {key: value for key, value in self.released_processes.items() if key in self.cancelled_processes}

    def reserve_cleanup(self, kind: str, identity: str) -> None:
        self.prune_cleanup()
        if (kind, identity) in self.closed_resources:
            raise RpcError("E_RESOURCE_RETIRED", "resource identity is retained for cleanup replay; use a fresh ID")
        if len(self.closed_resources) + len(self.workspaces) + len(self.read_handles) + len(self.write_handles) >= MAX_CLEANUP_IDENTITIES:
            raise RpcError("E_RESOURCE_LIMIT", "cleanup identity capacity reached; new resource allocation refused")

    def resource_cleanup(self, kind: str, identity: Any, opid: Any, action: Any) -> Dict[str, Any]:
        identity = valid_id(identity, "resourceId"); valid_id(opid, "operationId")
        # Cleanup is lifecycle-idempotent, not an unbounded operationId stream.
        # Serializing closures does not acquire the stdin writer's lock.
        with self.cleanup_lock:
            with self.resources_lock:
                self.prune_cleanup(); old = self.closed_resources.get((kind, identity))
            if old is not None: return old[0]
            result = action()
            if result.get("closed") or result.get("aborted"):
                with self.resources_lock: self.closed_resources[(kind, identity)] = (result, time.monotonic())
            return result

    def dispatch(self, method: str, p: Dict[str, Any]) -> Dict[str, Any]:
        if method == "initialize":
            if self.initialized and not self.resume_next:
                raise RpcError("E_ALREADY_INITIALIZED", "connection is already initialized")
            proto = p.get("protocol", {"min": 1, "max": 1})
            if int(proto.get("min", 1)) > 1 or int(proto.get("max", 1)) < 1:
                raise RpcError("E_PROTOCOL_VERSION", "no compatible protocol version")
            client_id = p.get("clientId")
            client_id = valid_id(client_id, "clientId")
            if self.client_id is not None and self.client_id != client_id: raise RpcError("E_RESUME_DENIED", "clientId does not match session")
            self.client_id = client_id; self.initialized = True; resumed = self.resume_next; self.resume_next = False
            return {"protocol": 1, "session": {"sessionId": self.session_id, "clientId": client_id,
                    "resumeToken": self.resume_token, "resumed": resumed,
                    "retentionMs": self.retention_ms, "serverEpoch": self.server_id},
                    "capabilities": self.capabilities(), "limits": protocol_limits()}
        if not self.initialized: raise RpcError("E_NOT_INITIALIZED", "initialize must be called first")
        if method == "health/ping": return {"nonce": p.get("nonce"), "ok": True}
        if method == "environment/check": return check_environment()
        if method == "environment/resolveExecutable": return resolve_executable(p)
        if method == "health/status": return {"ok": True, "home": os.path.realpath(os.path.expanduser("~")),
                "uptimeMs": int((time.monotonic()-self.started)*1000), "workspaces": len(self.workspaces),
                "processes": len(self.processes), "pathLocks": len(self.path_locks),
                "readHandles": len(self.read_handles), "writeHandles": len(self.write_handles)}
        if method == "workspace/open":
            def open_workspace() -> Dict[str, Any]:
                ws = Workspace(p.get("path"), p.get("access", "read-only")); wid = valid_id(p.get("workspaceId") or secrets.token_hex(16), "workspaceId")
                with self.cleanup_lock, self.resources_lock:
                    if len(self.workspaces) >= MAX_WORKSPACES: ws.close(); raise RpcError("E_RESOURCE_LIMIT", "workspace limit reached")
                    if wid in self.workspaces: ws.close(); raise RpcError("E_EXISTS", "workspaceId already exists")
                    try: self.reserve_cleanup("workspace", wid)
                    except Exception: ws.close(); raise
                    self.workspaces[wid] = ws
                return {"workspaceId": wid, "path": ws.path, "access": ws.access}
            return self.guarded(p.get("operationId"), p, open_workspace)
        if method == "workspace/close":
            def close_workspace() -> Dict[str, Any]:
                with self.resources_lock:
                    ws = self.workspaces.get(p.get("workspaceId"))
                    uploads = [handle for handle in self.write_handles.values() if handle.get("workspaceId") == p.get("workspaceId")]
                if ws is None: return {"closed": False}
                for handle in uploads:
                    self.resource_cleanup("write", handle["id"], p.get("operationId"), lambda h=handle: self.abort_write({"handleId": h["id"]}))
                ws.close()
                with self.resources_lock: self.workspaces.pop(p.get("workspaceId"), None)
                return {"closed": True}
            return self.resource_cleanup("workspace", p.get("workspaceId"), p.get("operationId"), close_workspace)
        if method == "fs/canonicalize":
            ws = self.workspace(p); parent, name, parts = ws.parent(p.get("path", ""))
            try:
                if name:
                    try: st = os.stat(name, dir_fd=parent, follow_symlinks=False)
                    except FileNotFoundError:
                        if not p.get("allowMissing", False): raise
                    else:
                        if statmod.S_ISLNK(st.st_mode): raise RpcError("E_SYMLINK", "symbolic links are not followed")
            except OSError as exc: raise fail_os(exc)
            finally: os.close(parent)
            return {"path": "/".join(parts), "displayPath": os.path.join(ws.path, *parts)}
        if method == "fs/stat":
            ws = self.workspace(p); parent, name, _ = ws.parent(p.get("path", ""))
            try: st = os.fstat(parent) if not name else os.stat(name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError: return {"exists": False, "metadata": None}
            except OSError as exc: raise fail_os(exc)
            finally: os.close(parent)
            if statmod.S_ISLNK(st.st_mode):
                if p.get("follow", True): raise RpcError("E_SYMLINK", "symbolic links are not followed")
                version = stat_version(st); return {"exists": True, "metadata": meta(st, version), "version": version}
            version = stat_version(st)
            return {"exists": True, "metadata": meta(st, version), "version": version}
        if method == "fs/list":
            ws = self.workspace(p); directory = ws.dirfd(path_parts(p.get("path", "")))
            try:
                limit = max(1, min(int(p.get("limit", 1000)), 1000)); entries = []; truncated = False; scanned = 0
                requested_types = p.get("types")
                if requested_types is not None:
                    if not isinstance(requested_types, list) or not all(value in ("file", "directory", "symlink", "other") for value in requested_types):
                        raise RpcError("E_INVALID_PARAMS", "types must contain file, directory, symlink, or other")
                    type_filter = set(requested_types)
                else: type_filter = None
                with os.scandir(directory) as scanner:
                    for entry in scanner:
                        scanned += 1
                        if scanned > MAX_LIST_SCAN: truncated = True; break
                        try: entry.name.encode("utf-8")
                        except UnicodeEncodeError as exc: raise RpcError("E_PATH_ENCODING", "directory contains a non-UTF-8 name") from exc
                        st = entry.stat(follow_symlinks=False)
                        if type_filter is not None and kind(st) not in type_filter: continue
                        if len(entries) >= limit: truncated = True; break
                        entries.append({"name": entry.name, "metadata": meta(st, stat_version(st))})
                if truncated and not p.get("allowTruncated", False):
                    raise RpcError("E_TOO_LARGE", "directory exceeds requested list limit")
                return {"entries": entries, "truncated": truncated, "limit": limit, "scanned": min(scanned, MAX_LIST_SCAN)}
            except OSError as exc: raise fail_os(exc)
            finally: os.close(directory)
        if method == "fs/read":
            requested = MAX_INLINE_READ if p.get("maxBytes") is None else int(p.get("maxBytes"))
            ws = self.workspace(p); data, st, version = self.read_bytes(ws, p.get("path", ""), min(requested, MAX_INLINE_READ))
            return {"encoding": "base64", "data": base64.b64encode(data).decode(), "metadata": meta(st, version),
                    "version": version, "statVersion": stat_version(st)}
        if method == "fs/readOpen":
            def open_read() -> Dict[str, Any]:
                ws = self.workspace(p); fd = ws.open_file(p.get("path", "")); st = os.fstat(fd)
                if not statmod.S_ISREG(st.st_mode): os.close(fd); raise RpcError("E_NOT_FILE", "target is not a regular file")
                hid = valid_id(p.get("handleId") or secrets.token_hex(16), "handleId")
                with self.cleanup_lock, self.resources_lock:
                    if len(self.read_handles) >= MAX_READ_HANDLES: os.close(fd); raise RpcError("E_RESOURCE_LIMIT", "read handle limit reached")
                    if hid in self.read_handles: os.close(fd); raise RpcError("E_EXISTS", "read handle already exists")
                    try: self.reserve_cleanup("read", hid)
                    except Exception: os.close(fd); raise
                    self.read_handles[hid] = {"fd": fd, "before": st, "hash": hashlib.sha256(), "seq": 0,
                                              "done": False, "last": None, "lock": threading.Lock()}
                return {"handleId": hid, "metadata": meta(st)}
            return self.guarded(p.get("operationId"), p, open_read)
        if method == "fs/readNext":
            with self.resources_lock: handle = self.read_handles.get(p.get("handleId"))
            if handle is None: raise RpcError("E_UNKNOWN_HANDLE", "unknown read handle")
            with handle["lock"]:
                try: after = handle["seq"] if p.get("afterSeq") is None else int(p.get("afterSeq"))
                except (TypeError, ValueError) as exc: raise RpcError("E_INVALID_PARAMS", "afterSeq must be an integer string") from exc
                if after == handle["seq"] - 1 and handle["last"] is not None: return dict(handle["last"])
                if after != handle["seq"]: raise RpcError("E_CURSOR", "read cursor does not match handle position")
                if handle["done"] and handle["last"] is not None: return dict(handle["last"])
                maximum = max(1, min(int(p.get("maxBytes", 65536)), 256 * 1024))
                data = os.read(handle["fd"], maximum); handle["seq"] += 1
                if data: handle["hash"].update(data)
                result = {"seq": str(handle["seq"]), "encoding": "base64", "data": base64.b64encode(data).decode(), "eof": not data}
                if not data and not handle["done"]:
                    result["version"] = version_for_digest(handle["fd"], handle["hash"].hexdigest(), handle["before"])
                    result["statVersion"] = stat_version(handle["before"]); handle["done"] = True
                handle["last"] = dict(result)
                return result
        if method == "fs/close":
            def close_read() -> Dict[str, Any]:
                with self.resources_lock: handle = self.read_handles.get(p.get("handleId"))
                if handle is None: return {"closed": False}
                with handle["lock"]:
                    os.close(handle["fd"])
                    with self.resources_lock: self.read_handles.pop(p.get("handleId"), None)
                return {"closed": True}
            return self.resource_cleanup("read", p.get("handleId"), p.get("operationId"), close_read)
        if method == "fs/writeOpen": return self.guarded(p.get("operationId"), p, lambda: self.open_write(p))
        if method == "fs/writeChunk": return self.guarded(p.get("operationId"), p, lambda: self.write_chunk(p))
        if method == "fs/writeCommit": return self.guarded(p.get("operationId"), p, lambda: self.commit_write(p))
        if method == "fs/writeAbort": return self.resource_cleanup("write", p.get("handleId"), p.get("operationId"), lambda: self.abort_write(p))
        if method == "fs/mkdir":
            ws = self.workspace(p)
            if ws.access == "read-only": raise RpcError("E_PERMISSION_DENIED", "workspace is read-only")
            def make() -> Dict[str, Any]:
                parts = path_parts(p.get("path", "")); fd = os.dup(ws.fd)
                try:
                    for i, part in enumerate(parts):
                        try: nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        except FileNotFoundError:
                            if not p.get("recursive", False) and i != len(parts)-1: raise
                            os.mkdir(part, int(p.get("mode", 0o755)), dir_fd=fd)
                            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        os.close(fd); fd = nxt
                    os.fsync(fd); return {"created": True, "path": "/".join(parts)}
                except OSError as exc: raise fail_os(exc)
                finally: os.close(fd)
            return self.guarded(p.get("operationId"), p, make)
        if method == "fs/write": return self.write(p)
        if method == "process/start": return self.guarded(p.get("operationId"), p, lambda: self.start_process(p))
        if method == "process/read": return self.process(p).read(p)
        if method in ("process/write", "process/resize"):
            if "afterSeq" in p:
                record = self.process(p)
                lane, action = (record.write_lane, record.write) if method == "process/write" else (record.resize_lane, record.resize)
                return lane.apply(p, action)
            return self.guarded(p.get("operationId"), p, lambda: getattr(self.process(p), method.split("/")[1])(p))
        if method == "process/status": return self.process(p).status()
        if method == "process/inspectForeground": return self.process(p).inspect_foreground()
        if method == "process/signal": return self.guarded(p.get("operationId"), p, lambda: self.process(p).send_signal(p))
        if method == "process/terminate":
            valid_id(p.get("operationId"), "operationId")
            with self.resources_lock:
                process_id = valid_id(p.get("processId"), "processId")
                record = self.processes.get(process_id)
                if record is None or record is PROCESS_RESERVED:
                    self.prune_cleanup()
                    if process_id in self.released_processes: return {"running": False}
                    self.cancel_allocation(process_id)
                    if record is None: raise RpcError("E_UNKNOWN_PROCESS", "unknown process; pending allocation identity cancelled")
                    return {"running": True, "starting": True, "cancellationScheduled": True}
            return record.terminate(bool(p.get("force", False)), int(p.get("graceMs", 2000)))
        if method == "process/release":
            valid_id(p.get("operationId"), "operationId")
            with self.cleanup_lock:
                with self.resources_lock:
                    process_id = valid_id(p.get("processId"), "processId")
                    self.prune_cleanup()
                    if process_id in self.released_processes: return self.released_processes[process_id]
                    record = self.processes.get(process_id)
                    if record is None or record is PROCESS_RESERVED:
                        self.cancel_allocation(process_id)
                        if record is None: raise RpcError("E_UNKNOWN_PROCESS", "unknown process; pending allocation identity cancelled")
                        raise RpcError("E_PROCESS_STARTING", "cancelled process allocation is still starting", True)
                result = record.release()
                with self.resources_lock:
                    self.cancel_allocation(process_id)
                    self.released_processes[process_id] = result
                    self.processes.pop(process_id, None)
                return result
        raise RpcError("E_METHOD_NOT_FOUND", "unknown method")

    def write(self, p: Dict[str, Any]) -> Dict[str, Any]:
        ws = self.workspace(p)
        if ws.access == "read-only": raise RpcError("E_PERMISSION_DENIED", "workspace is read-only")
        try: data = base64.b64decode(p.get("data", ""), validate=True)
        except Exception as exc: raise RpcError("E_INVALID_PARAMS", "data is not valid base64") from exc
        intent = p.get("intent", {"kind": "overwrite"}); ikind = intent.get("kind")
        if ikind not in ("overwrite", "create-if-absent", "replace-if-version"):
            raise RpcError("E_INVALID_PARAMS", "invalid write intent")
        def commit() -> Dict[str, Any]:
            parent, name, _ = ws.parent(p.get("path", ""))
            if not name: os.close(parent); raise RpcError("E_NOT_FILE", "cannot replace workspace root")
            key = f"{os.fstat(parent).st_dev}:{os.fstat(parent).st_ino}:{name}"
            with self.locked_path(key):
                tmp = ".dsh-write-" + secrets.token_hex(12); tfd = -1
                try:
                    existing_mode = int(p.get("mode", 0o644)); current = None
                    try:
                        cfd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
                        try:
                            st = os.fstat(cfd)
                            if not statmod.S_ISREG(st.st_mode): raise RpcError("E_NOT_FILE", "target is not a regular file")
                            existing_mode = statmod.S_IMODE(st.st_mode)
                            chunks, total = [], 0
                            while True:
                                chunk = os.read(cfd, 65536)
                                if not chunk: break
                                chunks.append(chunk); total += len(chunk)
                                if total > MAX_READ: raise RpcError("E_TOO_LARGE", "target exceeds guarded-write limit")
                            current = version_for(cfd, b"".join(chunks), st)
                        finally: os.close(cfd)
                    except FileNotFoundError: pass
                    if ikind == "create-if-absent" and current is not None: raise RpcError("E_EXISTS", "target exists")
                    expected = intent.get("version")
                    observed = stat_version(st) if current is not None and isinstance(expected, str) and expected.startswith("s1:") else current
                    if ikind == "replace-if-version" and observed != expected:
                        raise RpcError("E_STALE_VERSION", "target version changed")
                    tfd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
                    view = memoryview(data)
                    while view: view = view[os.write(tfd, view):]
                    os.fchmod(tfd, existing_mode & 0o777); os.fsync(tfd); os.close(tfd); tfd = -1
                    if ikind == "replace-if-version":
                        _, check_st, check_strong = self.read_bytes(ws, p.get("path", ""), MAX_READ)
                        check = stat_version(check_st) if isinstance(expected, str) and expected.startswith("s1:") else check_strong
                        if check != expected: raise RpcError("E_STALE_VERSION", "target version changed")
                    if ikind == "create-if-absent": os.link(tmp, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False); os.unlink(tmp, dir_fd=parent)
                    else: os.replace(tmp, name, src_dir_fd=parent, dst_dir_fd=parent)
                    os.fsync(parent)
                    result_data, st2, version = self.read_bytes(ws, p.get("path", ""), MAX_READ)
                    return {"written": len(result_data), "operation": "create" if current is None else "update",
                            "version": version, "statVersion": stat_version(st2), "metadata": meta(st2, version)}
                except OSError as exc: raise fail_os(exc)
                finally:
                    if tfd >= 0: os.close(tfd)
                    try: os.unlink(tmp, dir_fd=parent)
                    except OSError: pass
                    os.close(parent)
        return self.guarded(p.get("operationId"), p, commit)

    def write_handle(self, p: Dict[str, Any]) -> Dict[str, Any]:
        hid = valid_id(p.get("handleId"), "handleId")
        with self.resources_lock: handle = self.write_handles.get(hid)
        if handle is None: raise RpcError("E_UNKNOWN_HANDLE", "unknown write handle")
        return handle

    def open_write(self, p: Dict[str, Any]) -> Dict[str, Any]:
        ws = self.workspace(p)
        if ws.access == "read-only": raise RpcError("E_PERMISSION_DENIED", "workspace is read-only")
        intent = p.get("intent", {"kind": "overwrite"}); intent_kind = intent.get("kind") if isinstance(intent, dict) else None
        if intent_kind not in ("overwrite", "create-if-absent", "replace-if-version"):
            raise RpcError("E_INVALID_PARAMS", "invalid write intent")
        hid = valid_id(p.get("handleId"), "handleId"); parent, name, _ = ws.parent(p.get("path", ""))
        if not name: os.close(parent); raise RpcError("E_NOT_FILE", "cannot replace workspace root")
        try: requested_mode = int(p.get("mode", 0o644))
        except (TypeError, ValueError) as exc: os.close(parent); raise RpcError("E_INVALID_PARAMS", "mode must be an integer") from exc
        if requested_mode < 0 or requested_mode > 0o777: os.close(parent); raise RpcError("E_INVALID_PARAMS", "mode must be between 0 and 0777")
        temporary = ".dsh-upload-" + secrets.token_hex(12); fd = -1
        try:
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            handle = {"id": hid, "workspaceId": p.get("workspaceId"), "fd": fd, "parent": parent, "name": name, "temporary": temporary,
                      "intent": dict(intent), "mode": requested_mode, "seq": 0, "total": 0,
                      "hash": hashlib.sha256(), "last": None, "lastDigest": None,
                      "lock": threading.Lock(), "closed": False}
            with self.cleanup_lock, self.resources_lock:
                if self.workspaces.get(p.get("workspaceId")) is not ws:
                    raise RpcError("E_UNKNOWN_WORKSPACE", "workspace closed while upload was opening")
                if len(self.write_handles) >= MAX_WRITE_HANDLES: raise RpcError("E_RESOURCE_LIMIT", "write handle limit reached")
                if hid in self.write_handles: raise RpcError("E_EXISTS", "write handle already exists")
                self.reserve_cleanup("write", hid)
                self.write_handles[hid] = handle
            return {"handleId": hid, "seq": "0", "maxChunkBytes": MAX_WRITE_CHUNK, "maxBytes": MAX_WRITE}
        except Exception:
            if fd >= 0:
                try: os.close(fd)
                except OSError: pass
            try: os.unlink(temporary, dir_fd=parent)
            except OSError: pass
            os.close(parent); raise

    def write_chunk(self, p: Dict[str, Any]) -> Dict[str, Any]:
        handle = self.write_handle(p)
        try: data = base64.b64decode(p.get("data", ""), validate=True)
        except Exception as exc: raise RpcError("E_INVALID_PARAMS", "data is not valid base64") from exc
        if len(data) > MAX_WRITE_CHUNK: raise RpcError("E_TOO_LARGE", "write chunk exceeds maxChunkBytes")
        with handle["lock"]:
            if handle["closed"]: raise RpcError("E_UNKNOWN_HANDLE", "write handle is closed")
            try: after = handle["seq"] if p.get("afterSeq") is None else int(p.get("afterSeq"))
            except (TypeError, ValueError) as exc: raise RpcError("E_INVALID_PARAMS", "afterSeq must be an integer string") from exc
            digest = hashlib.sha256(data).hexdigest()
            if after == handle["seq"] - 1 and handle["last"] is not None:
                if digest != handle["lastDigest"]: raise RpcError("E_CURSOR", "replayed chunk differs from cached chunk")
                return dict(handle["last"])
            if after != handle["seq"]: raise RpcError("E_CURSOR", "write cursor does not match handle position")
            if handle["total"] + len(data) > MAX_WRITE: raise RpcError("E_TOO_LARGE", "upload exceeds maxWriteBytes")
            view = memoryview(data)
            while view: view = view[os.write(handle["fd"], view):]
            handle["hash"].update(data); handle["total"] += len(data); handle["seq"] += 1
            result = {"seq": str(handle["seq"]), "written": len(data), "totalBytes": handle["total"]}
            handle["last"], handle["lastDigest"] = dict(result), digest
            return result

    def commit_write(self, p: Dict[str, Any]) -> Dict[str, Any]:
        handle = self.write_handle(p)
        with handle["lock"]:
            if handle["closed"]: raise RpcError("E_UNKNOWN_HANDLE", "write handle is closed")
            parent, name, intent = handle["parent"], handle["name"], handle["intent"]
            key = f"{os.fstat(parent).st_dev}:{os.fstat(parent).st_ino}:{name}"
            with self.locked_path(key): return self.commit_write_locked(handle, parent, name, intent)

    def commit_write_locked(self, handle: Dict[str, Any], parent: int, name: str, intent: Dict[str, Any]) -> Dict[str, Any]:
        current, current_st, exists = None, None, False
        intent_kind, expected = intent.get("kind"), intent.get("version")
        try:
            current_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                current_st = os.fstat(current_fd)
                if not statmod.S_ISREG(current_st.st_mode): raise RpcError("E_NOT_FILE", "target is not a regular file")
                exists = True
                if intent_kind == "replace-if-version" and isinstance(expected, str) and expected.startswith("v1:"):
                    current_st, current = strong_version_fd(current_fd)
                else: current = stat_version(current_st)
            finally: os.close(current_fd)
        except FileNotFoundError: pass
        except OSError as exc: raise fail_os(exc)
        if intent_kind == "create-if-absent" and exists: raise RpcError("E_EXISTS", "target exists")
        if intent_kind == "replace-if-version" and current != expected: raise RpcError("E_STALE_VERSION", "target version changed")
        mode = statmod.S_IMODE(current_st.st_mode) if current_st is not None else int(handle["mode"])
        os.fchmod(handle["fd"], mode & 0o777); os.fsync(handle["fd"]); os.close(handle["fd"]); handle["fd"] = -1
        try:
            if intent_kind == "create-if-absent":
                os.link(handle["temporary"], name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
                os.unlink(handle["temporary"], dir_fd=parent)
            else: os.replace(handle["temporary"], name, src_dir_fd=parent, dst_dir_fd=parent)
            os.fsync(parent)
            final_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
            try: final_st, version = strong_version_fd(final_fd)
            finally: os.close(final_fd)
            result = {"operation": "create" if not exists else "update", "written": handle["total"],
                      "sha256": handle["hash"].hexdigest(), "version": version,
                      "statVersion": stat_version(final_st), "metadata": meta(final_st, version)}
        except (OSError, RpcError) as exc:
            # Publishing may have happened before an fsync/version error. Once
            # this upload is cleaned up its ID must still be retired: an old
            # abort cannot be allowed to target a replacement with the same ID.
            self.cleanup_write_handle(handle)
            with self.resources_lock:
                self.write_handles.pop(handle["id"], None)
                self.closed_resources[("write", handle["id"])] = ({"aborted": False, "commitOutcome": "unconfirmed"}, time.monotonic())
            if isinstance(exc, OSError): raise fail_os(exc)
            raise
        handle["closed"] = True
        with self.resources_lock:
            self.write_handles.pop(handle["id"], None)
            self.closed_resources[("write", handle["id"])] = ({"aborted": False, "committed": True}, time.monotonic())
        os.close(parent); handle["parent"] = -1
        return result

    def abort_write(self, p: Dict[str, Any]) -> Dict[str, Any]:
        handle = self.write_handle(p)
        with handle["lock"]:
            # Commit may have completed while this abort waited for the handle.
            # Its terminal outcome must not become a fictitious successful abort.
            with self.resources_lock: retired = self.closed_resources.get(("write", handle["id"]))
            if retired is not None: return retired[0]
            if handle.get("closed"):
                if handle.get("cleanupError"): raise RpcError("E_CLEANUP_FAILED", handle["cleanupError"])
                raise RpcError("E_UNKNOWN_HANDLE", "write handle closed without a retained abort outcome")
            self.cleanup_write_handle(handle)
            with self.resources_lock: self.write_handles.pop(handle["id"], None)
            return {"aborted": True}

    @staticmethod
    def cleanup_write_handle(handle: Dict[str, Any]) -> None:
        if handle.get("closed"):
            if handle.get("cleanupError"): raise RpcError("E_CLEANUP_FAILED", handle["cleanupError"])
            return
        handle["closed"] = True; fd, parent = handle.get("fd", -1), handle.get("parent", -1)
        errors = []
        if fd >= 0:
            try: os.close(fd)
            except OSError as exc: errors.append(exc)
        if parent >= 0:
            try: os.unlink(handle["temporary"], dir_fd=parent)
            except FileNotFoundError: pass
            except OSError as exc: errors.append(exc)
            try: os.close(parent)
            except OSError as exc: errors.append(exc)
        handle["fd"], handle["parent"] = -1, -1
        if errors:
            handle["cleanupError"] = str(len(errors)) + " upload cleanup operations were not confirmed"
            raise RpcError("E_CLEANUP_FAILED", handle["cleanupError"])

    def cancel_allocation(self, process_id: str) -> None:
        # A cancel can reach a worker BEFORE start reserves its slot. Retain
        # the caller-minted identity even for an unknown process, so a delayed
        # start can never allocate after cleanup reported that identity absent.
        self.prune_cleanup(); now = time.monotonic()
        identities = self.cancelled_processes.keys() | self.processes.keys()
        if process_id not in identities and len(identities) >= MAX_CLEANUP_IDENTITIES:
            raise RpcError("E_RESOURCE_LIMIT", "cancelled process identity limit reached")
        self.cancelled_processes[process_id] = now

    def process(self, p: Dict[str, Any]) -> "ProcessRecord":
        with self.resources_lock: record = self.processes.get(p.get("processId"))
        if record is None: raise RpcError("E_UNKNOWN_PROCESS", "unknown process")
        if record is PROCESS_RESERVED: raise RpcError("E_PROCESS_STARTING", "process is still starting", True)
        return record

    def start_process(self, p: Dict[str, Any]) -> Dict[str, Any]:
        ws = self.workspace(p); argv = p.get("argv")
        if not isinstance(argv, list) or not argv or not all(isinstance(x, str) and "\0" not in x for x in argv):
            raise RpcError("E_INVALID_PARAMS", "argv must be a non-empty string array")
        process_id = p.get("processId") or secrets.token_hex(16)
        process_id = valid_id(process_id, "processId")
        parts = path_parts(p.get("cwd", "")); cwd_fd = ws.dirfd(parts); os.close(cwd_fd)
        cwd = os.path.join(ws.path, *parts); command = list(argv); inherited_fds: Tuple[int, ...] = (); workspace_under_tmp = False
        if ws.access != "danger-full-access":
            bwrap = bwrap_available()
            if not bwrap: raise RpcError("E_SANDBOX_UNAVAILABLE", "bwrap is required for restricted remote execution")
            command = [bwrap, "--die-with-parent", "--unshare-pid", "--ro-bind", "/", "/",
                       "--proc", "/proc", "--dev", "/dev"]
            if ws.access == "workspace-write":
                command += ["--tmpfs", "/tmp"]
                if ws.path == "/tmp" or ws.path.startswith("/tmp/"):
                    workspace_under_tmp = True
                    command += ["--dir", ws.path, "--bind-fd", "__DSH_WORKSPACE_FD__", ws.path]
                else: command += ["--bind", ws.path, ws.path]
            command += ["--chdir", cwd, "--"] + list(argv); cwd = "/"
        supplied: Dict[str, Any] = {}
        for source_name in ("env", "dshEnv"):
            source = p.get(source_name, {})
            if not isinstance(source, dict): raise RpcError("E_INVALID_PARAMS", source_name + " must be an object")
            supplied.update(source)
        tty = p.get("tty"); stdin_mode = p.get("stdin", "pipe")
        if stdin_mode not in ("pipe", "closed"): raise RpcError("E_INVALID_PARAMS", "stdin must be pipe or closed")
        if isinstance(tty, dict) and stdin_mode != "pipe": raise RpcError("E_INVALID_PARAMS", "PTY stdin cannot start closed")
        with self.resources_lock:
            self.prune_cleanup()
            if process_id in self.cancelled_processes: raise RpcError("E_PROCESS_CANCELLED", "process allocation was cancelled")
            if len(self.cancelled_processes.keys() | self.processes.keys()) >= MAX_CLEANUP_IDENTITIES:
                raise RpcError("E_RESOURCE_LIMIT", "cleanup identity capacity reached; new process allocation refused")
            if len(self.processes) >= MAX_PROCESSES: raise RpcError("E_RESOURCE_LIMIT", "process limit reached")
            if process_id in self.processes: raise RpcError("E_EXISTS", "processId already exists")
            self.processes[process_id] = PROCESS_RESERVED
        try:
            if workspace_under_tmp:
                workspace_fd = os.dup(ws.fd); inherited_fds = (workspace_fd,)
                command = [str(workspace_fd) if value == "__DSH_WORKSPACE_FD__" else value for value in command]
            record = ProcessRecord(process_id, command, cwd, supplied, tty, stdin_mode, inherited_fds,
                                   inside_sandbox=ws.access != "danger-full-access")
        except Exception:
            with self.resources_lock:
                if self.processes.get(process_id) is PROCESS_RESERVED: self.processes.pop(process_id, None)
            raise
        finally:
            for inherited_fd in inherited_fds:
                try: os.close(inherited_fd)
                except OSError: pass
        with self.resources_lock:
            session_closed = self.processes.get(process_id) is not PROCESS_RESERVED
            cancelled = process_id in self.cancelled_processes
            if not session_closed: self.processes[process_id] = record
        if session_closed:
            record.release(); raise RpcError("E_SESSION_CLOSED", "session closed while process was starting")
        if cancelled:
            # Retain a failed-cleanup record for a subsequent release retry.
            record.release()
            with self.resources_lock:
                if self.processes.get(process_id) is record: self.processes.pop(process_id, None)
            raise RpcError("E_PROCESS_CANCELLED", "process allocation was cancelled during startup")
        result = record.status(); result["access"] = ws.access
        result["stdin"] = stdin_mode
        result["sandbox"] = {"mode": ws.access, "enforcement": "full",
                             "backend": "none" if ws.access == "danger-full-access" else "bwrap"}
        return result

    def close(self) -> None:
        with self.resources_lock:
            handles = list(self.read_handles.values()); self.read_handles.clear()
            write_handles = list(self.write_handles.values()); self.write_handles.clear()
            processes = [value for value in self.processes.values() if value is not PROCESS_RESERVED]; self.processes.clear()
            workspaces = list(self.workspaces.values()); self.workspaces.clear()
        errors = []
        for handle in handles:
            try: os.close(handle["fd"])
            except OSError as exc: errors.append(exc)
        for handle in write_handles:
            try: self.cleanup_write_handle(handle)
            except Exception as exc: errors.append(exc)
        for process in processes:
            try: process.release()
            except Exception as exc: errors.append(exc)
        for ws in workspaces:
            try: ws.close()
            except Exception as exc: errors.append(exc)
        if errors: raise RpcError("E_CLEANUP_FAILED", str(len(errors)) + " remote resources could not be cleanly released")


class SupervisorChannel:
    """Private control plane; task output never enters these framed messages."""
    def __init__(self, endpoint: socket.socket, event: Any):
        self.endpoint, self.event = endpoint, event
        self.endpoint.setblocking(False)
        self.lock, self.write_lock = threading.Lock(), threading.Lock()
        self.pending: Dict[int, Any] = {}; self.sequence = 0; self.error: Optional[Exception] = None

    def start(self) -> None:
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        selector = selectors.DefaultSelector()
        try:
            selector.register(self.endpoint, selectors.EVENT_READ); buffered = b""
            while True:
                if not selector.select(0.2):
                    if self.endpoint.fileno() < 0: raise RpcError("E_SUPERVISOR_CLOSED", "remote process supervisor closed")
                    continue
                try: chunk = self.endpoint.recv(65536)
                except BlockingIOError: continue
                if not chunk: raise RpcError("E_SUPERVISOR_CLOSED", "remote process supervisor closed")
                buffered += chunk
                while b"\n" in buffered:
                    line, buffered = buffered.split(b"\n", 1)
                    if len(line) > 65536: raise RpcError("E_SUPERVISOR_PROTOCOL", "invalid supervisor frame")
                    message = json.loads(line)
                    if "event" in message: self.event(message); continue
                    with self.lock: pending = self.pending.pop(message.get("id"), None)
                    if pending is not None: pending[1].append(message); pending[0].set()
                if len(buffered) > 65536: raise RpcError("E_SUPERVISOR_PROTOCOL", "invalid supervisor frame")
        except Exception as exc:
            with self.lock:
                self.error = exc; pending = list(self.pending.values()); self.pending.clear()
            for done, box in pending: box.append({"error": {"code": "E_SUPERVISOR_CLOSED", "message": "remote process supervisor closed"}}); done.set()
            self.event({"event": "closed"})
        finally: selector.close()

    def call(self, method: str, params: Optional[Dict[str, Any]] = None, timeout: float = 5) -> Dict[str, Any]:
        deadline = time.monotonic() + timeout
        done, box = threading.Event(), []
        with self.lock:
            if self.error is not None: raise RpcError("E_SUPERVISOR_CLOSED", "remote process supervisor closed")
            self.sequence += 1; rid = self.sequence; self.pending[rid] = (done, box)
        try:
            raw = json.dumps({"id": rid, "method": method, "params": params or {}}).encode() + b"\n"
            if len(raw) > 65536: raise RpcError("E_INVALID_PARAMS", "process supervisor request is too large")
            if not self.write_lock.acquire(timeout=max(0, deadline-time.monotonic())):
                raise RpcError("E_SUPERVISOR_TIMEOUT", "process supervisor write queue timed out")
            selector = selectors.DefaultSelector(); sent = 0
            try:
                selector.register(self.endpoint, selectors.EVENT_WRITE)
                while sent < len(raw):
                    remaining = deadline-time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        if sent: self.close()  # Never leave a partial frame queued.
                        raise RpcError("E_SUPERVISOR_TIMEOUT", "process supervisor send timed out")
                    try: count = self.endpoint.send(raw[sent:])
                    except BlockingIOError: continue
                    if count <= 0: raise RpcError("E_SUPERVISOR_CLOSED", "process supervisor closed while sending")
                    sent += count
            finally: selector.close(); self.write_lock.release()
            if not done.wait(max(0, deadline-time.monotonic())): raise RpcError("E_SUPERVISOR_TIMEOUT", "remote process supervisor did not respond")
            result = box[0]
            if "error" in result: raise RpcError(result["error"]["code"], result["error"]["message"])
            return result["result"]
        except OSError as exc: raise fail_os(exc)
        finally:
            with self.lock: self.pending.pop(rid, None)

    def close(self) -> None:
        try: self.endpoint.shutdown(socket.SHUT_RDWR)
        except OSError: pass
        self.endpoint.close()


class InputLane:
    """One acknowledged input mutation in flight; no time-based replay eviction."""
    def __init__(self):
        self.lock = threading.Lock(); self.next_seq = 0
        self.digest: Optional[str] = None; self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[Tuple[str, str, bool, Any]] = None

    def apply(self, params: Dict[str, Any], action: Any) -> Dict[str, Any]:
        valid_id(params.get("operationId"), "operationId")
        cursor = params.get("afterSeq")
        if not isinstance(cursor, str) or re.fullmatch(r"0|[1-9][0-9]{0,15}", cursor) is None or int(cursor) >= 2**53 - 1:
            raise RpcError("E_INVALID_PARAMS", "afterSeq must be a canonical non-negative safe integer string")
        seq = int(cursor)
        digest = hashlib.sha256(json.dumps(params, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        with self.lock:
            if seq == self.next_seq - 1:
                if digest != self.digest: raise RpcError("E_OPERATION_CONFLICT", "input cursor was reused with different params")
            elif seq == self.next_seq:
                # The next cursor acknowledges the previous outcome. Replacing
                # that single replay slot is safe: older cursors stay rejected.
                self.digest = digest; self.result = None; self.error = None
                try:
                    self.result = dict(action(params), nextSeq=str(seq + 1))
                except RpcError as exc:
                    # A write may have reached stdin only partially. Even errors
                    # must be retained; never execute the same cursor twice.
                    self.error = (exc.code, exc.message, exc.retryable, exc.data)
                except Exception:
                    self.error = ("E_INTERNAL", "input mutation outcome failed; this cursor cannot be replayed", False, None)
                self.next_seq += 1
            else:
                raise RpcError("E_CURSOR", "input cursor is stale or skips an unacknowledged mutation")
            # Store values, never a raised exception/traceback that would retain
            # an entire write payload (and grow on every replay of that error).
            if self.error is not None: raise RpcError(*self.error)
            assert self.result is not None
            return self.result


class ProcessRecord:
    def __init__(self, process_id: str, argv: List[str], cwd: str, supplied_env: Any, tty: Any,
                 stdin_mode: str, inherited_fds: Tuple[int, ...] = (), inside_sandbox: bool = False):
        self.process_id, self.tty = process_id, isinstance(tty, dict)
        self.lock, self.changed = threading.Lock(), threading.Condition(threading.Lock())
        self.pty_lock = threading.Lock()
        self.chunks: Any = deque(); self.bytes = 0; self.seq = 0; self.earliest = 1
        self.returncode: Optional[int] = None; self.released = False; self.master: Optional[int] = None
        self.pid = 0; self.pgid = 0; self.ready = threading.Event(); self.start_error: Optional[RpcError] = None
        self.supervisor_closed = False; self.release_lock = threading.Lock()
        self.release_error: Optional[str] = None
        self.terminate_lock = threading.Lock(); self.terminate_results: Dict[bool, Dict[str, Any]] = {}
        self.io_stopping = threading.Event(); self.write_cancelled = threading.Event()
        self.write_lane, self.resize_lane = InputLane(), InputLane()
        self.reader_threads: List[threading.Thread] = []
        self.stdin: Any = None; self.stdout_stream: Any = None; self.stderr_stream: Any = None
        self.readers = 1 if self.tty else 2
        env = process_environment(supplied_env)
        endpoint, remote_endpoint = socket.socketpair()
        self.control = SupervisorChannel(endpoint, self._supervisor_event)
        slave: Optional[int] = None
        launch_fds: List[int] = []; payload_fds: Tuple[int, ...] = ()
        try:
            if self.tty:
                master, slave = os.openpty(); self.master = master
                os.set_blocking(master, False)
                self._resize(int(tty.get("rows", 24)), int(tty.get("cols", 80)))
                if isinstance(tty.get("term"), str): env["TERM"] = tty["term"]
                if inside_sandbox: payload_fds = (slave, slave, slave)
            elif inside_sandbox:
                if stdin_mode == "closed": stdin_fd = os.open(os.devnull, os.O_RDONLY)
                else:
                    stdin_fd, stdin_write = os.pipe(); self.stdin = os.fdopen(stdin_write, "wb", buffering=0)
                    os.set_blocking(stdin_write, False)
                stdout_read, stdout_write = os.pipe(); stderr_read, stderr_write = os.pipe()
                self.stdout_stream = os.fdopen(stdout_read, "rb", buffering=0)
                self.stderr_stream = os.fdopen(stderr_read, "rb", buffering=0)
                payload_fds = (stdin_fd, stdout_write, stderr_write); launch_fds = list(payload_fds)
            runner = [sys.executable, os.path.abspath(__file__), "supervise-exec",
                      "--control-fd", str(remote_endpoint.fileno())]
            if self.tty: runner += ["--tty-master-fd", str(self.master)]
            if inside_sandbox:
                split = argv.index("--")
                inner = [sys.executable, os.path.abspath(__file__), "supervise-exec", "--control-fd", "3"]
                if self.tty: inner += ["--tty-master-fd", "4"]
                inner += ["--stdio-fds", "5,6,7"]
                # Bubblewrap preserves explicitly inherited descriptors. Do
                # not add --preserve-fds: supported releases such as 0.6.1 do
                # not recognize that option (it belongs to other runtimes).
                sandbox = argv[:split] + ["--"] + inner + ["--"] + argv[split + 1:]
                runner = [sys.executable, os.path.abspath(__file__), "sandbox-exec", "--control-fd",
                          str(remote_endpoint.fileno())]
                if self.tty: runner += ["--tty-master-fd", str(self.master)]
                runner += ["--stdio-fds", ",".join(str(fd) for fd in payload_fds)]
                runner += ["--"] + sandbox
            else: runner += ["--"] + argv
            if self.tty:
                self.child = spawn_in_broker(lambda: subprocess.Popen(
                    runner, cwd=cwd, env=env,
                    stdin=subprocess.DEVNULL if inside_sandbox else slave,
                    stdout=subprocess.DEVNULL if inside_sandbox else slave,
                    stderr=subprocess.DEVNULL if inside_sandbox else slave,
                    pass_fds=tuple(set((remote_endpoint.fileno(), master) + payload_fds + inherited_fds)), close_fds=True,
                ))
                os.close(slave); slave = None; self.stdin = None
                self._start_reader(master, "pty")
            else:
                child_stdin: Any = subprocess.DEVNULL if stdin_mode == "closed" else subprocess.PIPE
                self.child = spawn_in_broker(lambda: subprocess.Popen(
                    runner, cwd=cwd, env=env, stdin=subprocess.DEVNULL if inside_sandbox else child_stdin,
                    stdout=subprocess.DEVNULL if inside_sandbox else subprocess.PIPE,
                    stderr=subprocess.DEVNULL if inside_sandbox else subprocess.PIPE,
                    pass_fds=tuple(set((remote_endpoint.fileno(),) + payload_fds + inherited_fds)), close_fds=True, bufsize=0,
                ))
                if not inside_sandbox:
                    self.stdin = self.child.stdin
                    self.stdout_stream, self.stderr_stream = self.child.stdout, self.child.stderr
                for fd in launch_fds: os.close(fd)
                launch_fds.clear()
                if self.stdin is not None: os.set_blocking(self.stdin.fileno(), False)
                assert self.stdout_stream is not None and self.stderr_stream is not None
                self._start_reader(self.stdout_stream.fileno(), "stdout")
                self._start_reader(self.stderr_stream.fileno(), "stderr")
            remote_endpoint.close(); self.control.start()
            if not self.ready.wait(15): raise RpcError("E_SUPERVISOR_TIMEOUT", "remote process startup timed out")
            if self.start_error is not None: raise self.start_error
            if self.pid <= 0: raise RpcError("E_SUPERVISOR_CLOSED", "remote process supervisor closed during startup")
        except Exception as exc:
            remote_endpoint.close(); self.control.close()
            self.io_stopping.set()
            for reader in self.reader_threads: reader.join(0.5)
            for fd in launch_fds:
                try: os.close(fd)
                except OSError: pass
            for stream in (self.stdin, self.stdout_stream, self.stderr_stream):
                if stream is not None:
                    try: stream.close()
                    except OSError: pass
            if slave is not None:
                try: os.close(slave)
                except OSError: pass
            if self.master is not None:
                try: os.close(self.master)
                except OSError: pass
            if hasattr(self, "child"):
                try: self.child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.child.kill(); self.child.wait(timeout=2)
            if isinstance(exc, OSError): raise fail_os(exc)
            raise

    def _supervisor_event(self, message: Dict[str, Any]) -> None:
        event = message.get("event")
        if event == "ready":
            self.pid, self.pgid = message["pid"], message["pgid"]; self.ready.set()
        elif event == "error":
            self.start_error = RpcError(message["code"], message["message"]); self.ready.set()
        elif event == "exit":
            with self.changed: self.returncode = message["returncode"]; self.changed.notify_all()
        elif event == "closed":
            self.supervisor_closed = True; self.ready.set()
            with self.changed: self.changed.notify_all()

    def _start_reader(self, fd: int, stream: str) -> None:
        thread = threading.Thread(target=self._reader_fd, args=(fd, stream), daemon=True)
        self.reader_threads.append(thread); thread.start()

    def _reader_fd(self, fd: int, stream: str) -> None:
        selector = selectors.DefaultSelector()
        try:
            os.set_blocking(fd, False); selector.register(fd, selectors.EVENT_READ)
            while not self.io_stopping.is_set():
                if not selector.select(0.1): continue
                if self.io_stopping.is_set(): break
                try: data = os.read(fd, 65536)
                except BlockingIOError: continue
                except OSError as exc:
                    if exc.errno in (errno.EIO, errno.EBADF): break
                    break
                if not data: break
                with self.changed:
                    self.seq += 1; self.chunks.append((self.seq, stream, data)); self.bytes += len(data)
                    while self.bytes > OUTPUT_LIMIT and self.chunks:
                        old = self.chunks.popleft(); self.bytes -= len(old[2]); self.earliest = old[0] + 1
                    self.changed.notify_all()
        finally:
            selector.close()
            with self.changed:
                self.readers -= 1
                self.changed.notify_all()

    def status(self) -> Dict[str, Any]:
        code = self.returncode
        if self.supervisor_closed and code is None and not self.released:
            raise RpcError("E_SUPERVISOR_CLOSED", "remote process supervisor exited before reporting task completion")
        signal_name = None
        if code is not None and code < 0:
            try: signal_name = signalmod.Signals(-code).name
            except ValueError: signal_name = f"SIG{-code}"
        return {"processId": self.process_id, "pid": self.pid, "pgid": self.pgid, "tty": self.tty,
                "running": code is None, "exitCode": code if code is not None and code >= 0 else None,
                "signal": signal_name, "latestSeq": str(self.seq)}

    def read(self, p: Dict[str, Any]) -> Dict[str, Any]:
        try: after = int(p.get("afterSeq", 0)); maximum = max(1, min(int(p.get("maxBytes", 65536)), 512 * 1024)); wait = max(0, min(int(p.get("waitMs", 0)), 30000))
        except (TypeError, ValueError) as exc: raise RpcError("E_INVALID_PARAMS", "invalid read cursor") from exc
        with self.changed:
            if not any(seq > after for seq, _, _ in self.chunks) and (self.returncode is None or self.readers > 0) and wait:
                self.changed.wait(wait / 1000)
            selected, used, next_seq = [], 0, after
            for seq, stream, data in self.chunks:
                if seq <= after: continue
                if selected and used + len(data) > maximum: break
                selected.append({"seq": str(seq), "stream": stream, "data": base64.b64encode(data).decode()})
                used += len(data); next_seq = seq
                if used >= maximum: break
            status = self.status()
            output_closed = self.returncode is not None and self.readers == 0 and next_seq >= self.seq
            return {"chunks": selected, "earliestSeq": str(self.earliest), "nextSeq": str(next_seq),
                    "truncated": after < self.earliest - 1, "exited": output_closed, "closed": output_closed,
                    "exitCode": status["exitCode"], "signal": status["signal"]}

    def write(self, p: Dict[str, Any]) -> Dict[str, Any]:
        try: data = base64.b64decode(p.get("data", ""), validate=True)
        except Exception as exc: raise RpcError("E_INVALID_PARAMS", "data is not valid base64") from exc
        with self.lock:
            if self.released or self.write_cancelled.is_set(): raise RpcError("E_STDIN_CLOSED", "stdin is closed by process cleanup")
            if self.returncode is not None: raise RpcError("E_PROCESS_EXITED", "process has exited")
            try:
                if self.tty:
                    assert self.master is not None; target_fd = self.master
                else:
                    if self.stdin is None: raise RpcError("E_STDIN_CLOSED", "stdin is closed")
                    target_fd = self.stdin.fileno()
                view = memoryview(data); written = 0
                selector = selectors.DefaultSelector(); selector.register(target_fd, selectors.EVENT_WRITE)
                try:
                    while view:
                        if self.write_cancelled.is_set(): raise RpcError("E_STDIN_CLOSED", "stdin write cancelled by process cleanup")
                        if not selector.select(0.05): continue
                        try: count = os.write(target_fd, view[:65536])
                        except BlockingIOError: continue
                        if count <= 0: raise RpcError("E_STDIN_CLOSED", "stdin write made no progress")
                        written += count; view = view[count:]
                finally: selector.close()
                if p.get("eof", False):
                    if self.tty: raise RpcError("E_NOT_SUPPORTED", "PTY stdin cannot be half-closed")
                    assert self.stdin is not None; self.stdin.close(); self.stdin = None
            except (BrokenPipeError, OSError, ValueError) as exc: raise RpcError("E_STDIN_CLOSED", str(exc))
            return {"written": written, "eof": bool(p.get("eof", False))}

    def _resize(self, rows: int, cols: int) -> None:
        if not (1 <= rows <= 10000 and 1 <= cols <= 10000): raise RpcError("E_INVALID_PARAMS", "invalid terminal size")
        if self.master is None: raise RpcError("E_NOT_PTY", "process has no PTY")
        fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def resize(self, p: Dict[str, Any]) -> Dict[str, Any]:
        # Pin the master FD against release without waiting on a blocked stdin
        # write. The per-lane lock orders replay, not descriptor lifetime.
        with self.pty_lock:
            if self.released: raise RpcError("E_PROCESS_EXITED", "process has been released")
            self._resize(int(p.get("rows")), int(p.get("cols"))); return {"resized": True}

    def inspect_foreground(self) -> Dict[str, Any]:
        if self.master is None: raise RpcError("E_NOT_PTY", "process has no PTY")
        return self.control.call("foreground")

    def send_signal(self, p: Dict[str, Any]) -> Dict[str, Any]:
        return self.control.call("signal", {"signal": p.get("signal", "SIGTERM"), "target": p.get("target", "group"),
                                            "denyOwnShellKill": p.get("denyOwnShellKill") is True})

    def terminate(self, force: bool = False, grace_ms: int = 2000) -> Dict[str, Any]:
        with self.terminate_lock:
            if self.released:
                if self.release_error is not None: raise RpcError("E_CLEANUP_FAILED", self.release_error)
                return {"running": False}
            if not force and True in self.terminate_results: return {"running": False}
            if force in self.terminate_results: return self.terminate_results[force]
            self.write_cancelled.set()
            result = self.control.call("terminate", {"force": force, "graceMs": min(max(grace_ms, 0), 30000)})
            self.terminate_results[force] = result
            return result

    def release(self) -> Dict[str, Any]:
        # Serialize releases separately from potentially blocked stdin writes.
        with self.release_lock:
            if self.released:
                if self.release_error is not None: raise RpcError("E_CLEANUP_FAILED", self.release_error)
                return {"released": False}
            self.write_cancelled.set()
            errors = []
            try:
                if not self.supervisor_closed:
                    try: self.control.call("release", timeout=4)
                    except Exception as exc: errors.append(exc)
                # EOF asks a live supervisor to clean up even if its response
                # was lost. If it crashed, the guardian sees its own EOF.
                self.control.close()
                try: self.child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    # Never guess an unowned PGID. Killing this exact owned
                    # supervisor triggers guardian EOF; killing bwrap tears
                    # down its private PID namespace.
                    self.child.kill()
                    try: self.child.wait(timeout=2)
                    except subprocess.TimeoutExpired: errors.append(RpcError("E_CLEANUP_TIMEOUT", "process supervisor did not exit after release"))
            finally:
                self.control.close()
                self.io_stopping.set()
                for reader in self.reader_threads: reader.join(0.5)
                readers_stopped = all(not reader.is_alive() for reader in self.reader_threads)
                if not readers_stopped: errors.append(RpcError("E_CLEANUP_TIMEOUT", "process output readers did not stop"))
                acquired = self.lock.acquire(timeout=2)
                if not acquired: errors.append(RpcError("E_CLEANUP_TIMEOUT", "remote stdin writer did not stop after cancellation"))
                try:
                    with self.pty_lock:
                        if errors: self.release_error = str(len(errors)) + " process cleanup operations were not confirmed"
                        self.released = True; master, stdin = self.master, self.stdin
                        self.master, self.stdin = None, None
                        if master is not None and readers_stopped:
                            try: os.close(master)
                            except OSError: pass
                    if stdin is not None:
                        try: stdin.close()
                        except (OSError, ValueError): pass
                    for stream in (self.stdout_stream, self.stderr_stream) if readers_stopped else ():
                        if stream is not None:
                            try: stream.close()
                            except (OSError, ValueError): pass
                finally:
                    if acquired: self.lock.release()
            if self.release_error is not None: raise RpcError("E_CLEANUP_FAILED", self.release_error)
            return {"released": True}


class DaemonState:
    def __init__(self, idle_timeout: float):
        self.server_id = secrets.token_hex(16); self.sessions: Dict[str, Server] = {}
        self.lock = threading.Lock(); self.shutdown = threading.Event(); self.idle_timeout = idle_timeout
        self.last_activity = time.monotonic(); self.connections = 0
        self.next_sweep = self.last_activity + DAEMON_SWEEP_INTERVAL

    def open_connection(self) -> bool:
        with self.lock:
            if self.connections >= MAX_CONNECTIONS: return False
            self.connections += 1; self.last_activity = time.monotonic(); return True

    def close_connection(self) -> None:
        with self.lock:
            self.connections = max(0, self.connections - 1); self.last_activity = time.monotonic()

    def acquire(self, params: Dict[str, Any]) -> Server:
        client_id = params.get("clientId")
        client_id = valid_id(client_id, "clientId")
        with self.lock:
            server = self.sessions.get(client_id)
            if server is None:
                if params.get("resumeToken") not in (None, ""):
                    raise RpcError("E_RESUME_DENIED", "session does not exist")
                if len(self.sessions) >= MAX_SESSIONS: raise RpcError("E_RESOURCE_LIMIT", "daemon session limit reached", True)
                server = Server(self.server_id, True); server.client_id = client_id
                requested = int(params.get("retentionMs", 600000))
                server.retention_ms = max(30000, min(requested, 3600000)); self.sessions[client_id] = server
            else:
                token = params.get("resumeToken")
                if not isinstance(token, str) or not hmac.compare_digest(token, server.resume_token):
                    raise RpcError("E_RESUME_DENIED", "invalid resume token")
                if server.attached: raise RpcError("E_SESSION_ACTIVE", "session is already attached", True)
                server.resume_next = True
            server.attached = True; server.detached_at = None; self.last_activity = time.monotonic(); return server

    def detach(self, server: Optional[Server]) -> None:
        if server is None: return
        with self.lock:
            server.attached = False; server.detached_at = time.monotonic(); self.last_activity = time.monotonic()

    def remove(self, server: Server) -> None:
        with self.lock:
            if server.client_id is not None and self.sessions.get(server.client_id) is server:
                del self.sessions[server.client_id]
        server.close()

    def sweep(self) -> None:
        now, expired = time.monotonic(), []
        with self.lock:
            for key, server in self.sessions.items():
                if not server.attached and server.detached_at is not None and (now-server.detached_at)*1000 >= server.retention_ms:
                    expired.append((key, server))
            for key, _ in expired: del self.sessions[key]
        for _, server in expired:
            try: server.close()
            except RpcError: print("dsh remote helper: expired session cleanup was incomplete", file=sys.stderr)
        with self.lock:
            if not self.sessions and not self.connections and time.monotonic()-self.last_activity >= self.idle_timeout:
                self.shutdown.set()

    def sweep_if_due(self) -> None:
        # Called on every accept-loop iteration, including admission failures.
        # A busy stream of new connections must not postpone detached-session GC.
        now = time.monotonic()
        with self.lock:
            if now < self.next_sweep: return
            self.next_sweep = now + DAEMON_SWEEP_INTERVAL
        self.sweep()


def hello(server_id: str, resume: bool) -> Dict[str, Any]:
    probe = Server(server_id, resume)
    return {"dshRpc": PROTOCOL, "method": "server/hello", "params": {
        "protocol": {"min": 1, "max": 1}, "helperVersion": VERSION, "buildId": build_id(),
        "serverInstanceId": server_id, "serverEpoch": server_id,
        "platform": {"system": platform.system(), "release": platform.release(), "machine": platform.machine(),
                     "python": platform.python_version(), "home": os.path.realpath(os.path.expanduser("~")),
                     "shell": login_shell()},
        "capabilities": probe.capabilities(), "limits": protocol_limits()}}


def protocol_limits() -> Dict[str, int]:
    return {"maxFrameBytes": MAX_FRAME, "maxReadBytes": MAX_READ, "maxInlineReadBytes": MAX_INLINE_READ,
            "maxWriteBytes": MAX_WRITE,
            "maxWriteChunkBytes": MAX_WRITE_CHUNK, "maxWorkspaces": MAX_WORKSPACES,
            "maxProcesses": MAX_PROCESSES, "maxReadHandles": MAX_READ_HANDLES,
            "maxWriteHandles": MAX_WRITE_HANDLES,
            "maxCleanupIdentities": MAX_CLEANUP_IDENTITIES,
            "maxOperations": MAX_OPERATIONS, "maxOutstanding": MAX_OUTSTANDING, "maxConcurrent": MAX_CONCURRENT,
            "maxSessions": MAX_SESSIONS, "maxConnections": MAX_CONNECTIONS,
            "maxProcessOutputBytes": OUTPUT_LIMIT, "maxListEntries": 1000, "maxListScan": MAX_LIST_SCAN}


def serve_protocol(input_stream: Any, output: Any, state: Optional[DaemonState] = None) -> None:
    server: Optional[Server] = None if state else Server()
    server_id = state.server_id if state else server.server_id
    output_lock, workers_lock = threading.Lock(), threading.Lock(); workers: Any = set()
    dispatch_slots = threading.BoundedSemaphore(MAX_CONCURRENT)

    def send(response: Dict[str, Any]) -> None:
        try:
            try: raw = frame(response)
            except RpcError as exc:
                raw = frame({"dshRpc": PROTOCOL, "id": response.get("id"),
                             "error": {"code": exc.code, "message": exc.message, "retryable": False}})
            with output_lock: output.write(raw); output.flush()
        except (BrokenPipeError, OSError, ValueError): pass

    def response_for(target: Server, request: Dict[str, Any]) -> Dict[str, Any]:
        rid, method = request.get("id"), request.get("method")
        try:
            params = request.get("params", {})
            if not isinstance(params, dict): raise RpcError("E_INVALID_PARAMS", "params must be an object")
            result = target.dispatch(method, params)
            return {"dshRpc": PROTOCOL, "id": rid, "result": result}
        except RpcError as exc:
            err = {"code": exc.code, "message": exc.message, "retryable": exc.retryable}
            if exc.data is not None: err["data"] = exc.data
            return {"dshRpc": PROTOCOL, "id": rid, "error": err}
        except Exception as exc:
            debug = os.environ.get("DSH_REMOTE_HELPER_DEBUG") == "1"
            return {"dshRpc": PROTOCOL, "id": rid, "error": {"code": "E_INTERNAL", "message": "internal helper error", "retryable": False,
                    **({"data": {"method": method, "type": type(exc).__name__, "detail": str(exc)[:500]}} if debug else {})}}

    def run_request(target: Server, request: Dict[str, Any]) -> None:
        try:
            with dispatch_slots: send(response_for(target, request))
        finally:
            with workers_lock: workers.discard(threading.current_thread())

    send(hello(server_id, state is not None))
    try:
        while True:
            try: request = read_frame(input_stream)
            except RpcError as exc:
                send({"dshRpc": PROTOCOL, "id": None, "error": {"code": exc.code, "message": exc.message, "retryable": exc.retryable}}); break
            if request is None: break
            if "id" not in request: continue
            rid, method = request.get("id"), request.get("method")
            if method == "initialize":
                try:
                    params = request.get("params", {})
                    if not isinstance(params, dict): raise RpcError("E_INVALID_PARAMS", "params must be an object")
                    if state is not None:
                        if server is not None: raise RpcError("E_ALREADY_INITIALIZED", "connection is already initialized")
                        server = state.acquire(params)
                    assert server is not None
                    send(response_for(server, request))
                except RpcError as exc:
                    send({"dshRpc": PROTOCOL, "id": rid, "error": {"code": exc.code, "message": exc.message, "retryable": exc.retryable}})
                continue
            if server is None:
                send({"dshRpc": PROTOCOL, "id": rid, "error": {"code": "E_NOT_INITIALIZED", "message": "initialize must be called first", "retryable": False}}); continue
            if method in ("admin/shutdown", "session/close"):
                with workers_lock: pending = list(workers)
                for worker in pending: worker.join(30)
                if method == "admin/shutdown":
                    if state is None or os.environ.get("DSH_REMOTE_HELPER_ALLOW_SHUTDOWN") != "1":
                        send({"dshRpc": PROTOCOL, "id": rid, "error": {"code": "E_PERMISSION_DENIED", "message": "shutdown is disabled", "retryable": False}})
                    else: send({"dshRpc": PROTOCOL, "id": rid, "result": {"shuttingDown": True}}); state.shutdown.set()
                else:
                    if state is None: send({"dshRpc": PROTOCOL, "id": rid, "error": {"code": "E_UNSUPPORTED", "message": "direct session cannot be resumed", "retryable": False}})
                    else:
                        try: state.remove(server)
                        except RpcError as exc:
                            send({"dshRpc": PROTOCOL, "id": rid, "error": {"code": exc.code, "message": exc.message, "retryable": False}})
                        else: send({"dshRpc": PROTOCOL, "id": rid, "result": {"closed": True}})
                        finally: server = None
                continue
            with workers_lock:
                overloaded = len(workers) >= MAX_OUTSTANDING
            if overloaded:
                send({"dshRpc": PROTOCOL, "id": rid, "error": {"code": "E_BUSY", "message": "too many outstanding requests", "retryable": True,
                      "data": {"retryAfterMs": 100}}}); continue
            worker = threading.Thread(target=run_request, args=(server, request), daemon=True)
            with workers_lock: workers.add(worker)
            worker.start()
    finally:
        if state is not None: state.detach(server)
        with workers_lock: pending = list(workers)
        for worker in pending: worker.join(31)
        if state is None and server is not None: server.close()


def runtime_socket(explicit: Optional[str]) -> str:
    if explicit:
        path = os.path.abspath(explicit); base = os.path.dirname(path)
        os.makedirs(base, mode=0o700, exist_ok=True); info = os.stat(base)
        if info.st_uid != os.getuid() or statmod.S_IMODE(info.st_mode) & 0o077:
            raise RpcError("E_PERMISSION_DENIED", "explicit socket directory must be owned by the user and mode 0700")
        return path
    else:
        base = os.environ.get("DSH_REMOTE_HELPER_RUNTIME_DIR") or os.environ.get("XDG_RUNTIME_DIR")
        if base: base = os.path.join(base, "dsh-remote-helper")
        else: base = os.path.join("/tmp", "dsh-remote-helper-" + str(os.getuid()))
        path = os.path.join(base, "daemon-" + build_id() + ".sock")
        if len(path.encode()) >= 100:
            suffix = hashlib.sha256(base.encode()).hexdigest()[:12]
            base = os.path.join("/tmp", f"dsh-rh-{os.getuid()}-{suffix}")
            path = os.path.join(base, "d-" + build_id() + ".sock")
    os.makedirs(base, mode=0o700, exist_ok=True)
    if os.stat(base).st_uid != os.getuid(): raise RpcError("E_PERMISSION_DENIED", "runtime directory has the wrong owner")
    os.chmod(base, 0o700); return path


def socket_connect(path: str) -> socket.socket:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); client.connect(path); return client


def ensure_daemon(path: str) -> None:
    try: socket_connect(path).close(); return
    except OSError: pass
    lock_path = path + ".lock"; lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        try: socket_connect(path).close(); return
        except OSError: pass
        env = os.environ.copy(); env["PYTHONDONTWRITEBYTECODE"] = "1"
        subprocess.Popen([sys.executable, os.path.abspath(__file__), "daemon", "--socket", path], env=env,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, close_fds=True)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try: socket_connect(path).close(); return
            except OSError: time.sleep(0.05)
        raise RpcError("E_DAEMON_START", "remote helper daemon did not start")
    finally: os.close(lock_fd)


def proxy_stdio(path: str) -> int:
    ensure_daemon(path); remote = socket_connect(path); remote.setblocking(False)
    selector = selectors.DefaultSelector(); selector.register(remote, selectors.EVENT_READ); selector.register(sys.stdin.buffer, selectors.EVENT_READ)
    stdin_open = True
    try:
        while True:
            for key, _ in selector.select():
                if key.fileobj is remote:
                    try: data = remote.recv(65536)
                    except BlockingIOError: continue
                    if not data: return 0
                    sys.stdout.buffer.write(data); sys.stdout.buffer.flush()
                else:
                    data = os.read(sys.stdin.fileno(), 65536)
                    if not data:
                        selector.unregister(sys.stdin.buffer); stdin_open = False
                        try: remote.shutdown(socket.SHUT_WR)
                        except OSError: pass
                    else:
                        remote.setblocking(True)
                        try: remote.sendall(data)
                        finally: remote.setblocking(False)
            if not stdin_open and state_closed(remote): return 0
    finally: selector.close(); remote.close()


def state_closed(sock: socket.socket) -> bool:
    try: return sock.fileno() < 0
    except OSError: return True


def run_daemon(path: str, idle_timeout: float) -> int:
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    try:
        old = os.lstat(path)
        if old.st_uid != os.getuid() or not statmod.S_ISSOCK(old.st_mode):
            raise RpcError("E_PERMISSION_DENIED", "refusing to replace unsafe socket path")
        os.unlink(path)
    except FileNotFoundError: pass
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); listener.bind(path); os.chmod(path, 0o600); listener.listen(32); listener.settimeout(DAEMON_SWEEP_INTERVAL)
    state = DaemonState(idle_timeout)
    try:
        while not state.shutdown.is_set():
            state.sweep_if_due()
            if state.shutdown.is_set(): break
            try: conn, _ = listener.accept()
            except socket.timeout: continue
            if not state.open_connection():
                try: conn.sendall(frame({"dshRpc": PROTOCOL, "id": None, "error": {
                    "code": "E_RESOURCE_LIMIT", "message": "daemon connection limit reached", "retryable": True}}))
                except OSError: pass
                conn.close(); continue
            def handle(client: socket.socket) -> None:
                try:
                    with client:
                        streams = []
                        try:
                            inp = client.makefile("rb"); streams.append(inp)
                            out = client.makefile("wb"); streams.append(out)
                            serve_protocol(inp, out, state)
                        finally:
                            for stream in streams:
                                try: stream.close()
                                except (OSError, ValueError): pass
                finally:
                    state.close_connection()
            threading.Thread(target=handle, args=(conn,), daemon=True).start()
    finally:
        listener.close()
        try: os.unlink(path)
        except FileNotFoundError: pass
        with state.lock: sessions = list(state.sessions.values()); state.sessions.clear()
        for server in sessions:
            try: server.close()
            except RpcError: print("dsh remote helper: shutdown session cleanup was incomplete", file=sys.stderr)
    return 0


def close_fds_except(keep: Any) -> None:
    """Called only in fresh single-threaded launchers and their children."""
    try: descriptors = [int(name) for name in os.listdir("/dev/fd") if name.isdigit()]
    except OSError: descriptors = range(65536)
    for fd in descriptors:
        if fd not in keep:
            try: os.close(fd)
            except OSError: pass


def returncode_for(status: int) -> int:
    return os.WEXITSTATUS(status) if os.WIFEXITED(status) else -os.WTERMSIG(status)


class ProcessSupervisor:
    """Single-threaded, namespace-local owner of one pinned process group.

    The guardian remains live or unreaped until the FINAL group signal. Darwin
    PTYs instead retain the real task's unreaped PID so its controlling session
    can end normally. Both prevent reuse rather than racing killpg(pgid, 0).
    """
    def __init__(self, control_fd: int, tty_master_fd: Optional[int]):
        self.control = socket.socket(fileno=control_fd); self.tty = tty_master_fd is not None
        self.tty_master_fd = tty_master_fd
        self.pid = 0; self.guardian = 0; self.guard_write = -1; self.code: Optional[int] = None
        self.group_owned = False; self.generation = 0; self.deadline: Optional[Tuple[int, float]] = None
        self.command_reaped = False; self.guardian_reaped = False
        self.darwin_tty = self.tty and sys.platform == "darwin"
        self.exit_queue: Any = None

    def send(self, message: Dict[str, Any]) -> None:
        self.control.sendall(json.dumps(message, separators=(",", ":")).encode() + b"\n")

    def start(self, argv: List[str]) -> None:
        # Explicit SIG_IGN can survive exec and make children auto-reap.
        # Both ownership strategies require children to remain waitable.
        signalmod.signal(signalmod.SIGCHLD, signalmod.SIG_DFL)
        if self.darwin_tty:
            self.start_darwin_tty(argv); return
        os.setsid()
        for name in ("SIGHUP", "SIGTTIN", "SIGTTOU"): signalmod.signal(getattr(signalmod, name), signalmod.SIG_IGN)
        if self.tty: fcntl.ioctl(0, termios.TIOCSCTTY, 0)
        gate_read, gate_write = os.pipe(); error_read, error_write = os.pipe()
        self.pid = os.fork()
        if self.pid == 0:
            try:
                os.setpgid(0, 0)
                close_fds_except({0, 1, 2, gate_read, error_write})
                if os.read(gate_read, 1) != b"1": os._exit(127)
                os.close(gate_read)
                for name in ("SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT", "SIGTSTP", "SIGTTIN", "SIGTTOU", "SIGPIPE"):
                    signalmod.signal(getattr(signalmod, name), signalmod.SIG_DFL)
                os.execvpe(argv[0], argv, os.environ)
            except OSError as exc:
                os.write(error_write, json.dumps({"errno": exc.errno, "message": exc.strerror}).encode())
            finally: os._exit(127)
        os.close(gate_read); os.close(error_write)
        os.setpgid(self.pid, self.pid); self.group_owned = True
        guard_read, self.guard_write = os.pipe(); ready_read, ready_write = os.pipe()
        self.guardian = os.fork()
        if self.guardian == 0:
            try:
                os.setpgid(0, self.pid)
                for name in ("SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT", "SIGTSTP", "SIGTTIN", "SIGTTOU"):
                    signalmod.signal(getattr(signalmod, name), signalmod.SIG_IGN)
                close_fds_except({guard_read, ready_write}); os.write(ready_write, b"1"); os.close(ready_write)
                # If the supervisor crashes, its pipe closes. The still-live
                # guardian can safely kill its own group without a stale ID.
                while os.read(guard_read, 1): pass
                os.killpg(os.getpgrp(), signalmod.SIGKILL)
            except OSError: pass
            finally: os._exit(0)
        os.close(guard_read); os.close(ready_write)
        if os.read(ready_read, 1) != b"1": raise RpcError("E_SUPERVISOR_START", "process group guardian did not start")
        os.close(ready_read)
        if self.tty: os.tcsetpgrp(0, self.pid)
        os.write(gate_write, b"1"); os.close(gate_write)
        error = os.read(error_read, 8192); os.close(error_read)
        if error:
            detail = json.loads(error); raise fail_os(OSError(detail.get("errno", errno.EIO), detail.get("message", "exec failed")))
        # Only the command retains the output FDs. A completed command can
        # reach EOF while the ownership guardian remains alive for cleanup.
        close_fds_except({self.control.fileno(), self.guard_write, self.tty_master_fd})
        self.send({"event": "ready", "pid": self.pid, "pgid": self.pid})

    def start_darwin_tty(self, argv: List[str]) -> None:
        # Darwin keeps /dev/tty's vnode open until the controlling session's
        # leader exits (cttyopen in XNU tty_tty.c). A long-lived supervisor as
        # that leader therefore prevents real PTY EOF, even with no slave FDs.
        # Make the actual task the session leader. Observe its exit without
        # reaping it; its owned zombie PID pins the group until the final KILL.
        os.setsid()
        for name in ("SIGHUP", "SIGTTIN", "SIGTTOU"):
            signalmod.signal(getattr(signalmod, name), signalmod.SIG_IGN)
        gate_read, gate_write = os.pipe(); error_read, error_write = os.pipe()
        guard_read, self.guard_write = os.pipe(); ready_read, ready_write = os.pipe()
        temporary = {gate_read, gate_write, error_read, error_write, guard_read, ready_read, ready_write}
        try:
            self.pid = os.fork()
            if self.pid == 0:
                try:
                    os.setsid(); fcntl.ioctl(0, termios.TIOCSCTTY, 0)
                    guard_broker = os.fork()
                    if guard_broker == 0:
                        try:
                            # Do not inject a hidden child into the exec'd
                            # user's wait()/waitpid(-1) set. The short-lived
                            # broker is reaped below; the orphan guardian only
                            # supplies crash cleanup and never pins ownership.
                            try: guardian_pid = os.fork()
                            except OSError: os._exit(127)
                            if guardian_pid != 0: os._exit(0)
                            for name in ("SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT", "SIGTSTP", "SIGTTIN", "SIGTTOU"):
                                signalmod.signal(getattr(signalmod, name), signalmod.SIG_IGN)
                            close_fds_except({guard_read, ready_write})
                            os.write(ready_write, b"1"); os.close(ready_write)
                            while os.read(guard_read, 1): pass
                            # This guardian is only crash protection. Group
                            # ownership is pinned by the task's unreaped PID.
                            os.killpg(os.getpgrp(), signalmod.SIGKILL)
                        except OSError: pass
                        finally: os._exit(0)
                    _, guard_status = os.waitpid(guard_broker, 0)
                    if guard_status != 0: raise OSError(errno.EIO, "process group guardian broker failed")
                    close_fds_except({0, 1, 2, gate_read, error_write})
                    if os.read(gate_read, 1) != b"1": os._exit(127)
                    os.close(gate_read)
                    for name in ("SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT", "SIGTSTP", "SIGTTIN", "SIGTTOU", "SIGPIPE"):
                        signalmod.signal(getattr(signalmod, name), signalmod.SIG_DFL)
                    os.execvpe(argv[0], argv, os.environ)
                except OSError as exc:
                    os.write(error_write, json.dumps({"errno": exc.errno, "message": exc.strerror}).encode())
                finally: os._exit(127)
            for fd in (gate_read, error_write, guard_read, ready_write):
                os.close(fd); temporary.remove(fd)
            self.exit_queue = select.kqueue()
            # NOTE_EXITSTATUS is defined by Darwin sys/event.h but is not
            # exported by Python 3.8/3.9 select. With NOTE_EXIT, event.data is
            # the waitpid-format status, and retrieval does NOT reap the PID.
            note_exitstatus = 0x04000000
            event = select.kevent(self.pid, filter=select.KQ_FILTER_PROC,
                                 flags=select.KQ_EV_ADD | select.KQ_EV_ENABLE | select.KQ_EV_ONESHOT,
                                 fflags=select.KQ_NOTE_EXIT | note_exitstatus)
            self.exit_queue.control([event], 0, 0)
            if os.read(ready_read, 1) != b"1":
                # The task may still be waiting behind the launch gate and
                # holding error_write. Unblock it before waiting for pipe EOF.
                os.close(gate_write); temporary.remove(gate_write)
                detail = os.read(error_read, 8192)
                if detail:
                    error = json.loads(detail); raise fail_os(OSError(error.get("errno", errno.EIO), error.get("message", "exec failed")))
                raise RpcError("E_SUPERVISOR_START", "process group guardian did not start")
            self.group_owned = True
            os.write(gate_write, b"1"); os.close(gate_write); temporary.remove(gate_write)
            error = os.read(error_read, 8192)
            if error:
                detail = json.loads(error); raise fail_os(OSError(detail.get("errno", errno.EIO), detail.get("message", "exec failed")))
        finally:
            for fd in temporary: os.close(fd)
        close_fds_except({self.control.fileno(), self.guard_write, self.tty_master_fd, self.exit_queue.fileno()})
        self.send({"event": "ready", "pid": self.pid, "pgid": self.pid})

    def collect_command(self) -> None:
        if self.command_reaped or self.pid <= 0: return
        if self.darwin_tty:
            if self.code is None and self.exit_queue is not None:
                events = self.exit_queue.control(None, 1, 0)
                if events:
                    self.code = returncode_for(events[0].data)
                    self.send({"event": "exit", "returncode": self.code})
            return
        pid, status = os.waitpid(self.pid, os.WNOHANG)
        if pid:
            self.command_reaped = True; self.code = returncode_for(status)
            self.send({"event": "exit", "returncode": self.code})

    def foreground(self) -> int:
        if not self.tty: raise RpcError("E_NOT_PTY", "process has no PTY")
        assert self.tty_master_fd is not None
        pgid = os.tcgetpgrp(self.tty_master_fd)
        if pgid <= 1: raise RpcError("E_PROCESS_EXITED", "terminal foreground group is unavailable")
        return pgid

    def signal_group(self, sig: int) -> bool:
        if not self.group_owned: return False
        # Job-control foreground groups are resolved from this private TTY at
        # delivery time, never stored in delayed callbacks or used by the host.
        if self.tty:
            try:
                foreground = self.foreground()
                if foreground != self.pid: os.killpg(foreground, sig)
            except OSError as exc:
                if exc.errno not in (errno.ESRCH, errno.ENXIO, errno.EIO): raise
            except RpcError: pass
        try: os.killpg(self.pid, sig)
        except ProcessLookupError: pass
        if sig == signalmod.SIGKILL:
            self.group_owned = False; self.generation += 1; self.deadline = None
        return True

    def finish(self) -> None:
        self.generation += 1; self.deadline = None
        self.signal_group(signalmod.SIGKILL)
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            self.collect_command()
            if self.darwin_tty and not self.command_reaped and self.pid > 0:
                # No group signal may follow this reap: signal_group(KILL)
                # above invalidated ownership and all delayed escalation.
                got, status = os.waitpid(self.pid, os.WNOHANG)
                if got:
                    self.command_reaped = True
                    if self.code is None:
                        self.code = returncode_for(status)
                        self.send({"event": "exit", "returncode": self.code})
            if self.guardian and not self.guardian_reaped:
                got, _ = os.waitpid(self.guardian, os.WNOHANG)
                self.guardian_reaped = bool(got)
            if self.command_reaped and (not self.guardian or self.guardian_reaped): return
            time.sleep(0.01)
        raise RpcError("E_CLEANUP_TIMEOUT", "supervised process group did not finish after SIGKILL")

    def dispatch(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if method == "foreground": return {"pgid": self.foreground(), "verified": True}
        if method == "terminate":
            grace = min(max(int(params.get("graceMs", 2000)), 0), 30000)
            force = bool(params.get("force", False)); self.generation += 1; self.deadline = None
            delivered = self.signal_group(signalmod.SIGKILL if force else signalmod.SIGTERM)
            if delivered and not force: self.deadline = (self.generation, time.monotonic() + grace / 1000)
            return {"running": delivered, "graceMs": 0 if force else grace, "scope": "group"}
        if method == "release": self.finish(); return {"released": True}
        if method == "signal":
            name, target = params.get("signal", "SIGTERM"), params.get("target", "group")
            allowed = {name: getattr(signalmod, name) for name in ("SIGINT", "SIGTERM", "SIGHUP", "SIGKILL", "SIGQUIT", "SIGTSTP")}
            if name not in allowed: raise RpcError("E_INVALID_PARAMS", "unsupported signal")
            pgid = None; delivered = False
            try:
                if target == "group": pgid = self.pid; delivered = self.signal_group(allowed[name])
                elif target == "foreground":
                    if not self.group_owned: return {"delivered": False, "targetPgid": None, "verified": True}
                    pgid = self.foreground()
                    # Check the exact group used for this delivery, not a
                    # previous foreground inspection in another RPC.
                    if params.get("denyOwnShellKill") is True and name == "SIGKILL" and pgid == self.pid:
                        raise RpcError("E_PERMISSION_DENIED", "refusing to SIGKILL the terminal shell; close the terminal instead")
                    os.killpg(pgid, allowed[name]); delivered = True
                    if pgid == self.pid and allowed[name] == signalmod.SIGKILL:
                        self.group_owned = False; self.generation += 1; self.deadline = None
                elif target == "process":
                    if self.code is None and not self.command_reaped: os.kill(self.pid, allowed[name]); delivered = True
                else: raise RpcError("E_INVALID_PARAMS", "invalid signal target")
            except ProcessLookupError: pass
            return {"delivered": delivered, "targetPgid": pgid, "verified": target == "foreground"}
        raise RpcError("E_METHOD_NOT_FOUND", "unknown process supervisor method")

    def run(self) -> None:
        selector = selectors.DefaultSelector(); selector.register(self.control, selectors.EVENT_READ)
        buffered = b""
        try:
            while True:
                self.collect_command()
                if self.deadline is not None and self.deadline[0] == self.generation and time.monotonic() >= self.deadline[1]:
                    self.signal_group(signalmod.SIGKILL)
                if not selector.select(0.02): continue
                chunk = self.control.recv(65536)
                if not chunk: return
                buffered += chunk
                if len(buffered) > 65536: raise RpcError("E_SUPERVISOR_PROTOCOL", "supervisor control frame too large")
                while b"\n" in buffered:
                    line, buffered = buffered.split(b"\n", 1); request = json.loads(line)
                    try:
                        result = self.dispatch(request["method"], request.get("params", {}))
                        self.send({"id": request["id"], "result": result})
                        if request["method"] == "release": return
                    except (RpcError, OSError) as exc:
                        error = fail_os(exc) if isinstance(exc, OSError) else exc
                        self.send({"id": request["id"], "error": {"code": error.code, "message": error.message}})
        finally: selector.close()


def run_supervised(control_fd: int, tty_master_fd: Optional[int], stdio_fds: Optional[str], argv: List[str]) -> int:
    if argv and argv[0] == "--": argv = argv[1:]
    if stdio_fds is not None:
        for target, source in enumerate(int(value) for value in stdio_fds.split(",")):
            os.dup2(source, target)
        for fd in {int(value) for value in stdio_fds.split(",")}: os.close(fd)
    supervisor = ProcessSupervisor(control_fd, tty_master_fd)
    try:
        if not argv: raise RpcError("E_INVALID_PARAMS", "process argv is empty")
        supervisor.start(argv); supervisor.run(); return 0
    except (OSError, RpcError) as exc:
        error = fail_os(exc) if isinstance(exc, OSError) else exc
        try: supervisor.send({"event": "error", "code": error.code, "message": error.message})
        except OSError: pass
        return 1
    finally:
        try: supervisor.finish()
        except (OSError, RpcError): pass
        if supervisor.guard_write >= 0:
            try: os.close(supervisor.guard_write)
            except OSError: pass
        if supervisor.exit_queue is not None: supervisor.exit_queue.close()
        supervisor.control.close()


def run_sandbox_exec(control_fd: int, tty_master_fd: Optional[int], stdio_fds: str, argv: List[str]) -> int:
    """Pass task I/O as extra FDs; bwrap's reaper retains only its DEVNULL stdio."""
    if argv and argv[0] == "--": argv = argv[1:]
    # Move bind descriptors before reserving 3/4 for control and the PTY master.
    mapping = [(control_fd, 3)] + ([] if tty_master_fd is None else [(tty_master_fd, 4)])
    mapping += [(int(fd), index + 5) for index, fd in enumerate(stdio_fds.split(","))]
    reserved = {target for _, target in mapping}
    for index, value in enumerate(argv[:argv.index("--")]):
        if value == "--bind-fd" and int(argv[index + 1]) in reserved:
            replacement = fcntl.fcntl(int(argv[index + 1]), fcntl.F_DUPFD, 10); os.set_inheritable(replacement, True)
            argv[index + 1] = str(replacement)
    copies = [(fcntl.fcntl(source, fcntl.F_DUPFD, 10), target) for source, target in mapping]
    for copied, target in copies:
        os.dup2(copied, target); os.close(copied); os.set_inheritable(target, True)
    os.execvpe(argv[0], argv, os.environ)
    return 127


def run_pty_exec(slave_fd: int, argv: List[str]) -> int:
    if argv and argv[0] == "--": argv = argv[1:]
    if not argv: return 127
    try:
        os.setsid(); fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        os.dup2(slave_fd, 0); os.dup2(slave_fd, 1); os.dup2(slave_fd, 2)
        if slave_fd > 2: os.close(slave_fd)
        os.execvpe(argv[0], argv, os.environ)
    except OSError as exc:
        try: os.write(2, ("pty-exec: " + (exc.strerror or str(exc)) + "\n").encode())
        except OSError: pass
    return 127


def main() -> int:
    parser = argparse.ArgumentParser(); sub = parser.add_subparsers(dest="command", required=True)
    connect = sub.add_parser("connect"); connect.add_argument("--stdio", action="store_true"); connect.add_argument("--socket"); connect.add_argument("--direct", action="store_true")
    daemon = sub.add_parser("daemon"); daemon.add_argument("--socket"); daemon.add_argument("--idle-timeout", type=float, default=600)
    pty_exec = sub.add_parser("pty-exec"); pty_exec.add_argument("--slave-fd", type=int, required=True); pty_exec.add_argument("argv", nargs=argparse.REMAINDER)
    supervised = sub.add_parser("supervise-exec"); supervised.add_argument("--control-fd", type=int, required=True); supervised.add_argument("--tty-master-fd", type=int); supervised.add_argument("--stdio-fds"); supervised.add_argument("argv", nargs=argparse.REMAINDER)
    sandbox_exec = sub.add_parser("sandbox-exec"); sandbox_exec.add_argument("--control-fd", type=int, required=True); sandbox_exec.add_argument("--tty-master-fd", type=int); sandbox_exec.add_argument("--stdio-fds", required=True); sandbox_exec.add_argument("argv", nargs=argparse.REMAINDER)
    version = sub.add_parser("version"); version.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.command == "version":
        print(json.dumps({"version": VERSION, "buildId": build_id(), "protocol": {"min": 1, "max": 1}}) if args.json else VERSION); return 0
    if args.command == "pty-exec": return run_pty_exec(args.slave_fd, args.argv)
    if args.command == "supervise-exec": return run_supervised(args.control_fd, args.tty_master_fd, args.stdio_fds, args.argv)
    if args.command == "sandbox-exec": return run_sandbox_exec(args.control_fd, args.tty_master_fd, args.stdio_fds, args.argv)
    if args.command == "daemon": return run_daemon(runtime_socket(args.socket), max(30, args.idle_timeout))
    if not args.stdio: parser.error("connect requires --stdio")
    if args.direct: serve_protocol(sys.stdin.buffer, sys.stdout.buffer); return 0
    return proxy_stdio(runtime_socket(args.socket))


if __name__ == "__main__":
    raise SystemExit(main())
