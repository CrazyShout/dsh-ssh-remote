"""Human transfer protocol v1. Durable receipts, bounded bytes, no shell commands.

The installer embeds this module in the content-addressed single-file helper.
Only metadata lives in the private store; upload bytes stay beside their target.
"""
from __future__ import annotations
import base64
import contextlib
import fcntl
import hashlib
import json
import os
import re
import secrets
import stat
import threading
import time
import unicodedata

MAX_BYTES = 1 << 40
CHUNK = 256 * 1024
MAX_ENTRIES = 10000
RETENTION = 7 * 86400
LEASE = 45
ID = re.compile(r"^[a-zA-Z0-9-]{16,80}$")
SHA = re.compile(r"^[0-9a-f]{64}$")
EXCLUDED = {'.git', '.ssh', '.aws', '.azure', '.gnupg', '.venv', 'venv', 'node_modules', '__pycache__', 'build', 'dist'}

class TransferError(Exception):
    def __init__(self, code, message):
        super().__init__(message); self.code = code

def require(condition, code, message):
    if not condition: raise TransferError(code, message)

def integer(value, maximum=MAX_BYTES):
    require(type(value) is int and 0 <= value <= maximum, 'E_INVALID_PARAMS', 'invalid transfer byte count or offset')
    return value

def parts(path):
    require(isinstance(path, str) and not path.startswith('/') and '\0' not in path, 'E_INVALID_PATH', 'relative transfer path required')
    result = path.split('/') if path else []
    require(all(p not in ('', '.', '..') and len(p.encode('utf8')) <= 255 for p in result), 'E_INVALID_PATH', 'unsafe transfer path')
    return result

def identity(st): return [st.st_dev, st.st_ino]
def version(st): return ':'.join(str(v) for v in (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns))
def excluded(name): return name in EXCLUDED or name.startswith('.env') or name in ('id_rsa', 'id_ed25519') or name.endswith(('.pem', '.key')) or name.startswith('.dsh-transfer-')

def exact_name(fd, name):
    normalized = unicodedata.normalize('NFC', name).upper().lower()
    with os.scandir(fd) as entries:
        for count, entry in enumerate(entries):
            require(count < MAX_ENTRIES, 'E_TOO_LARGE', 'target directory exceeds name-conflict check budget')
            require(entry.name == name or unicodedata.normalize('NFC', entry.name).upper().lower() != normalized, 'E_NAME_CONFLICT', 'target name collides by Unicode normalization or case')

class Root:
    def __init__(self, path, expected=None):
        require(isinstance(path, str) and os.path.isabs(path), 'E_INVALID_PATH', 'absolute root required')
        # Reject a changed final component instead of silently canonicalizing it.
        self.path = os.path.normpath(path)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.identity = identity(os.fstat(self.fd))
        if expected is not None and self.identity != expected:
            os.close(self.fd); raise TransferError('E_IDENTITY', 'workspace root identity changed')
    def close(self): os.close(self.fd)
    def directory(self, components, exact=False):
        fd = os.dup(self.fd)
        try:
            for part in components:
                if exact: exact_name(fd, part)
                nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd); fd = nxt
            return fd
        except BaseException: os.close(fd); raise
    @contextlib.contextmanager
    def parent(self, path, exact=False):
        components = parts(path); require(bool(components), 'E_INVALID_PATH', 'file path required')
        fd = self.directory(components[:-1], exact)
        try: yield fd, components[-1]
        finally: os.close(fd)

class DurableTransfers:
    def __init__(self, store=None):
        self.path = store or os.environ.get('DSH_REMOTE_TRANSFER_DIR') or os.path.expanduser('~/.local/state/dsh-ssh-remote/transfers/v1')
        os.makedirs(self.path, mode=0o700, exist_ok=True)
        st = os.lstat(self.path)
        require(stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid(), 'E_IDENTITY', 'unsafe transfer metadata directory')
        os.chmod(self.path, 0o700)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.hashes = {}; self.scans = {}; self.lock = threading.RLock()
        self.scan_lock = threading.Lock(); self.scans_pending = {}
        with self.locked('installation-identity'):
            try: self.installation = self.load('installation-identity')['id']
            except FileNotFoundError:
                self.installation = secrets.token_hex(24); self.save('installation-identity', {'id': self.installation})
        self.next_sweep = 0
        self.sweep_offset = 0

    def close(self):
        with self.lock:
            with self.scan_lock:
                for _, event in self.scans_pending.values(): event.set()
                self.scans.clear()
            if self.fd >= 0: os.close(self.fd); self.fd = -1
            self.hashes.clear()

    @contextlib.contextmanager
    def locked(self, key):
        require(bool(ID.fullmatch(key)), 'E_INVALID_PARAMS', 'invalid transfer identity')
        with self.lock:
            fd = os.open('store.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
            try:
                require(stat.S_ISREG(os.fstat(fd).st_mode) and os.fstat(fd).st_uid == os.getuid(), 'E_IDENTITY', 'unsafe transfer lock')
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                yield
            except BlockingIOError: raise TransferError('E_BUSY', 'transfer is owned by another operation')
            finally: os.close(fd)

    def load(self, key):
        fd = os.open(key + '.json', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self.fd)
        try:
            st = os.fstat(fd)
            require(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid() and st.st_size <= 32768, 'E_IDENTITY', 'invalid transfer receipt')
            with os.fdopen(os.dup(fd), 'r', encoding='utf8') as stream: result = json.load(stream)
            if key.startswith('job-') and result.get('kind') == 'job':
                require(result.get('schema') == 1 and result.get('id') == key, 'E_IDENTITY', 'invalid persisted job')
            elif key != 'installation-identity':
                require(result.get('schema') == 1 and result.get('id') == key and result.get('staging') == '.dsh-transfer-' + key + '.part', 'E_IDENTITY', 'invalid persisted transfer identity')
                parts(result.get('path')); integer(result.get('size')); integer(result.get('offset'), result['size'])
                pending = result.get('pendingWrite')
                if pending:
                    require(pending.get('offset') == result['offset'] and 0 < integer(pending.get('length'), CHUNK) <= result['size'] - result['offset'] and SHA.fullmatch(pending.get('sha256', '')), 'E_IDENTITY', 'invalid interrupted write intent')
            return result
        finally: os.close(fd)

    def save(self, key, value):
        name = '.' + key + '.' + secrets.token_hex(8)
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
        try:
            with os.fdopen(os.dup(fd), 'w', encoding='utf8') as out:
                json.dump(value, out, ensure_ascii=True, separators=(',', ':')); out.flush(); os.fsync(out.fileno())
            os.replace(name, key + '.json', src_dir_fd=self.fd, dst_dir_fd=self.fd); os.fsync(self.fd)
        finally:
            os.close(fd)
            try: os.unlink(name, dir_fd=self.fd)
            except FileNotFoundError: pass

    def root(self, p, record=None):
        if record:
            require(p.get('root') == record['root'] and p.get('installation') == self.installation, 'E_IDENTITY', 'transfer belongs to another remote workspace or installation')
        return Root(p.get('root'), record.get('rootIdentity') if record else None)

    def call(self, method, p, coordinator):
        self.sweep()
        if method == 'identity': return {'installation': self.installation, 'version': 1, 'maxBytes': MAX_BYTES, 'maxChunkBytes': CHUNK}
        if method == 'scan': return self.scan(p)
        if method == 'scanClose':
            with self.scan_lock:
                key = p.get('scanId'); cached = self.scans.get(key); pending = self.scans_pending.get(key)
                require((not cached or cached['root'] == p.get('root')) and (not pending or pending[0] == p.get('root')), 'E_IDENTITY', 'scan belongs to another workspace')
                self.scans.pop(key, None)
                if pending: pending[1].set()
            return {'closed': True}
        if method == 'job':
            job = p.get('jobId'); require(isinstance(job, str) and bool(ID.fullmatch(job)), 'E_INVALID_PARAMS', 'invalid job identity')
            key = 'job-' + job
            with self.locked(key):
                root = self.root(p)
                try:
                    require(p.get('installation') == self.installation, 'E_IDENTITY', 'remote installation changed')
                    try: r = self.load(key)
                    except FileNotFoundError:
                        r = {'schema': 1, 'kind': 'job', 'id': key, 'root': root.path, 'rootIdentity': root.identity,
                             'lease': None, 'state': 'paused', 'updated': time.time()}
                    require(r['root'] == root.path and r['rootIdentity'] == root.identity, 'E_IDENTITY', 'job belongs to another workspace')
                    action = p.get('action')
                    if action != 'status':
                        require(r['state'] not in ('cancelled', 'expired') or action in ('cancel', 'cleanup'), 'E_RETIRED', 'job is retired')
                        self.lease(r, p, acquire=action in ('claim', 'cancel', 'cleanup'))
                        r['state'] = 'active' if action in ('claim', 'renew') else 'cleanup' if action == 'cleanup' else 'cancelled' if action == 'cancel' else 'paused'
                        if action in ('pause', 'cancel'): r['lease'] = None
                        require(action in ('claim', 'renew', 'pause', 'cancel', 'cleanup'), 'E_INVALID_PARAMS', 'invalid job action')
                        r['updated'] = time.time(); self.save(key, r)
                    return {'state': r['state'], 'busyUntil': r['lease']['until'] if r.get('lease') else None}
                finally: root.close()
        if method == 'stat':
            root = self.root(p)
            try:
                with root.parent(p.get('path'), True) as (fd, name):
                    exact_name(fd, name)
                    try: st = os.stat(name, dir_fd=fd, follow_symlinks=False)
                    except FileNotFoundError: return {'exists': False}
                    require(stat.S_ISREG(st.st_mode), 'E_NOT_FILE', 'target is not a regular file')
                    return {'exists': True, 'size': st.st_size, 'version': version(st)}
            finally: root.close()
        if method == 'mkdir':
            root = self.root(p)
            try:
                fd = os.dup(root.fd)
                try:
                    for part in parts(p.get('path')):
                        exact_name(fd, part)
                        try: os.mkdir(part, 0o755, dir_fd=fd)
                        except FileExistsError: pass
                        nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        os.fsync(fd); os.close(fd); fd = nxt
                finally: os.close(fd)
                return {'created': True}
            finally: root.close()
        key = p.get('id'); require(isinstance(key, str) and bool(ID.fullmatch(key)), 'E_INVALID_PARAMS', 'invalid transfer id')
        with self.locked(key):
            if method == 'open': return self.open(key, p)
            try: r = self.load(key)
            except FileNotFoundError:
                if method != 'cancel': raise
                root = self.root(p)
                try:
                    require(p.get('installation') == self.installation and p.get('access') != 'read-only', 'E_PERMISSION_DENIED', 'cannot cancel an unowned allocation')
                    parts(p.get('path')); self.capacity()
                    r = {'schema': 1, 'id': key, 'jobId': p.get('jobId'), 'fingerprint': 'cancelled-before-open', 'root': root.path,
                         'rootIdentity': root.identity, 'path': p['path'], 'size': 0, 'offset': 0, 'state': 'cancelled',
                         'direction': p.get('direction', 'upload'), 'lease': None, 'updated': time.time(),
                         'staging': '.dsh-transfer-' + key + '.part'}
                    self.job_owner(r, p, True); self.save(key, r); return self.view(r)
                finally: root.close()
            root = self.root(p, r)
            try:
                require(r.get('kind') != 'job', 'E_IDENTITY', 'file identity expected')
                self.reconcile(r, root)
                if method != 'status': self.job_owner(r, p, method == 'cancel')
                if r['direction'] == 'upload' and method != 'status':
                    require(p.get('access') != 'read-only', 'E_PERMISSION_DENIED', 'upload control requires workspace-write')
                if method == 'status': self.reconcile(r, root); return self.view(r)
                if method in ('finish', 'pause', 'renew') and r['state'] == 'complete': return self.view(r)
                if method == 'cancel':
                    if r['state'] in ('cancelled', 'expired'): return self.view(r)
                    self.lease(r, p, acquire=True)
                    self.reconcile(r, root)
                    if r['state'] != 'complete':
                        self.remove_stage(r, root); r['state'] = 'cancelled'
                    r['lease'] = None; r['updated'] = time.time(); self.save(key, r); self.hashes.pop(key, None)
                    return self.view(r)
                if method == 'claim':
                    require(r['state'] not in ('cancelled', 'expired'), 'E_RETIRED', 'transfer has been cancelled or expired')
                    self.reconcile(r, root)
                    if r['state'] == 'complete': return self.view(r)
                    self.lease(r, p, acquire=True)
                    require(key in self.hashes or len(self.hashes) < 16, 'E_RESOURCE_LIMIT', 'too many active transfer readers')
                    if r['direction'] == 'download':
                        offset = integer(p.get('offset', 0), r['size'])
                        r['offset'] = offset; r['prefix'] = None
                    self.hashes[key] = [0, hashlib.sha256(), r['offset']]
                    r['state'] = 'verifying'; r['updated'] = time.time(); self.save(key, r)
                    return self.view(r)
                self.lease(r, p)
                if method == 'pause':
                    if r['state'] not in ('complete', 'cancelled'): r['state'] = 'paused'
                    r['lease'] = None; self.hashes.pop(key, None)
                elif method == 'renew': pass
                elif method == 'verify': self.verify(r, root)
                elif method == 'write': self.write(r, root, p)
                elif method == 'read':
                    result = self.read(r, root, p); r['updated'] = time.time(); self.save(key, r); return result
                elif method == 'finish': self.finish(r, root, p, coordinator)
                else: raise TransferError('E_METHOD_NOT_FOUND', 'unknown transfer method')
                r['updated'] = time.time(); self.save(key, r); return self.view(r)
            finally: root.close()

    def view(self, r):
        h = self.hashes.get(r['id'])
        result = {key: r.get(key) for key in ('id', 'direction', 'path', 'size', 'sha256', 'version', 'state', 'offset', 'prefix', 'updated')}
        result.update({'installation': self.installation, 'verifyOffset': h[0] if h and r['state'] == 'verifying' else r['offset']})
        return result

    def lease(self, r, p, acquire=False):
        owner = p.get('owner'); require(isinstance(owner, str) and bool(ID.fullmatch(owner)), 'E_INVALID_PARAMS', 'execution owner required')
        previous = r.get('lease'); now = time.time()
        require(not previous or previous['owner'] == owner or (acquire and previous['until'] < now), 'E_BUSY', 'another execution still owns this transfer')
        require(acquire or previous and previous['owner'] == owner and previous['until'] >= now, 'E_LEASE', 'execution lease expired; claim and verify before resuming')
        r['lease'] = {'owner': owner, 'until': now + LEASE}

    def open(self, key, p):
        root = self.root(p)
        try:
            require(p.get('installation') == self.installation, 'E_IDENTITY', 'remote installation changed')
            path = p.get('path'); parts(path); size = integer(p.get('size'))
            direction = p.get('direction'); require(direction in ('upload', 'download'), 'E_INVALID_PARAMS', 'invalid direction')
            digest = p.get('sha256')
            require(direction == 'download' or isinstance(digest, str) and bool(SHA.fullmatch(digest)), 'E_INVALID_PARAMS', 'source SHA-256 required')
            fingerprint = hashlib.sha256(json.dumps([root.path, root.identity, path, size, direction, digest, p.get('version'), p.get('replaceVersion'), p.get('jobId')]).encode()).hexdigest()
            try:
                r = self.load(key)
                require(r.get('fingerprint') == fingerprint, 'E_IDENTITY', 'transfer identity reused with different input')
                return self.view(r)
            except FileNotFoundError: pass
            # Admission is bounded even when a caller never cleans old receipts.
            self.capacity()
            r = {'schema': 1, 'id': key, 'jobId': p.get('jobId'), 'fingerprint': fingerprint, 'root': root.path, 'rootIdentity': root.identity,
                 'path': path, 'size': size, 'sha256': digest, 'version': p.get('version'), 'replaceVersion': p.get('replaceVersion'),
                 'direction': direction, 'offset': 0, 'prefix': hashlib.sha256().hexdigest(), 'state': 'allocating', 'lease': None,
                 'created': time.time(), 'updated': time.time(), 'staging': '.dsh-transfer-' + key + '.part'}
            self.job_owner(r, p)
            with root.parent(path, True) as (parent, name):
                exact_name(parent, name)
                r['parentIdentity'] = identity(os.fstat(parent))
                if direction == 'download':
                    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
                    try:
                        st = os.fstat(fd)
                        require(stat.S_ISREG(st.st_mode) and st.st_size == size and version(st) == p.get('version'), 'E_CHANGED', 'download source changed')
                    finally: os.close(fd)
                else:
                    self.target(r, parent, name)
                    available = os.fstatvfs(parent)
                    require(size <= available.f_bavail * available.f_frsize, 'E_NO_SPACE', 'not enough remote free space for upload')
                    self.save(key, r)  # Reserve the identity before allocating staging.
                    fd = os.open(r['staging'], os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
                    try: r['stagingIdentity'] = identity(os.fstat(fd)); r['stagingVersion'] = version(os.fstat(fd)); os.fsync(fd)
                    finally: os.close(fd)
                    os.fsync(parent)
            r['state'] = 'paused'; self.save(key, r); return self.view(r)
        finally: root.close()

    @contextlib.contextmanager
    def file(self, r, root, write=False):
        with root.parent(r['path']) as (parent, name):
            require(identity(os.fstat(parent)) == r['parentIdentity'], 'E_IDENTITY', 'target parent identity changed')
            target = r['staging'] if r['direction'] == 'upload' else name
            fd = os.open(target, (os.O_RDWR if write else os.O_RDONLY) | os.O_NOFOLLOW, dir_fd=parent)
            try:
                st = os.fstat(fd)
                require(stat.S_ISREG(st.st_mode), 'E_NOT_FILE', 'transfer target is not regular')
                if r['direction'] == 'upload':
                    require(identity(st) == r.get('stagingIdentity') and st.st_size >= r['offset'], 'E_IDENTITY', 'upload staging identity or size changed')
                    pending = r.get('pendingWrite') if r['state'] == 'verifying' else None
                    require(version(st) == r.get('stagingVersion') or pending and r['offset'] <= st.st_size <= r['offset'] + pending['length'], 'E_CHANGED', 'upload staging data changed outside its owner')
                else: require(version(st) == r['version'], 'E_CHANGED', 'download source changed')
                yield fd
                if r['direction'] == 'download': require(version(os.fstat(fd)) == r['version'], 'E_CHANGED', 'download changed during read')
            finally: os.close(fd)

    def verify(self, r, root):
        require(r['state'] == 'verifying', 'E_STATE', 'claim before verification')
        h = self.hashes.get(r['id']); require(h is not None, 'E_LEASE', 'verification must restart after helper restart')
        with self.file(r, root, r['direction'] == 'upload') as fd:
            os.lseek(fd, h[0], os.SEEK_SET)
            for _ in range(16):
                remaining = h[2] - h[0]
                if remaining <= 0: break
                data = os.read(fd, min(CHUNK, remaining)); require(bool(data), 'E_CHANGED', 'partial file became shorter')
                h[1].update(data); h[0] += len(data)
            if h[0] == h[2]:
                require(r['prefix'] is None or h[1].hexdigest() == r['prefix'], 'E_CHECKSUM', 'staged prefix checksum mismatch')
                if r['direction'] == 'upload':
                    os.ftruncate(fd, r['offset']); os.fsync(fd); r['stagingVersion'] = version(os.fstat(fd))
                    r.pop('pendingWrite', None)
                r['prefix'] = h[1].hexdigest(); r['state'] = 'active'

    def active_hash(self, r):
        h = self.hashes.get(r['id'])
        require(r['state'] == 'active' and h is not None and h[0] == r['offset'] and not r.get('pendingWrite'), 'E_STATE', 'claim and verify before transferring')
        return h

    def write(self, r, root, p):
        require(r['direction'] == 'upload', 'E_STATE', 'not an upload')
        offset = integer(p.get('offset'), r['size'])
        try: data = base64.b64decode(p.get('data', ''), validate=True)
        except Exception: raise TransferError('E_INVALID_PARAMS', 'invalid chunk encoding')
        require(0 < len(data) <= CHUNK and offset + len(data) <= r['size'], 'E_TOO_LARGE', 'chunk outside transfer bounds')
        digest = hashlib.sha256(data).hexdigest(); require(digest == p.get('sha256'), 'E_CHECKSUM', 'chunk checksum mismatch')
        h = self.active_hash(r)
        with self.file(r, root, True) as fd:
            if offset < r['offset']:
                require(offset + len(data) <= r['offset'], 'E_CURSOR', 'chunk partially overlaps confirmed bytes')
                os.lseek(fd, offset, os.SEEK_SET); require(os.read(fd, len(data)) == data, 'E_CHECKSUM', 'replayed chunk differs')
                return
            require(offset == r['offset'], 'E_CURSOR', 'chunk is not at confirmed offset')
            # Durable intent distinguishes our interrupted write tail from an
            # unexplained edit. Resume verifies the confirmed prefix, then only
            # truncates this unacknowledged tail; it never splices unknown bytes.
            r['pendingWrite'] = {'offset': offset, 'length': len(data), 'sha256': digest}
            self.save(r['id'], r)
            os.lseek(fd, offset, os.SEEK_SET); view = memoryview(data)
            while view:
                written = os.write(fd, view); require(written > 0, 'E_IO', 'write made no progress'); view = view[written:]
            os.fsync(fd); h[1].update(data); h[0] += len(data); r['offset'] = h[0]; r['prefix'] = h[1].hexdigest()
            r['stagingVersion'] = version(os.fstat(fd))
            r.pop('pendingWrite', None)

    def read(self, r, root, p):
        require(r['direction'] == 'download', 'E_STATE', 'not a download')
        offset = integer(p.get('offset'), r['size']); h = self.active_hash(r)
        require(offset == r['offset'] or offset < r['offset'], 'E_CURSOR', 'download cursor skipped bytes')
        with self.file(r, root) as fd:
            os.lseek(fd, offset, os.SEEK_SET); data = os.read(fd, min(CHUNK, r['size'] - offset))
        if offset == r['offset']:
            h[1].update(data); h[0] += len(data); r['offset'] = h[0]; r['prefix'] = h[1].hexdigest()
        return {'offset': offset, 'data': base64.b64encode(data).decode(), 'sha256': hashlib.sha256(data).hexdigest(), 'size': r['size']}

    def target(self, r, parent, name):
        exact_name(parent, name)
        try: st = os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            require(r['replaceVersion'] is None, 'E_STALE_VERSION', 'replacement target disappeared'); return None
        require(stat.S_ISREG(st.st_mode), 'E_NOT_FILE', 'cannot overwrite a symlink or non-file')
        require(r['replaceVersion'] is not None, 'E_EXISTS', 'target already exists; replacement requires confirmation')
        require(version(st) == r['replaceVersion'], 'E_STALE_VERSION', 'replacement target changed')
        return st

    def finish(self, r, root, p, coordinator):
        if r['state'] == 'complete': return
        h = self.active_hash(r); require(r['offset'] == r['size'], 'E_CURSOR', 'transfer is incomplete')
        digest = h[1].hexdigest()
        require(digest == p.get('sha256') and (r['direction'] == 'download' or digest == r['sha256']), 'E_CHECKSUM', 'complete file checksum mismatch')
        r['sha256'] = digest
        if r['direction'] == 'upload':
            with root.parent(r['path']) as (parent, name):
                require(identity(os.fstat(parent)) == r['parentIdentity'], 'E_IDENTITY', 'target parent changed')
                key = ':'.join(map(str, identity(os.fstat(parent)))) + ':' + name
                with coordinator.locked(key):
                    before = self.target(r, parent, name)
                    with self.file(r, root, True) as fd:
                        require(os.fstat(fd).st_size == r['size'], 'E_CHANGED', 'staging size changed')
                        r['state'] = 'committing'; self.save(r['id'], r)
                        os.fchmod(fd, stat.S_IMODE(before.st_mode) & 0o777 if before else 0o644); os.fsync(fd)
                    if before is None:
                        os.link(r['staging'], name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
                        os.unlink(r['staging'], dir_fd=parent)
                    else: os.replace(r['staging'], name, src_dir_fd=parent, dst_dir_fd=parent)
                    os.fsync(parent)
        else:
            with self.file(r, root): pass
        r['state'] = 'complete'; r['lease'] = None; self.hashes.pop(r['id'], None)

    def reconcile(self, r, root):
        if r['state'] != 'committing': return
        with root.parent(r['path']) as (parent, name):
            require(identity(os.fstat(parent)) == r['parentIdentity'], 'E_IDENTITY', 'commit parent changed')
            try: st = os.stat(name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError: st = None
            if st is None or identity(st) != r.get('stagingIdentity'):
                # Publication had not occurred: the original target and our
                # owned staging inode must both still match the intent.
                self.target(r, parent, name)
                try: staged = os.stat(r['staging'], dir_fd=parent, follow_symlinks=False)
                except FileNotFoundError: raise TransferError('E_OUTCOME_UNKNOWN', 'publication outcome needs manual inspection')
                require(stat.S_ISREG(staged.st_mode) and identity(staged) == r.get('stagingIdentity') and staged.st_size == r['size'], 'E_OUTCOME_UNKNOWN', 'publication outcome cannot be confirmed')
                r['state'] = 'paused'; r['stagingVersion'] = version(staged); r['lease'] = None
                self.hashes.pop(r['id'], None); self.save(r['id'], r); return
            require(st.st_size == r['size'], 'E_OUTCOME_UNKNOWN', 'published file changed')
            # The exact owned inode was published. Do not mistake a same-content external file for its receipt.
            self.remove_stage(r, root); r['state'] = 'complete'; r['lease'] = None; self.save(r['id'], r)

    def remove_stage(self, r, root):
        if r['direction'] != 'upload' or r.get('fingerprint') == 'cancelled-before-open': return
        with root.parent(r['path']) as (parent, _):
            require(identity(os.fstat(parent)) == r['parentIdentity'], 'E_IDENTITY', 'cleanup parent changed')
            try: st = os.stat(r['staging'], dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError: return
            require(identity(st) == r.get('stagingIdentity') and stat.S_ISREG(st.st_mode), 'E_IDENTITY', 'refusing to delete unowned staging file')
            os.unlink(r['staging'], dir_fd=parent); os.fsync(parent)

    def sweep(self):
        now = time.time()
        if now < self.next_sweep: return
        self.next_sweep = now + 30
        with os.scandir(self.path) as entries:
            keys = [item.name[:-5] for _, item in zip(range(20002), entries)
                    if item.name.endswith('.json') and item.name != 'installation-identity.json']
        selected = keys[self.sweep_offset:self.sweep_offset + 100]
        self.sweep_offset = self.sweep_offset + 100 if self.sweep_offset + 100 < len(keys) else 0
        for key in selected:
            try:
                with self.locked(key):
                    r = self.load(key)
                    if now - r['updated'] < RETENTION or r.get('lease') and r['lease']['until'] > now: continue
                    if r.get('kind') == 'job':
                        r['state'] = 'expired'; r['lease'] = None; self.save(key, r)
                        if now - r['updated'] > 2 * RETENTION: os.unlink(key + '.json', dir_fd=self.fd)
                        continue
                    root = Root(r['root'], r['rootIdentity'])
                    try:
                        self.reconcile(r, root)
                        self.remove_stage(r, root)
                        r['state'] = 'expired'; r['lease'] = None; self.save(key, r)
                    finally: root.close()
                    self.hashes.pop(key, None)
                    # Keep an expiry receipt for one extra retention window.
                    if now - r['updated'] > 2 * RETENTION: os.unlink(key + '.json', dir_fd=self.fd)
            except (OSError, ValueError, TransferError, KeyError):
                # No cleanup acknowledgement when identity/permissions cannot be proved.
                continue

    def job_owner(self, r, p, cleanup=False):
        if not r.get('jobId'): return
        job = self.load('job-' + r['jobId'])
        require((job['state'] == 'active' or cleanup and job['state'] == 'cleanup') and job['root'] == r['root'] and job['rootIdentity'] == r['rootIdentity'], 'E_LEASE', 'claim the owning job first')
        self.lease(job, p); job['updated'] = time.time(); self.save(job['id'], job)

    def capacity(self):
        with os.scandir(self.path) as entries: count = sum(1 for _, item in zip(range(20002), entries))
        require(count < 20000, 'E_RESOURCE_LIMIT', 'transfer receipt capacity reached')

    def scan(self, p):
        scan_id = p.get('scanId'); require(isinstance(scan_id, str) and bool(ID.fullmatch(scan_id)), 'E_INVALID_PARAMS', 'scan identity required')
        cursor = integer(p.get('cursor', 0), MAX_ENTRIES)
        now = time.monotonic()
        with self.scan_lock:
            self.scans = {k: v for k, v in self.scans.items() if now - v['created'] < 120}
            cached = self.scans.get(scan_id)
            if cached:
                require(cached['root'] == p.get('root') and cached['path'] == p.get('path', ''), 'E_IDENTITY', 'scan identity changed')
                return self.scan_page(cached, cursor)
            require(cursor == 0, 'E_CURSOR', 'scan expired; start a new scan')
            require(scan_id not in self.scans_pending and len(self.scans) + len(self.scans_pending) < 4, 'E_RESOURCE_LIMIT', 'too many transfer scans')
            cancelled = threading.Event(); self.scans_pending[scan_id] = (p.get('root'), cancelled)
        try: return self.scan_build(p, scan_id, now, cancelled)
        finally:
            with self.scan_lock: self.scans_pending.pop(scan_id, None)

    def scan_build(self, p, scan_id, now, cancelled):
        path = p.get('path', ''); components = parts(path); result = []; total = 0; path_bytes = 0
        root = self.root(p)
        deadline = time.monotonic() + 15
        def add(entry):
            nonlocal path_bytes, total
            path_bytes += len(entry['path'].encode('utf8')); total += entry.get('size', 0)
            require(len(result) < MAX_ENTRIES and path_bytes <= 8 * 1024 * 1024 and total <= MAX_BYTES, 'E_TOO_LARGE', 'transfer manifest exceeds item, path or byte budget')
            result.append(entry)
        def walk(fd, relative):
            with os.scandir(fd) as entries:
                for entry in entries:
                    require(not cancelled.is_set(), 'E_CANCELLED', 'directory scan cancelled')
                    require(time.monotonic() <= deadline, 'E_TIMEOUT', 'directory scan exceeded 15 seconds')
                    name = entry.name; parts(name); rel = relative + '/' + name if relative else name
                    st = entry.stat(follow_symlinks=False)
                    if excluded(name): add({'path': rel, 'kind': 'excluded', 'reason': 'credential/cache/metadata exclusion'}); continue
                    if stat.S_ISLNK(st.st_mode) or not (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)):
                        add({'path': rel, 'kind': 'excluded', 'reason': 'symlink or non-regular entry'}); continue
                    if stat.S_ISDIR(st.st_mode):
                        add({'path': rel, 'kind': 'directory'})
                        child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                        try: walk(child, rel)
                        finally: os.close(child)
                    else:
                        integer(st.st_size); add({'path': rel, 'kind': 'file', 'size': st.st_size, 'version': version(st)})
        try:
            if any(excluded(component) for component in components):
                add({'path': path, 'kind': 'excluded', 'reason': 'credential/cache/metadata exclusion'})
            elif components:
                with root.parent(path, True) as (parent, name):
                    exact_name(parent, name)
                    st = os.stat(name, dir_fd=parent, follow_symlinks=False)
                    if stat.S_ISREG(st.st_mode): add({'path': path, 'kind': 'file', 'size': integer(st.st_size), 'version': version(st)})
                    else:
                        require(stat.S_ISDIR(st.st_mode), 'E_NOT_FILE', 'symlinks are not transferred')
                        add({'path': path, 'kind': 'directory'})
                        child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                        try: walk(child, path)
                        finally: os.close(child)
            else: walk(root.fd, '')
            cached = {'entries': result, 'totalBytes': total, 'rootIdentity': root.identity, 'root': root.path, 'path': path, 'created': now}
            with self.scan_lock:
                require(not cancelled.is_set(), 'E_CANCELLED', 'directory scan cancelled')
                self.scans[scan_id] = cached
            return self.scan_page(cached, 0)
        finally: root.close()

    def scan_page(self, snapshot, cursor):
        require(cursor <= len(snapshot['entries']), 'E_CURSOR', 'scan cursor outside manifest')
        rows = []; used = 0
        for entry in snapshot['entries'][cursor:cursor + 200]:
            size = len(json.dumps(entry, ensure_ascii=True).encode())
            if rows and used + size > 128 * 1024: break
            rows.append(entry); used += size
        following = cursor + len(rows)
        return {'entries': rows, 'next': following, 'done': following == len(snapshot['entries']),
                'totalBytes': snapshot['totalBytes'], 'rootIdentity': snapshot['rootIdentity']}
