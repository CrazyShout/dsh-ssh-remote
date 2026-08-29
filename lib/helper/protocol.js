/** Wire vocabulary shared by the local SSH controller and dsh_remote_helper.py. */
export const DSH_RPC_VERSION = '1';
export const DSH_RPC_PROTOCOL = 1;
export const DSH_RPC_MAX_LINE_BYTES = 1024 * 1024;
export class DshRpcProtocolError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'DshRpcProtocolError';
    }
}
/** Parse and minimally validate one JSON-decoded wire frame. */
export function parseDshRpcFrame(value) {
    const object = asObject(value, 'RPC frame');
    if (object.dshRpc !== DSH_RPC_VERSION) {
        throw new DshRpcProtocolError(`unsupported dshRpc marker: ${String(object.dshRpc)}`);
    }
    const hasId = Object.prototype.hasOwnProperty.call(object, 'id');
    const hasMethod = Object.prototype.hasOwnProperty.call(object, 'method');
    const hasResult = Object.prototype.hasOwnProperty.call(object, 'result');
    const hasError = Object.prototype.hasOwnProperty.call(object, 'error');
    if (hasMethod) {
        if (typeof object.method !== 'string' || object.method.length === 0) {
            throw new DshRpcProtocolError('RPC method must be a non-empty string');
        }
        if (hasResult || hasError)
            throw new DshRpcProtocolError('RPC request cannot also be a response');
        if (object.params !== undefined)
            asObject(object.params, 'RPC params');
        if (hasId)
            assertRpcId(object.id);
        return object;
    }
    if (!hasId)
        throw new DshRpcProtocolError('RPC response is missing id');
    assertRpcId(object.id);
    if (hasResult === hasError) {
        throw new DshRpcProtocolError('RPC response must contain exactly one of result or error');
    }
    if (hasError)
        parseErrorBody(object.error);
    return object;
}
export function parseServerHello(notification) {
    if (notification.method !== 'server/hello') {
        throw new DshRpcProtocolError(`expected server/hello, received ${notification.method}`);
    }
    const params = asObject(notification.params, 'server/hello params');
    const protocol = parseProtocolRange(params.protocol);
    const platform = asObject(params.platform, 'server/hello platform');
    const capabilities = asObject(params.capabilities, 'server/hello capabilities');
    const limits = asObject(params.limits, 'server/hello limits');
    if (typeof params.helperVersion !== 'string' || params.helperVersion.length === 0) {
        throw new DshRpcProtocolError('server/hello helperVersion must be a non-empty string');
    }
    if (typeof params.serverInstanceId !== 'string' || params.serverInstanceId.length === 0) {
        throw new DshRpcProtocolError('server/hello serverInstanceId must be a non-empty string');
    }
    if (typeof params.serverEpoch !== 'string' && typeof params.serverEpoch !== 'number') {
        throw new DshRpcProtocolError('server/hello serverEpoch must be a string or number');
    }
    for (const key of ['system', 'release', 'machine', 'python']) {
        if (typeof platform[key] !== 'string') {
            throw new DshRpcProtocolError(`server/hello platform.${key} must be a string`);
        }
    }
    if (platform.home !== undefined && (typeof platform.home !== 'string' || !platform.home.startsWith('/'))) {
        throw new DshRpcProtocolError('server/hello platform.home must be an absolute path when present');
    }
    if (platform.shell !== undefined && (typeof platform.shell !== 'string' || !platform.shell.startsWith('/'))) {
        throw new DshRpcProtocolError('server/hello platform.shell must be an absolute path when present');
    }
    return {
        protocol,
        helperVersion: params.helperVersion,
        serverInstanceId: params.serverInstanceId,
        serverEpoch: params.serverEpoch,
        platform: platform,
        capabilities,
        limits,
    };
}
export function parseInitializeResult(value) {
    const result = asObject(value, 'initialize result');
    if (result.protocol !== DSH_RPC_PROTOCOL) {
        throw new DshRpcProtocolError(`helper selected unsupported protocol ${String(result.protocol)}`);
    }
    const session = asObject(result.session, 'initialize session');
    for (const key of ['sessionId', 'clientId', 'resumeToken']) {
        if (typeof session[key] !== 'string' || session[key].length === 0) {
            throw new DshRpcProtocolError(`initialize session.${key} must be a non-empty string`);
        }
    }
    if (typeof session.resumed !== 'boolean') {
        throw new DshRpcProtocolError('initialize session.resumed must be boolean');
    }
    if (!Number.isSafeInteger(session.retentionMs) || Number(session.retentionMs) < 0) {
        throw new DshRpcProtocolError('initialize session.retentionMs must be a non-negative integer');
    }
    if (typeof session.serverEpoch !== 'string' && typeof session.serverEpoch !== 'number') {
        throw new DshRpcProtocolError('initialize session.serverEpoch must be a string or number');
    }
    return {
        protocol: DSH_RPC_PROTOCOL,
        session: session,
        capabilities: asObject(result.capabilities, 'initialize capabilities'),
        limits: asObject(result.limits, 'initialize limits'),
    };
}
export function assertProtocolCompatible(hello) {
    if (hello.protocol.min > DSH_RPC_PROTOCOL || hello.protocol.max < DSH_RPC_PROTOCOL) {
        throw new DshRpcProtocolError(`helper protocol range ${hello.protocol.min}-${hello.protocol.max} does not include ${DSH_RPC_PROTOCOL}`);
    }
}
function parseProtocolRange(value) {
    const protocol = asObject(value, 'protocol range');
    if (!Number.isSafeInteger(protocol.min) || !Number.isSafeInteger(protocol.max)) {
        throw new DshRpcProtocolError('protocol min/max must be safe integers');
    }
    if (Number(protocol.min) < 1 || Number(protocol.max) < Number(protocol.min)) {
        throw new DshRpcProtocolError('invalid protocol range');
    }
    return { min: Number(protocol.min), max: Number(protocol.max) };
}
function parseErrorBody(value) {
    const error = asObject(value, 'RPC error');
    if (typeof error.code !== 'string' || error.code.length === 0) {
        throw new DshRpcProtocolError('RPC error.code must be a non-empty string');
    }
    if (typeof error.message !== 'string')
        throw new DshRpcProtocolError('RPC error.message must be a string');
    if (typeof error.retryable !== 'boolean')
        throw new DshRpcProtocolError('RPC error.retryable must be boolean');
    return error;
}
function assertRpcId(value) {
    if (typeof value === 'string' && value.length > 0)
        return;
    if (typeof value === 'number' && Number.isSafeInteger(value))
        return;
    throw new DshRpcProtocolError('RPC id must be a non-empty string or safe integer');
}
function asObject(value, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new DshRpcProtocolError(`${label} must be an object`);
    }
    return value;
}
//# sourceMappingURL=protocol.js.map