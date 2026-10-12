"""Deterministic helper lifecycle probes; only fresh temporary files are used."""
import base64
import errno
import importlib.util
import json
import os
import sys
import tempfile
import threading
from contextlib import contextmanager

spec = importlib.util.spec_from_file_location("helper_under_test", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def server():
    value = m.Server()
    value.dispatch("initialize", {"clientId": "concurrency-fixture"})
    return value


def workspace(value, root, identity="w"):
    return value.dispatch("workspace/open", {
        "workspaceId": identity, "operationId": "open-" + identity,
        "path": root, "access": "danger-full-access",
    })


def launch(name, fn):
    result = {}

    def run():
        try:
            result["value"] = fn()
        except Exception as error:
            result["error"] = error

    thread = threading.Thread(name=name, target=run)
    thread.start()
    return thread, result


def join(thread):
    thread.join(5)
    assert not thread.is_alive(), "fixture thread did not finish: " + thread.name


class ReadGate:
    def __init__(self):
        self.lock = threading.Lock()
        self.entered = threading.Event()
        self.proceed = threading.Event()

    def __enter__(self):
        if threading.current_thread().name == "slow-read":
            self.entered.set()
            assert self.proceed.wait(5), "read gate timed out"
        self.lock.acquire()

    def __exit__(self, *args):
        self.lock.release()


def read_close(mode):
    value = server()
    with tempfile.TemporaryDirectory() as root:
        original, unrelated = os.path.join(root, "a"), os.path.join(root, "b")
        with open(original, "wb") as stream:
            stream.write(b"ORIGINAL")
        with open(unrelated, "wb") as stream:
            stream.write(b"UNRELATED")
        workspace(value, root)
        value.dispatch("fs/readOpen", {"workspaceId": "w", "path": "a", "handleId": "r", "operationId": "read"})
        handle = value.read_handles["r"]
        old_fd = handle["fd"]
        if mode == "cached":
            value.dispatch("fs/readNext", {"handleId": "r", "afterSeq": "0", "maxBytes": 1})
        gate = ReadGate()
        handle["lock"] = gate
        thread, result = launch("slow-read", lambda: value.dispatch("fs/readNext", {"handleId": "r", "afterSeq": "0"}))
        replacement = -1
        try:
            assert gate.entered.wait(3)
            if mode == "session":
                value.close()
            else:
                assert value.dispatch("fs/close", {"handleId": "r", "operationId": "close"})["closed"]
            replacement = os.open(unrelated, os.O_RDONLY)
            if replacement != old_fd:
                os.dup2(replacement, old_fd)
                os.close(replacement)
                replacement = old_fd
            gate.proceed.set()
            join(thread)
            assert getattr(result.get("error"), "code", None) == "E_UNKNOWN_HANDLE", result
            if mode != "session":
                assert value.dispatch("fs/close", {"handleId": "r", "operationId": "close-again"})["closed"]
            assert os.read(replacement, 9) == b"UNRELATED", "a repeated close touched the reused FD"
        finally:
            gate.proceed.set()
            join(thread)
            if replacement >= 0:
                os.close(replacement)
            value.close()


def workspace_borrow():
    with tempfile.TemporaryDirectory() as root:
        a, b = os.path.join(root, "a"), os.path.join(root, "b")
        os.mkdir(a)
        os.mkdir(b)
        ws = m.Workspace(a, "read-only")
        target = ws.fd
        expected = os.fstat(target).st_ino
        entered, proceed, closing, closed = (threading.Event() for _ in range(4))
        real_dup = m.os.dup

        def delayed_dup(fd):
            if fd == target and threading.current_thread().name == "borrow":
                entered.set()
                assert proceed.wait(5)
            return real_dup(fd)

        def close():
            closing.set()
            ws.close()
            closed.set()

        m.os.dup = delayed_dup
        reader, result = launch("borrow", lambda: ws.dirfd([]))
        closer = None
        replacement = -1
        try:
            assert entered.wait(3)
            closer, close_result = launch("close-root", close)
            assert closing.wait(3)
            # With lifecycle protection close blocks behind the paused dup.
            # Without it, force the old descriptor to name a different directory.
            if closed.wait(.2):
                replacement = os.open(b, os.O_RDONLY | os.O_DIRECTORY)
                if replacement != target:
                    os.dup2(replacement, target)
                    os.close(replacement)
                    replacement = target
            proceed.set()
            join(reader)
            join(closer)
            assert "error" not in result, result
            assert "error" not in close_result, close_result
            assert os.fstat(result["value"]).st_ino == expected, "borrowed another workspace's directory"
            try:
                ws.dirfd([])
                raise AssertionError("closed workspace allowed a new FD borrow")
            except m.RpcError as error:
                assert error.code == "E_UNKNOWN_WORKSPACE"
        finally:
            proceed.set()
            join(reader)
            if closer:
                join(closer)
            m.os.dup = real_dup
            if "value" in result:
                os.close(result["value"])
            if replacement >= 0:
                os.close(replacement)
            ws.close()


def close_failure(kind):
    value = server()
    real_close = m.os.close
    with tempfile.TemporaryDirectory() as root:
        with open(os.path.join(root, "file"), "wb") as stream:
            stream.write(b"test")
        workspace(value, root)
        if kind == "read":
            value.dispatch("fs/readOpen", {"workspaceId": "w", "path": "file", "handleId": "r", "operationId": "read"})
            target = value.read_handles["r"]["fd"]
            method, params = "fs/close", {"handleId": "r", "operationId": "close"}
        else:
            target = value.workspaces["w"].fd
            method, params = "workspace/close", {"workspaceId": "w", "operationId": "close"}

        def fail_close(fd):
            if fd == target:
                raise OSError(errno.EIO, "fixture close failure")
            return real_close(fd)

        try:
            m.os.close = fail_close
            try:
                value.dispatch(method, params)
                raise AssertionError("failed close was reported as successful")
            except m.RpcError:
                pass
            m.os.close = real_close
            try:
                value.dispatch(method, dict(params, operationId="retry-close"))
                raise AssertionError("uncertain close was converted to success")
            except m.RpcError as error:
                assert error.code == "E_CLEANUP_FAILED"
            os.fstat(target)  # Retrying must not touch an ambiguously owned numeric FD.
        finally:
            m.os.close = real_close
            real_close(target)
            if kind == "read":
                value.read_handles.pop("r")
            else:
                value.workspaces.pop("w")
            value.close()


def workspace_cancel(mode):
    value = server()
    real_workspace = m.Workspace
    entered, proceed = threading.Event(), threading.Event()
    created = []
    clock = [1000.0]
    m.time.monotonic = lambda: clock[0]

    def delayed_workspace(*args):
        ws = real_workspace(*args)
        created.append((ws, ws.fd))
        entered.set()
        assert proceed.wait(5)
        return ws

    with tempfile.TemporaryDirectory() as root:
        if mode == "before":
            receipt = value.dispatch("workspace/close", {"workspaceId": "w", "operationId": "cancel"})
            assert receipt == {"closed": False, "cancelled": True}, receipt
            try:
                workspace(value, root)
                raise AssertionError("cancelled identity opened later")
            except m.RpcError as error:
                assert error.code == "E_RESOURCE_RETIRED"
            value.close()
            return
        m.Workspace = delayed_workspace
        thread, result = launch("opening", lambda: workspace(value, root))
        try:
            assert entered.wait(3)
            if mode == "session":
                value.close()
            else:
                receipt = value.dispatch("workspace/close", {"workspaceId": "w", "operationId": "cancel"})
                assert receipt == {"closed": False, "cancelled": True}, receipt
                clock[0] += 601
                with value.resources_lock:
                    value.prune_cleanup()
                assert ("workspace", "w") in value.closed_resources, "expired a still-opening cancellation"
                assert value.dispatch("workspace/close", {"workspaceId": "w", "operationId": "retry"}) == receipt
            proceed.set()
            join(thread)
            expected = "E_SESSION_CLOSED" if mode == "session" else "E_RESOURCE_RETIRED"
            assert getattr(result.get("error"), "code", None) == expected, result
            assert not value.workspaces and not value.opening_workspaces
            assert created[0][0].fd == -1, "late directory FD leaked"
            if mode != "session":
                clock[0] += 601
                m.Workspace = real_workspace
                workspace(value, root, "new")
        finally:
            proceed.set()
            join(thread)
            m.Workspace = real_workspace
            value.close()


def workspace_quota():
    value = server()
    clock = [1000.0]
    m.time.monotonic = lambda: clock[0]
    m.MAX_CLEANUP_IDENTITIES = 2
    with tempfile.TemporaryDirectory() as root:
        workspace(value, root)
        assert value.dispatch("workspace/close", {"workspaceId": "cancelled", "operationId": "cancel"})["cancelled"]
        try:
            value.dispatch("workspace/close", {"workspaceId": "overflow", "operationId": "overflow"})
            raise AssertionError("unknown cancellation bypassed capacity")
        except m.RpcError as error:
            assert error.code == "E_RESOURCE_LIMIT"
        value.operations = {str(i): ("digest", {}, clock[0]) for i in range(m.MAX_OPERATIONS)}
        value.operation_locks = {key: threading.Lock() for key in value.operations}
        assert value.dispatch("workspace/close", {"workspaceId": "w", "operationId": "close-live"}) == {"closed": True}
        assert len(value.closed_resources) == 2
        clock[0] += 601
        workspace(value, root, "fresh")
        value.close()


def workspace_failure():
    value = server()
    m.MAX_WORKSPACES = 1
    with tempfile.TemporaryDirectory() as root:
        try:
            workspace(value, os.path.join(root, "missing"))
            raise AssertionError("missing directory opened")
        except m.RpcError:
            pass
        assert not value.opening_workspaces
        result = workspace(value, root)
        assert value.dispatch("workspace/close", {"workspaceId": "w", "operationId": "close"}) == {"closed": True}
        assert workspace(value, root) == result  # Historical receipt, not a new live allocation.
        assert not value.workspaces and not value.opening_workspaces
        value.close()


def competing_writes(first_kind, second_kind, independent=False):
    state = m.DaemonState(30)
    first, second = (state.acquire({"clientId": name}) for name in ("writer-a", "writer-b"))
    first.dispatch("initialize", {"clientId": "writer-a"})
    second.dispatch("initialize", {"clientId": "writer-b"})
    with tempfile.TemporaryDirectory() as root:
        project = os.path.join(root, "project")
        os.mkdir(project)
        for name in ("shared", "independent"):
            with open(os.path.join(project, name), "wb") as stream:
                stream.write(b"seed")
        workspace(first, project)
        workspace(second, root)

        def prepare(value, kind, path, tag):
            version = value.dispatch("fs/read", {"workspaceId": "w", "path": path})["version"]
            params = {"workspaceId": "w", "path": path, "intent": {"kind": "replace-if-version", "version": version}}
            data = base64.b64encode(tag.encode()).decode()
            if kind == "inline":
                return lambda: value.dispatch("fs/write", dict(params, data=data, operationId="commit-" + tag))
            value.dispatch("fs/writeOpen", dict(params, handleId=tag, operationId="upload-" + tag))
            value.dispatch("fs/writeChunk", {"handleId": tag, "data": data, "operationId": "chunk-" + tag})
            return lambda: value.dispatch("fs/writeCommit", {"handleId": tag, "operationId": "commit-" + tag})

        commit_a = prepare(first, first_kind, "shared", "A")
        commit_b = prepare(second, second_kind, "project/" + ("independent" if independent else "shared"), "B")
        entered, proceed, attempted, completed = (threading.Event() for _ in range(4))
        real_replace, real_lock = m.os.replace, second.locked_path

        def delayed_replace(*args, **kwargs):
            if threading.current_thread().name == "commit-a":
                entered.set()
                assert proceed.wait(5)
            return real_replace(*args, **kwargs)

        @contextmanager
        def observed_lock(key):
            attempted.set()
            with real_lock(key):
                yield

        def run_second():
            try:
                return commit_b()
            finally:
                completed.set()

        m.os.replace = delayed_replace
        second.locked_path = observed_lock
        a, result_a = launch("commit-a", commit_a)
        b = None
        try:
            assert entered.wait(3)
            b, result_b = launch("commit-b", run_second)
            assert attempted.wait(3)
            if independent:
                assert completed.wait(3), "unrelated files were globally serialized"
            else:
                completed.wait(.2)  # Second client either blocks on the lock or exposes the old race.
            proceed.set()
            join(a)
            join(b)
            assert "value" in result_a, result_a
            if independent:
                assert "value" in result_b, result_b
            else:
                assert getattr(result_b.get("error"), "code", None) == "E_STALE_VERSION", result_b
            assert first.capabilities()["filesystem"]["guardedWrite"]["coordinationScope"] == "daemon"
            assert first.dispatch("health/status", {})["pathLocks"] == 0
            assert second.dispatch("health/status", {})["pathLocks"] == 0
        finally:
            proceed.set()
            join(a)
            if b:
                join(b)
            m.os.replace = real_replace
            first.close()
            second.close()


case = sys.argv[2]
if case.startswith("read-close-"):
    read_close(case[len("read-close-"):])
elif case == "workspace-borrow":
    workspace_borrow()
elif case.startswith("close-failure-"):
    close_failure(case[len("close-failure-"):])
elif case.startswith("workspace-cancel-"):
    workspace_cancel(case[len("workspace-cancel-"):])
elif case == "workspace-quota":
    workspace_quota()
elif case == "workspace-failure":
    workspace_failure()
elif case.startswith("write-"):
    _, first_kind, second_kind = case.split("-")
    competing_writes(first_kind, second_kind)
elif case == "independent-writes":
    competing_writes("inline", "chunk", independent=True)
else:
    raise AssertionError("unknown scenario: " + case)
print(json.dumps({"case": case, "passed": True}))
