export const RELEASE_REPOSITORY = 'CrazyShout/dsh-ssh-remote';
const base = `https://github.com/${RELEASE_REPOSITORY}/releases`;
const endpoint = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
const stable = /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/u;
class ReleaseFormatError extends Error {
}
class ReleaseHttpError extends Error {
    status;
    limited;
    constructor(status, limited) {
        super(limited
            ? 'GitHub 暂时限制了检查请求，请稍后手动重试。' : `检查更新失败（HTTP ${status}），请稍后重试。`);
        this.status = status;
        this.limited = limited;
    }
}
/** Error causes can include proxy credentials and redirect URLs. Keep only standard codes. */
function networkCode(error) {
    for (let depth = 0; depth < 4 && error && typeof error === 'object'; depth++) {
        const entry = error;
        if (typeof entry.code === 'string' && /^(?:E[A-Z0-9_]{2,40}|UND_ERR_[A-Z_]{2,40}|ERR_TLS_[A-Z_]{2,40}|CERT_[A-Z_]{2,40}|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)$/u.test(entry.code))
            return entry.code;
        error = entry.cause;
    }
    return undefined;
}
const object = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new ReleaseFormatError('发布元数据格式无效。');
    return value;
};
export function releaseTarget(release, manifest) {
    const r = object(release), m = object(manifest);
    const version = typeof r.tag_name === 'string' && r.tag_name.startsWith('v') ? r.tag_name.slice(1) : '';
    if (!stable.test(version) || r.draft !== false || r.prerelease !== false)
        throw new ReleaseFormatError('没有可验证的稳定版发布。');
    const filename = `dsh-ssh-remote-${version}.tgz`;
    const packageUrl = `${base}/download/v${version}/${filename}`;
    if (r.html_url !== `${base}/tag/v${version}` || !Array.isArray(r.assets))
        throw new ReleaseFormatError('发布来源不匹配。');
    const assets = r.assets.map(object);
    const archive = assets.filter(a => a.name === filename);
    const manifests = assets.filter(a => a.name === 'release-manifest.json');
    if (archive.length !== 1 || manifests.length !== 1 || archive[0].state !== 'uploaded'
        || archive[0].browser_download_url !== packageUrl
        || manifests[0].browser_download_url !== `${base}/download/v${version}/release-manifest.json`) {
        throw new ReleaseFormatError('发布缺少完整的固定版本安装包或清单。');
    }
    if (m.name !== 'dsh-ssh-remote' || m.version !== version || m.filename !== filename
        || typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(m.sha256)
        || !Number.isSafeInteger(m.size) || Number(m.size) <= 0 || Number(m.size) > 32 * 1024 * 1024
        || m.size !== archive[0].size || typeof r.published_at !== 'string' || !Number.isFinite(Date.parse(r.published_at))) {
        throw new ReleaseFormatError('安装包版本、大小或校验清单不一致。');
    }
    if (archive[0].digest != null && archive[0].digest !== `sha256:${m.sha256}`)
        throw new ReleaseFormatError('安装包校验信息不一致。');
    if (!Array.isArray(m.dshVersions) || m.dshVersions.length > 20 || !m.dshVersions.every(v => typeof v === 'string' && v.length < 80)) {
        throw new ReleaseFormatError('发布没有有效的 DSH 验收版本说明。');
    }
    return { version, url: String(r.html_url), packageUrl, publishedAt: r.published_at,
        sha256: m.sha256, testedDshVersions: m.dshVersions };
}
/** Only fixed public GitHub endpoints; no credentials, workspace paths or Session contents leave the Host. */
export class ReleaseCatalog {
    request;
    now;
    cached;
    pending;
    lifetime = new AbortController();
    constructor(request = fetch, now = Date.now) {
        this.request = request;
        this.now = now;
    }
    check(force) {
        this.lifetime.signal.throwIfAborted();
        if (this.pending)
            return this.pending;
        const ttl = this.cached?.error ? 5 * 60_000 : 6 * 60 * 60_000;
        if (!force && this.cached && this.now() - this.cached.checkedAt < ttl)
            return Promise.resolve(this.cached);
        this.pending = this.load().then(result => this.cached = result).finally(() => { this.pending = undefined; });
        return this.pending;
    }
    dispose() { this.lifetime.abort(); }
    async json(url, signal, limit) {
        const response = await this.request(url, { signal, headers: { Accept: 'application/json' }, redirect: 'follow' });
        if (!response.ok) {
            await response.body?.cancel();
            throw new ReleaseHttpError(response.status, response.status === 429 || (response.status === 403
                && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))));
        }
        if (!response.body)
            throw new ReleaseFormatError('GitHub 返回了空响应。');
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.byteLength;
                if (size > limit)
                    throw new ReleaseFormatError('发布元数据超过读取上限。');
                chunks.push(value);
            }
            try {
                return JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            catch {
                throw new ReleaseFormatError('发布元数据不是有效的 JSON。');
            }
        }
        finally {
            await reader.cancel().catch(() => { });
            reader.releaseLock();
        }
    }
    async load() {
        const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15_000)]);
        let stage = 'release';
        try {
            const release = object(await this.json(endpoint, signal, 512 * 1024));
            const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
            if (!tag.startsWith('v') || !stable.test(tag.slice(1)) || release.draft !== false || release.prerelease !== false) {
                throw new ReleaseFormatError('没有可验证的稳定版发布。');
            }
            stage = 'manifest';
            const manifest = await this.json(`${base}/download/${tag}/release-manifest.json`, signal, 32 * 1024);
            return { checkedAt: this.now(), latest: releaseTarget(release, manifest), error: '' };
        }
        catch (error) {
            this.lifetime.signal.throwIfAborted();
            const code = networkCode(error);
            const network = !(error instanceof ReleaseFormatError || error instanceof ReleaseHttpError);
            const httpStatus = error instanceof ReleaseHttpError ? error.status : undefined;
            const kind = signal.aborted ? 'timeout' : error instanceof ReleaseHttpError && error.limited ? 'rate-limit'
                : httpStatus !== undefined ? 'http' : network ? 'network' : 'invalid-response';
            return { checkedAt: this.now(), latest: null, error: signal.aborted ? '检查更新超时，请稍后重试。'
                    : network ? '无法连接 GitHub，当前版本是否最新尚未确认。'
                        : error instanceof ReleaseFormatError || error instanceof ReleaseHttpError ? error.message : '无法读取有效的发布信息。',
                failure: { kind, stage, ...(code ? { code } : {}), ...(httpStatus ? { httpStatus } : {}) } };
        }
    }
}
//# sourceMappingURL=release-catalog.js.map