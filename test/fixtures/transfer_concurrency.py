"""Real helper transactions with tiny files and deterministic overlap gates."""
import base64
import concurrent.futures
import contextlib
import fcntl
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import threading
import time

spec = importlib.util.spec_from_file_location('transfer', sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class Coordinator:
    @contextlib.contextmanager
    def locked(self, _key): yield

with tempfile.TemporaryDirectory(prefix='dsh-transfer-concurrency-') as temporary:
    target = os.path.join(temporary, 'target'); os.mkdir(target)
    store = m.DurableTransfers(os.path.join(temporary, 'store'))
    owner, job = 'execution-12345678', 'concurrent-job-12345678'
    data = b'tiny'; digest = hashlib.sha256(data).hexdigest()
    def call(method, **params):
        return store.call(method, dict(root=target, access='workspace-write', installation=store.installation, owner=owner, **params), Coordinator())
    call('job', jobId=job, action='claim')
    keys = ['file-a-1234567890', 'file-b-1234567890']
    for key in keys:
        call('open', id=key, jobId=job, path=key, direction='upload', size=len(data), sha256=digest)
        result = call('claim', id=key)
        while result['state'] == 'verifying': result = call('verify', id=key)
    original = store.write
    barrier = threading.Barrier(2, timeout=3)
    def overlapping(record, root, params):
        barrier.wait()  # A task/global serial lock cannot pass this gate.
        return original(record, root, params)
    store.write = overlapping
    def write(key): return call('write', id=key, offset=0, data=base64.b64encode(data).decode(), sha256=digest)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(write, keys))
    assert [r['offset'] for r in results] == [4, 4]
    active, maximum = [0], [0]
    def serial(record, root, params):
        active[0] += 1; maximum[0] = max(maximum[0], active[0])
        try: time.sleep(.025); return original(record, root, params)
        finally: active[0] -= 1
    store.write = serial
    with concurrent.futures.ThreadPoolExecutor(2) as pool: list(pool.map(write, [keys[0], keys[0]]))
    assert maximum[0] == 1
    # Older helpers take the global EX lock; new SH data lanes must respect it.
    fd = os.open(os.path.join(store.path, 'store.lock'), os.O_RDWR)
    fcntl.flock(fd, fcntl.LOCK_EX)
    try:
        try: write(keys[0]); raise AssertionError('old helper lock was bypassed')
        except m.TransferError as error: assert error.code == 'E_BUSY'
    finally: os.close(fd)
    for key in keys: call('finish', id=key, sha256=digest)
    call('job', jobId=job, action='pause')
    assert not [name for name in os.listdir(store.path) if name.endswith('.lock') and name != 'store.lock']
    store.close()
    print(json.dumps({'crossFileOverlap': True, 'sameFileMaximum': maximum[0], 'oldHelperExclusion': True, 'bytes': 8}))
