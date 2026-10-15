"""Deterministic interruption/expiry faults, with tiny files only."""
import contextlib
import hashlib
import importlib.util
import os
import tempfile
import time
import sys
import json
import base64
import errno

spec = importlib.util.spec_from_file_location('transfer', sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class Coordinator:
    @contextlib.contextmanager
    def locked(self, _key): yield

with tempfile.TemporaryDirectory(prefix='dsh-transfer-fault-') as temporary:
    target = os.path.join(temporary, 'root'); os.mkdir(target)
    store = m.DurableTransfers(os.path.join(temporary, 'store'))
    owner = 'execution-12345678'
    def call(method, **args):
        return store.call(method, dict(root=target, access='workspace-write', installation=store.installation, owner=owner, **args), Coordinator())
    def claim(key):
        result = call('claim', id=key)
        while result['state'] == 'verifying': result = call('verify', id=key)
        return result
    def open_file(key, name='result'):
        call('open', id=key, path=name, direction='upload', size=4, sha256=hashlib.sha256(b'data').hexdigest())
        claim(key)
    def write(key): call('write', id=key, offset=0, data=base64.b64encode(b'data').decode(), sha256=hashlib.sha256(b'data').hexdigest())
    def fail_write(fd, data):
        # Simulate a process loss/ENOSPC after only two unconfirmed bytes.
        original_write(fd, data[:2]); raise OSError(errno.ENOSPC, 'injected disk full')
    key = 'interrupted-chunk-1234'; open_file(key)
    original_write = m.os.write; m.os.write = fail_write
    try:
        try: write(key); raise AssertionError('expected write failure')
        except OSError as error: assert error.errno == errno.ENOSPC
    finally: m.os.write = original_write
    store.close(); store = m.DurableTransfers(os.path.join(temporary, 'store'))
    assert claim(key)['offset'] == 0
    assert os.stat(os.path.join(target, '.dsh-transfer-' + key + '.part')).st_size == 0
    write(key)
    # Crash after saving publication intent but before the atomic link.
    original_link = m.os.link
    def fail_link(*args, **kwargs): raise OSError(errno.EACCES, 'injected permission denied')
    m.os.link = fail_link
    try:
        try: call('finish', id=key, sha256=hashlib.sha256(b'data').hexdigest()); raise AssertionError('expected publication failure')
        except OSError: pass
    finally: m.os.link = original_link
    store.close(); store = m.DurableTransfers(os.path.join(temporary, 'store'))
    assert claim(key)['offset'] == 4
    assert call('finish', id=key, sha256=hashlib.sha256(b'data').hexdigest())['state'] == 'complete'
    assert open(os.path.join(target, 'result'), 'rb').read() == b'data'
    # Cancel-before-open is an idempotent tombstone, not a later allocation.
    cancelled = 'cancelled-before-open-1234'
    assert call('cancel', id=cancelled, path='unused', direction='upload')['state'] == 'cancelled'
    assert call('cancel', id=cancelled, path='unused', direction='upload')['state'] == 'cancelled'
    # Idle expiry removes only this record's staging inode, never the target.
    stale = 'expired-owned-upload-1234'; open_file(stale, 'expired-target')
    call('pause', id=stale)
    record = store.load(stale); record['updated'] = time.time() - m.RETENTION - 1; store.save(stale, record)
    store.next_sweep = 0; store.sweep()
    assert store.load(stale)['state'] == 'expired'
    assert not os.path.exists(os.path.join(target, '.dsh-transfer-' + stale + '.part'))
    assert open(os.path.join(target, 'result'), 'rb').read() == b'data'
    # A replaced staging inode belongs to someone else, so cleanup must fail.
    replaced = 'expired-foreign-upload-1234'; open_file(replaced, 'foreign-target'); call('pause', id=replaced)
    path = os.path.join(target, '.dsh-transfer-' + replaced + '.part')
    os.rename(path, path + '.original')
    with open(path, 'wb') as file: file.write(b'keep')
    record = store.load(replaced); record['updated'] = time.time() - m.RETENTION - 1; store.save(replaced, record)
    store.next_sweep = 0; store.sweep()
    assert open(path, 'rb').read() == b'keep' and store.load(replaced)['state'] == 'paused'
    store.close()
print('faults passed')
