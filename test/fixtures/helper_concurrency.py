"""Deterministic helper lifecycle probes; only fresh temporary files are used."""
import base64
import importlib.util
import json
import os
import sys
import tempfile
import threading

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


case = sys.argv[2]
if case.startswith("read-close-"):
    read_close(case[len("read-close-"):])
elif case == "workspace-borrow":
    workspace_borrow()
else:
    raise AssertionError("unknown scenario: " + case)
print(json.dumps({"case": case, "passed": True}))
