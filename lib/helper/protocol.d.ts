/** Wire vocabulary shared by the local SSH controller and dsh_remote_helper.py. */
export declare const DSH_RPC_VERSION: "1";
export declare const DSH_RPC_PROTOCOL: 1;
export declare const DSH_RPC_MAX_LINE_BYTES: number;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
    [key: string]: JsonValue;
}
export type RpcId = string | number;
export interface DshRpcRequest {
    dshRpc: typeof DSH_RPC_VERSION;
    id: RpcId;
    method: string;
    params?: JsonObject;
}
export interface DshRpcNotification {
    dshRpc: typeof DSH_RPC_VERSION;
    method: string;
    params?: JsonObject;
}
export interface DshRpcSuccess {
    dshRpc: typeof DSH_RPC_VERSION;
    id: RpcId;
    result: JsonValue;
}
export interface DshRpcErrorBody {
    code: string;
    message: string;
    retryable: boolean;
    data?: JsonValue;
}
export interface DshRpcFailure {
    dshRpc: typeof DSH_RPC_VERSION;
    id: RpcId;
    error: DshRpcErrorBody;
}
export type DshRpcFrame = DshRpcRequest | DshRpcNotification | DshRpcSuccess | DshRpcFailure;
export interface HelperProtocolRange {
    min: number;
    max: number;
}
export interface HelperPlatform {
    system: string;
    release: string;
    machine: string;
    python: string;
    home?: string;
    shell?: string;
}
export type HelperCapabilities = Readonly<Record<string, JsonValue>>;
export type HelperLimits = Readonly<Record<string, JsonValue>>;
export interface ServerHello {
    protocol: HelperProtocolRange;
    helperVersion: string;
    serverInstanceId: string;
    serverEpoch: string | number;
    platform: HelperPlatform;
    capabilities: HelperCapabilities;
    limits: HelperLimits;
}
export interface InitializeParams {
    clientId: string;
    clientName?: string;
    clientVersion?: string;
    protocol?: HelperProtocolRange;
    resumeToken?: string;
    retentionMs?: number;
}
export interface HelperSession {
    sessionId: string;
    clientId: string;
    resumeToken: string;
    resumed: boolean;
    retentionMs: number;
    serverEpoch: string | number;
}
export interface InitializeResult {
    protocol: number;
    session: HelperSession;
    capabilities: HelperCapabilities;
    limits: HelperLimits;
}
export type HelperNotificationListener = (notification: DshRpcNotification) => void;
export declare class DshRpcProtocolError extends Error {
    constructor(message: string, options?: ErrorOptions);
}
/** Parse and minimally validate one JSON-decoded wire frame. */
export declare function parseDshRpcFrame(value: unknown): DshRpcFrame;
export declare function parseServerHello(notification: DshRpcNotification): ServerHello;
export declare function parseInitializeResult(value: unknown): InitializeResult;
export declare function assertProtocolCompatible(hello: ServerHello): void;
//# sourceMappingURL=protocol.d.ts.map