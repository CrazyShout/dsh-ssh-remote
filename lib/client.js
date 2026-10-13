window.__ModuleLoader__.load({ id: "dsh-ssh-remote", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// client/index.tsx
var index_exports = {};
__export(index_exports, {
  SshDirectoryFlow: () => SshDirectoryFlow,
  SshRemotePanel: () => SshRemotePanel,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react5 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/local-browse.ts
function windowsDriveAnchors(entries) {
  return entries.filter((entry) => /^[A-Za-z]$/.test(entry.name)).map((entry) => ({
    label: `Windows \xB7 ${entry.name.toUpperCase()}:`,
    path: `/mnt/${entry.name.toLowerCase()}`
  })).sort((a, b) => a.path.localeCompare(b.path));
}
function isDirectoryPickerUnavailable(reason) {
  if (!(reason instanceof Error)) return false;
  const code = reason.rpcError?.code;
  return code === "directory-picker-unavailable" || code === "directory-picker/unavailable";
}
async function probeLocalBrowse(listHome) {
  try {
    await listHome();
    return true;
  } catch (reason) {
    if (isDirectoryPickerUnavailable(reason)) return false;
    throw reason;
  }
}

// client/editor-schema.ts
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid editor object");
  return value;
}
var string = { parse(value) {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
} };
var save = { parse(value) {
  const row = object(value);
  for (const key of ["rootUri", "path", "version", "text", "operationId"]) string.parse(row[key]);
  if (typeof row.bom !== "boolean" || !["lf", "crlf"].includes(String(row.newline))) throw new Error("invalid editor encoding");
  return value;
} };
var document = { parse(value) {
  const row = object(value);
  save.parse({ ...row, operationId: "" });
  for (const key of ["sessionId", "alias"]) string.parse(row[key]);
  if (typeof row.maxBytes !== "number" || row.maxBytes <= 0) throw new Error("invalid editor limit");
  return value;
} };
var result = { parse(value) {
  const row = object(value);
  if (!["pending", "saved", "conflict", "failed", "unknown"].includes(String(row.state))) throw new Error("invalid editor state");
  for (const key of ["version", "message"]) if (row[key] !== void 0) string.parse(row[key]);
  if (row.state === "saved") string.parse(row.version);
  return value;
} };
var parameter = (name2, schema = string) => ({
  name: name2,
  wire: name2,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#editor/${name2}`, create: () => schema }
});
var scope = {
  name: "workspaceFileScope",
  wire: "workspaceFileScopeId",
  source: "lookup",
  lookup: "workspaceFileScope",
  codec: { mode: "strict", typeSymbol: "@deepseek-ai/dsh-session/types#SessionId", create: () => string }
};
function invocation(method, parameters, schema, cancellable = true) {
  return {
    id: `dsh-ssh-remote#sshRemoteEditor/${method}`,
    service: "sshRemoteEditor",
    namespace: "sshRemoteEditor",
    method,
    invocation: { kind: "direct" },
    parameters: [scope, ...parameters],
    ...cancellable ? { cancellation: { parameter: "signal" } } : {},
    result: { mode: "strict", typeSymbol: `dsh-ssh-remote#editor/${method}Result`, create: () => schema },
    sourceLocation: { file: "src/editor.ts", line: 1, column: 1 }
  };
}
var editorInvocations = [
  invocation("read", [parameter("path")], document),
  invocation("save", [parameter("request", save)], result, false),
  invocation("status", [parameter("operationId")], result)
];

// client/file-search-schema.ts
var string2 = { parse(value) {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
} };
var bool = { parse(value) {
  if (typeof value !== "boolean") throw new Error("expected boolean");
  return value;
} };
var status = { parse(value) {
  if (!value || typeof value !== "object") throw new Error("invalid index status");
  const row = value;
  if (!["idle", "building", "ready", "partial", "error"].includes(String(row.state))) throw new Error("invalid index state");
  for (const key of ["generation", "count", "pathBytes", "unsupported"]) if (typeof row[key] !== "number" || !Number.isSafeInteger(row[key]) || Number(row[key]) < 0) throw new Error("invalid index number");
  bool.parse(row.stale);
  bool.parse(row.complete);
  string2.parse(row.message);
  return value;
} };
var result2 = { parse(value) {
  status.parse(value);
  const row = value;
  string2.parse(row.sessionId);
  string2.parse(row.rootUri);
  if (!Array.isArray(row.candidates) || row.candidates.length > 50) throw new Error("invalid file candidates");
  for (const item of row.candidates) {
    string2.parse(item.path);
    if (!["file", "directory"].includes(item.kind)) throw new Error("invalid candidate kind");
  }
  return value;
} };
var parameter2 = (name2, schema) => ({
  name: name2,
  wire: name2,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#file-search/${name2}`, create: () => schema }
});
var scope2 = {
  name: "workspaceFileScope",
  wire: "workspaceFileScopeId",
  source: "lookup",
  lookup: "workspaceFileScope",
  codec: { mode: "strict", typeSymbol: "@deepseek-ai/dsh-session/types#SessionId", create: () => string2 }
};
function invocation2(method, parameters, schema) {
  return {
    id: `dsh-ssh-remote#sshRemoteFiles/${method}`,
    service: "sshRemoteFiles",
    namespace: "sshRemoteFiles",
    method,
    invocation: { kind: "direct" },
    parameters: [scope2, ...parameters],
    cancellation: { parameter: "signal" },
    result: { mode: "strict", typeSymbol: `dsh-ssh-remote#file-search/${method}Result`, create: () => schema },
    sourceLocation: { file: "src/file-search.ts", line: 1, column: 1 }
  };
}
var fileSearchInvocations = [
  invocation2("query", [parameter2("query", string2), parameter2("includeIgnored", bool)], result2),
  invocation2("status", [parameter2("includeIgnored", bool)], status),
  invocation2("refresh", [parameter2("includeIgnored", bool)], status)
];

// client/typert.remote-client.ts
function object2(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
var stringSchema = { parse(value) {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
} };
var helperStatusSchema = {
  parse(value) {
    const row = object2(value, "helper status");
    for (const key of ["status", "version", "sessionId", "error"]) {
      if (typeof row[key] !== "string") throw new Error(`helper.${key} must be a string`);
    }
    object2(row.capabilities, "helper capabilities");
    for (const key of ["errorCode", "hint"]) {
      if (row[key] !== void 0 && typeof row[key] !== "string") throw new Error(`helper.${key} must be a string`);
    }
    if (row.retryable !== void 0 && typeof row.retryable !== "boolean") throw new Error("helper.retryable must be boolean");
    if (row.environment !== void 0) {
      const environment = object2(row.environment, "helper environment");
      const search = object2(environment.search, "helper search");
      if (typeof search.available !== "boolean") throw new Error("search.available must be boolean");
      for (const key of ["path", "version", "error"]) {
        if (search[key] !== void 0 && typeof search[key] !== "string") throw new Error(`search.${key} must be a string`);
      }
    }
    return value;
  }
};
var configSchema = {
  parse(value) {
    const config = object2(value, "SSH config");
    if (typeof config.configPath !== "string" || typeof config.configExists !== "boolean") throw new Error("invalid SSH config");
    if (!Array.isArray(config.hosts) || typeof config.legacyHostCount !== "number") throw new Error("invalid SSH hosts");
    for (const item of config.hosts) {
      const host = object2(item, "SSH host");
      for (const key of ["alias", "host", "user", "identityFile", "proxyJump", "proxyCommand"]) {
        if (typeof host[key] !== "string") throw new Error(`host.${key} must be a string`);
      }
      if (typeof host.port !== "number") throw new Error("host.port must be a number");
      helperStatusSchema.parse(host.helper);
    }
    return value;
  }
};
var statusesSchema = {
  parse(value) {
    const statuses = object2(value, "helper statuses");
    for (const status2 of Object.values(statuses)) helperStatusSchema.parse(status2);
    return value;
  }
};
var directoryEntrySchema = {
  parse(value) {
    const entry = object2(value, "directory entry");
    if (typeof entry.name !== "string" || typeof entry.path !== "string" || typeof entry.hidden !== "boolean") {
      throw new Error("invalid directory entry");
    }
    return value;
  }
};
var directoryListingSchema = {
  parse(value) {
    const listing = object2(value, "directory listing");
    if (typeof listing.path !== "string" || typeof listing.home !== "string" || typeof listing.truncated !== "boolean") {
      throw new Error("invalid directory listing");
    }
    if (!Array.isArray(listing.crumbs) || !Array.isArray(listing.entries)) throw new Error("invalid directory rows");
    listing.crumbs.forEach(directoryEntrySchema.parse);
    listing.entries.forEach(directoryEntrySchema.parse);
    return value;
  }
};
var workspaceAnchorSchema = {
  parse(value) {
    const anchor = object2(value, "workspace anchor");
    for (const key of ["anchorPath", "uri", "alias", "remotePath", "title"]) {
      if (typeof anchor[key] !== "string") throw new Error(`anchor.${key} must be a string`);
    }
    if (typeof anchor.createdAt !== "number") throw new Error("anchor.createdAt must be a number");
    return value;
  }
};
var workspaceInfoSchema = {
  parse(value) {
    if (value === null) return value;
    const info = object2(value, "remote workspace");
    for (const key of ["alias", "remotePath", "uri"]) {
      if (typeof info[key] !== "string") throw new Error(`remote workspace.${key} must be a string`);
    }
    return value;
  }
};
var diagnosticsSchema = {
  parse(value) {
    helperStatusSchema.parse(value);
    const details = object2(value, "helper diagnostics");
    for (const key of ["alias", "helperSha256", "stderr", "assetPath"]) {
      if (typeof details[key] !== "string") throw new Error(`diagnostics.${key} must be a string`);
    }
    for (const key of ["lastConnectedAt", "lastHealthAt", "nextRetryAt"]) {
      if (typeof details[key] !== "number") throw new Error(`diagnostics.${key} must be a number`);
    }
    return value;
  }
};
function parameter3(name2) {
  return { name: name2, wire: name2, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name2}`, create: () => stringSchema } };
}
function invocation3(method, parameters, schema, typeSymbol) {
  return {
    id: `dsh-ssh-remote#sshRemote/${method}`,
    service: "sshRemote",
    namespace: "sshRemote",
    method,
    invocation: { kind: "direct" },
    parameters,
    result: { mode: "strict", typeSymbol, create: () => schema },
    sourceLocation: { file: "src/registry.ts", line: 1, column: 1 }
  };
}
var TYPERT_REMOTE = {
  package: "dsh-ssh-remote",
  descriptors: [
    invocation3("config", [], configSchema, "dsh-ssh-remote#SshConfig"),
    invocation3("statuses", [], statusesSchema, "dsh-ssh-remote#HelperHostStatuses"),
    invocation3("workspaceInfo", [parameter3("path")], workspaceInfoSchema, "dsh-ssh-remote#RemoteWorkspaceInfo"),
    invocation3("browse", [parameter3("alias"), parameter3("path")], directoryListingSchema, "dsh-ssh-remote#RemoteDirectoryListing"),
    invocation3("createDirectory", [parameter3("alias"), parameter3("parent"), parameter3("name")], stringSchema, "string"),
    invocation3("materializeWorkspace", [parameter3("alias"), parameter3("remotePath")], workspaceAnchorSchema, "dsh-ssh-remote#SshWorkspaceAnchor"),
    invocation3("connectHost", [parameter3("alias")], helperStatusSchema, "dsh-ssh-remote#HelperHostStatus"),
    invocation3("disconnectHost", [parameter3("alias")], helperStatusSchema, "dsh-ssh-remote#HelperHostStatus"),
    invocation3("retryHost", [parameter3("alias")], helperStatusSchema, "dsh-ssh-remote#HelperHostStatus"),
    invocation3("diagnostics", [parameter3("alias")], diagnosticsSchema, "dsh-ssh-remote#HelperHostDiagnostics"),
    ...editorInvocations,
    ...fileSearchInvocations
  ]
};
var typert_remote_client_default = TYPERT_REMOTE;

// client/native-panels.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function mountNativePanels(ctx) {
  const fiber = ctx.inject(["remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope3) => {
    const ssh = scope3.remote.sshRemote;
    if (typeof ssh.workspaceInfo !== "function") return () => {
    };
    const workspaceInfo = (path) => ssh.workspaceInfo(path);
    const inject2 = (sessionId) => ({
      workspaceInfo,
      openPanel: (kind) => {
        if (scope3.sidebarRight.mounted.getSnapshot() !== sessionId) {
          throw new Error("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u91CD\u65B0\u6253\u5F00\u3002");
        }
        if (scope3.sidebarRightTabs.get(kind) === void 0) {
          throw new Error(kind === "files" ? "\u6587\u4EF6\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002" : "\u7EC8\u7AEF\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002");
        }
        scope3.sidebarRight.openTab(kind);
      },
      availablePanels: () => (scope3.sidebarRightTabs.get("files") === void 0 ? 0 : 1) | (scope3.sidebarRightTabs.get("terminal") === void 0 ? 0 : 2) | (scope3.sidebarRightTabs.get("ssh-editor") === void 0 ? 0 : 4) | (scope3.sidebarRightTabs.get("ssh-quick-open") === void 0 ? 0 : 8),
      subscribePanels: (listener) => scope3.sidebarRightTabs.subscribe(listener)
    });
    const header = scope3.slots.inject("conversation.session.header.utilities", () => scope3.slots.register({
      name: "conversation.session.header.utilities",
      id: "dsh-ssh-remote.native-panels",
      order: 40,
      inject: inject2
    }, NativePanelActions));
    const blank = scope3.slots.inject("conversation.input.dock", () => scope3.slots.register({
      name: "conversation.input.dock",
      id: "dsh-ssh-remote.native-panels.blank",
      order: 40,
      inject: inject2
    }, BlankNativePanelActions));
    return () => {
      blank();
      header();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
function BlankNativePanelActions(props) {
  const activeTarget = props.useConversation((snapshot) => snapshot.activeTargets.size > 0);
  if (!props.session.blank || props.session.running || props.session.promptAttempted || activeTarget) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NativePanelActions, { ...props, presentation: "dock" });
}
function NativePanelActions({
  sessionId,
  useSessions,
  workspaceInfo,
  openPanel,
  availablePanels,
  subscribePanels,
  presentation = "header"
}) {
  const cwd = useSessions((snapshot) => snapshot.byId[sessionId]?.cwd);
  const key = `${sessionId}\0${cwd ?? ""}`;
  const [resolved, setResolved] = (0, import_react.useState)(null);
  const [failure, setFailure] = (0, import_react.useState)(null);
  const panels = (0, import_react.useSyncExternalStore)(subscribePanels, availablePanels, availablePanels);
  (0, import_react.useEffect)(() => {
    let active = true;
    if (cwd === void 0 || cwd === "") return;
    const timeout = setTimeout(() => {
      active = false;
    }, 1e4);
    void Promise.resolve().then(() => workspaceInfo(cwd)).then((result3) => {
      if (active) setResolved({ key, info: result3.ok ? result3.value : null });
    }, () => {
      if (active) setResolved({ key, info: null });
    }).finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [key, cwd, workspaceInfo]);
  if (resolved?.key !== key || resolved.info === null) return null;
  const info = resolved.info;
  const identity = `${info.alias}:${info.remotePath}`;
  const open = (kind) => {
    setFailure(null);
    try {
      openPanel(kind);
    } catch (error) {
      setFailure({ key, message: error instanceof Error ? error.message : String(error) });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "aria-label": `\u8FDC\u7A0B\u5DE5\u4F5C\u533A ${identity}`, style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0, ...presentation === "dock" ? { justifyContent: "flex-end", marginBottom: 8 } : {} }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { title: identity, style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
      "SSH \xB7 ",
      info.alias
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        size: "sm",
        variant: "ghost",
        disabled: (panels & 1) === 0,
        title: (panels & 1) === 0 ? "DSH \u6587\u4EF6\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002" : `\u6D4F\u89C8 ${identity}\uFF0C\u6587\u4EF6\u9884\u89C8\u4E3A\u53EA\u8BFB\u3002\u672C\u673A\u6253\u5F00 / Finder \u53CA\u5176\u5FEB\u6377\u952E\u4E0D\u652F\u6301 SSH\uFF0C\u53EF\u80FD\u6253\u5F00\u672C\u673A\u540C\u540D\u8DEF\u5F84\u3002`,
        onClick: () => open("files"),
        children: "\u8FDC\u7A0B\u6587\u4EF6"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        size: "sm",
        variant: "ghost",
        disabled: (panels & 2) === 0,
        title: (panels & 2) === 0 ? "DSH \u7EC8\u7AEF\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002" : `\u5728 ${identity} \u6253\u5F00\u4EA4\u4E92\u7EC8\u7AEF\uFF1B\u4F7F\u7528 SSH \u8D26\u53F7\u6743\u9650\uFF0C\u4E0D\u53D7\u6A21\u578B\u6C99\u7BB1\u9650\u5236\u3002`,
        onClick: () => open("terminal"),
        children: "\u8FDC\u7A0B\u7EC8\u7AEF"
      }
    ),
    (panels & 4) !== 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        size: "sm",
        variant: "ghost",
        title: `\u7F16\u8F91 ${identity} \u5185\u7684 UTF-8 \u6587\u672C\uFF0C\u624B\u52A8\u4FDD\u5B58\u5E76\u68C0\u67E5\u7248\u672C\u51B2\u7A81\u3002`,
        onClick: () => open("ssh-editor"),
        children: "\u8FDC\u7A0B\u7F16\u8F91"
      }
    ),
    (panels & 8) !== 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        size: "sm",
        variant: "ghost",
        title: "\u641C\u7D22\u8FDC\u7A0B\u5DE5\u4F5C\u533A\u6587\u4EF6\uFF1B\u9ED8\u8BA4\u53EA\u8BFB\u9884\u89C8\u3002",
        onClick: () => open("ssh-quick-open"),
        children: "\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00"
      }
    ),
    failure?.key === key && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 11 }, children: failure.message })
  ] });
}

// client/markdown-preview.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ":");
}
function encodePath(path) {
  return path.split("/").map(encodeSegment).join("/");
}
function isDriveSegment(segment) {
  return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
}
function sessionFileAddress(sessionId, path) {
  const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
}
function parseFileAddress(address) {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
    const end = address.search(/[?#]/);
    const [scope3, ...rest] = address.slice(20, end === -1 ? void 0 : end).split("/");
    if (scope3 === "session") {
      const [id, ...segments] = rest;
      if (id === void 0 || id === "" || segments.length === 0) return void 0;
      return {
        scope: scope3,
        sessionId: decodeURIComponent(id),
        path: segments.map(decodeURIComponent).join("/")
      };
    }
    if (scope3 === "absolute") {
      const unc = rest[0] === "" && rest.length > 1;
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
      if (segments.length === 0 || segments[0] === "") return void 0;
      if (unc) return {
        scope: scope3,
        path: `//${segments.join("/")}`
      };
      return {
        scope: scope3,
        path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
      };
    }
    return;
  } catch {
    return;
  }
}

// client/markdown-images.ts
var DEFAULT_LIMITS = { entries: 64, imageBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, concurrent: 4, readTimeoutMs: 1e4 };
function imageFilePath(destination) {
  const suffix = destination.search(/[?#]/u);
  let path;
  try {
    path = decodeURIComponent(suffix < 0 ? destination : destination.slice(0, suffix));
  } catch {
    return void 0;
  }
  if (!path || path.includes("\0") || path.startsWith("//") || path.startsWith("\\\\")) return void 0;
  if (!/^[a-z]:[/\\]/iu.test(path) && /^[a-z][a-z\d+.-]*:/iu.test(path)) return void 0;
  return path;
}
var SessionImageCache = class {
  constructor(resourceAddress, read, changed, dependency = () => {
  }, limits = {}, urls = { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) }) {
    __publicField(this, "read", read);
    __publicField(this, "changed", changed);
    __publicField(this, "dependency", dependency);
    __publicField(this, "urls", urls);
    __publicField(this, "file");
    __publicField(this, "entries", /* @__PURE__ */ new Map());
    __publicField(this, "lifetime", new AbortController());
    __publicField(this, "running", 0);
    __publicField(this, "bytes", 0);
    __publicField(this, "limited", false);
    __publicField(this, "disposed", false);
    __publicField(this, "stalled", false);
    __publicField(this, "limits");
    const parsed = parseFileAddress(resourceAddress);
    this.file = parsed?.scope === "session" ? parsed : void 0;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const value of Object.values(this.limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid Markdown image cache limit");
  }
  get(destination) {
    const path = imageFilePath(destination);
    return path === void 0 ? void 0 : this.entries.get(path)?.url;
  }
  get failed() {
    return this.limited || [...this.entries.values()].some((entry) => entry.state === "failed");
  }
  /** Called after React commits, never from the Markdown resolver's render pass. */
  request(destinations) {
    if (this.disposed || this.stalled || this.file === void 0) return;
    let newlyLimited = false;
    for (const destination of destinations) {
      const path = imageFilePath(destination);
      if (path === void 0 || this.entries.has(path)) continue;
      if (this.entries.size >= this.limits.entries) {
        newlyLimited || (newlyLimited = !this.limited);
        this.limited = true;
        continue;
      }
      this.entries.set(path, { path, state: "queued" });
    }
    this.pump();
    if (newlyLimited) this.changed();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort(new Error("Markdown image document changed or closed"));
    for (const entry of this.entries.values()) if (entry.url !== void 0) this.urls.revoke(entry.url);
    this.entries.clear();
    this.bytes = 0;
  }
  pump() {
    if (this.disposed || this.stalled) return;
    for (const entry of this.entries.values()) {
      if (this.running >= this.limits.concurrent) return;
      if (entry.state !== "queued") continue;
      entry.state = "loading";
      this.running += 1;
      void this.load(entry).then(() => {
        entry.state = "loaded";
      }, () => {
        entry.state = "failed";
      }).finally(() => {
        this.running -= 1;
        if (!this.disposed) {
          this.changed();
          this.pump();
        }
      });
    }
  }
  async load(entry) {
    const file = this.file;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error("Markdown image read timed out")), this.limits.readTimeoutMs);
    const signal = AbortSignal.any([this.lifetime.signal, timeout.signal]);
    const chunks = [];
    let offset = 0;
    let version;
    let absolutePath;
    try {
      for (; ; ) {
        signal.throwIfAborted();
        const result3 = await abortable(this.read(file.sessionId, entry.path, {
          baseFile: file.path,
          range: { offset, length: Math.min(64 * 1024, this.limits.imageBytes - offset + 1) }
        }, signal), signal);
        if (!result3.ok) throw new Error(result3.error.message);
        const part = result3.value;
        if (!(part.data instanceof Uint8Array) || part.offset !== offset || part.bytes !== void 0 && part.bytes > this.limits.imageBytes || offset + part.data.byteLength > this.limits.imageBytes || version !== void 0 && (version !== part.version || absolutePath !== part.absolutePath)) {
          throw new Error("Markdown image is too large or changed during reading");
        }
        version = part.version;
        absolutePath = part.absolutePath;
        chunks.push(part.data);
        offset += part.data.byteLength;
        if (part.eof) break;
        if (part.data.byteLength === 0) throw new Error("Markdown image read made no progress");
      }
      signal.throwIfAborted();
      if (this.bytes + offset > this.limits.totalBytes) throw new Error("Markdown image cache is full");
      const data = new Uint8Array(offset);
      let start = 0;
      for (const chunk of chunks) {
        data.set(chunk, start);
        start += chunk.byteLength;
      }
      const mime = imageMime(data);
      if (mime === void 0) throw new Error("Markdown image format is unsupported");
      const url = this.urls.create(new Blob([data], { type: mime }));
      if (this.disposed) {
        this.urls.revoke(url);
        return;
      }
      entry.url = url;
      this.bytes += offset;
      this.dependency(sessionFileAddress(file.sessionId, absolutePath));
    } catch (error) {
      if (timeout.signal.aborted) {
        this.stalled = true;
        for (const queued of this.entries.values()) if (queued.state === "queued") queued.state = "failed";
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
};
function imageMime(data) {
  const signature = [...data.subarray(0, 12)].map((value) => String.fromCharCode(value)).join("");
  if (signature.startsWith("\x89PNG\r\n\n")) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/u.test(signature)) return "image/gif";
  if (signature.startsWith("RIFF") && signature.slice(8) === "WEBP") return "image/webp";
  if (signature.startsWith("BM")) return "image/bmp";
  if (signature.slice(4, 8) === "ftyp" && ["avif", "avis"].includes(signature.slice(8))) return "image/avif";
  const text = new TextDecoder().decode(data.subarray(0, 4096)).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/u.test(text)) return "image/svg+xml";
  return void 0;
}
function abortable(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then((value) => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

// client/markdown-preview.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var MARKDOWN_BODY = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown";
var en = { copy: "Copy", copied: "Copied", code: "Code", wrap: "Wrap", unwrap: "Unwrap", footnotes: "Footnotes", failed: "Some images could not be loaded in this session." };
var zh = { copy: "\u590D\u5236", copied: "\u5DF2\u590D\u5236", code: "\u4EE3\u7801", wrap: "\u81EA\u52A8\u6362\u884C", unwrap: "\u53D6\u6D88\u81EA\u52A8\u6362\u884C", footnotes: "\u811A\u6CE8", failed: "\u90E8\u5206\u56FE\u7247\u65E0\u6CD5\u5728\u6B64\u4F1A\u8BDD\u4E2D\u52A0\u8F7D\u3002" };
function mountSessionMarkdownImages(ctx) {
  const fiber = ctx.inject(["slots", "locale", "remote.workspaceFiles"], (scope3) => {
    if (typeof scope3.remote.workspaceFiles?.readBytes !== "function") return () => {
    };
    const readImageBytes = (sessionId, path, options, signal) => scope3.remote.workspaceFiles.readBytes(sessionId, path, options, signal);
    const dictionary = scope3.locale.register("sshRemoteMarkdown", { en, zh });
    try {
      const slot = scope3.slots.inject("sidebar.right.tab.document", () => scope3.slots.register({
        name: "sidebar.right.tab.document",
        key: MARKDOWN_BODY,
        priority: -100,
        locale: "sshRemoteMarkdown",
        inject: () => ({ readImageBytes })
      }, SessionMarkdownPreview));
      return () => {
        slot();
        dictionary();
      };
    } catch (error) {
      dictionary();
      throw error;
    }
  });
  return async () => {
    await fiber.dispose();
  };
}
function SessionMarkdownPreview(props) {
  const metadata = props.useResource(props.resourceAddress);
  const [source, setSource] = (0, import_react2.useState)({ address: props.resourceAddress, version: metadata.value?.version, content: props.content, revision: 0 });
  let current = source;
  if (source.address !== props.resourceAddress || source.version !== metadata.value?.version || source.content !== props.content) {
    const append = source.content.kind === "text" && props.content.kind === "text" && !source.content.eof && props.content.text.startsWith(source.content.text);
    current = {
      address: props.resourceAddress,
      version: metadata.value?.version,
      content: props.content,
      revision: source.revision + (source.address === props.resourceAddress && source.version === metadata.value?.version && append ? 0 : 1)
    };
    setSource(current);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MarkdownImageBody, { ...props }, current.revision);
}
function MarkdownImageBody({ content, resourceAddress, readImageBytes, setResources, t }) {
  const [, render] = (0, import_react2.useReducer)((value) => value + 1, 0);
  const [cache, setCache] = (0, import_react2.useState)();
  (0, import_react2.useEffect)(() => {
    const dependencies = /* @__PURE__ */ new Set();
    setResources([]);
    const current = new SessionImageCache(resourceAddress, readImageBytes, render, (address) => {
      dependencies.add(address);
      setResources([...dependencies]);
    });
    setCache(current);
    return () => {
      current.dispose();
      setResources([]);
    };
  }, [resourceAddress, readImageBytes, setResources]);
  const requested = /* @__PURE__ */ new Map();
  const pathImages = { resolve: (value) => {
    const path = imageFilePath(value);
    if (path !== void 0 && requested.size < (cache?.limits.entries ?? 64) + 1) requested.set(path, value);
    return cache?.get(value);
  } };
  (0, import_react2.useEffect)(() => {
    cache?.request(requested.values());
  });
  const labels = (0, import_react2.useMemo)(() => ({ code: {
    copyLabel: t("copy"),
    copiedLabel: t("copied"),
    toolbarLabels: { codeLabel: t("code"), wrapLabel: t("wrap"), unwrapLabel: t("unwrap") }
  }, footnotes: t("footnotes") }), [t]);
  if (content.kind !== "text") return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { "data-document-markdown": true, style: { minWidth: 0, fontFamily: "var(--dsw-font,inherit)", whiteSpace: "normal", padding: "10px 12px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.MarkdownText, { text: content.text, streaming: !content.eof, labels, pathImages }),
    cache?.failed && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { role: "status", children: t("failed") })
  ] });
}

// client/editor.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/editor-model.ts
var EditorModel = class {
  constructor(sessionId, remote, timeoutMs = 9e4) {
    __publicField(this, "sessionId", sessionId);
    __publicField(this, "remote", remote);
    __publicField(this, "timeoutMs", timeoutMs);
    __publicField(this, "state", { draft: "", message: "", reading: false, saving: false });
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "generation", 0);
    __publicField(this, "reader");
    __publicField(this, "attempt");
    __publicField(this, "confirmedAction");
    __publicField(this, "snapshot", () => this.state);
    __publicField(this, "subscribe", (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    });
  }
  get dirty() {
    return this.state.document !== void 0 && this.state.draft !== this.state.document.text;
  }
  get unsettled() {
    return this.state.saving || this.state.outcome === "pending" || this.state.outcome === "unknown";
  }
  get needsProtection() {
    return this.dirty || this.unsettled;
  }
  edit(text) {
    this.update({ draft: text, ...this.state.outcome === "saved" ? { message: text === this.state.document?.text ? "\u5DF2\u4FDD\u5B58\u3002" : "\u5C1A\u672A\u4FDD\u5B58\u3002" } : {} });
  }
  notice(message2) {
    this.update({ message: message2 });
  }
  requestOpen(path) {
    if (this.unsettled) {
      this.notice("\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u5207\u6362\u6587\u4EF6\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002");
      return;
    }
    if (this.dirty) this.ask("discard", () => {
      void this.open(path, true);
    });
    else void this.open(path);
  }
  requestClose(close) {
    if (!this.needsProtection) return true;
    this.ask("close", close);
    return false;
  }
  confirm(accept) {
    const action = this.confirmedAction;
    this.confirmedAction = void 0;
    this.update({ confirmation: void 0 });
    if (accept) action?.();
  }
  ask(confirmation, action) {
    this.confirmedAction = action;
    this.update({ confirmation });
  }
  async open(path, discard = false) {
    if (this.unsettled) {
      this.notice("\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u5207\u6362\u6587\u4EF6\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002");
      return;
    }
    if (this.dirty && !discard) {
      this.notice("\u8BF7\u5148\u4FDD\u5B58\uFF0C\u6216\u786E\u8BA4\u653E\u5F03\u5F53\u524D\u8349\u7A3F\u3002");
      return;
    }
    this.reader?.abort();
    const reader = this.reader = new AbortController();
    const generation = ++this.generation;
    this.update({ reading: true, message: "\u6B63\u5728\u8BFB\u53D6\u5B8C\u6574\u6587\u4EF6\u2026" });
    try {
      const result3 = await bounded(this.remote.read(this.sessionId, path, reader.signal), this.timeoutMs, () => reader.abort());
      if (reader.signal.aborted || generation !== this.generation) return;
      if (!result3.ok) throw new Error(result3.error.message);
      if (result3.value.sessionId !== this.sessionId) throw new Error("\u6587\u4EF6\u4F1A\u8BDD\u8EAB\u4EFD\u4E0D\u5339\u914D\uFF0C\u672A\u6253\u5F00\u3002");
      this.attempt = void 0;
      this.update({
        document: result3.value,
        draft: result3.value.text,
        outcome: void 0,
        remoteText: void 0,
        message: "\u624B\u52A8\u4FDD\u5B58\uFF1B\u8349\u7A3F\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u4E2D\u4FDD\u7559\u3002"
      });
    } catch (error) {
      if (generation === this.generation) this.notice(message(error));
    } finally {
      if (generation === this.generation) this.update({ reading: false });
    }
  }
  async save() {
    const document2 = this.state.document;
    if (!document2 || this.state.reading || this.unsettled || !this.dirty) return;
    const encoded = (document2.bom ? "\uFEFF" : "") + (document2.newline === "crlf" ? this.state.draft.replace(/\n/gu, "\r\n") : this.state.draft);
    if (new TextEncoder().encode(encoded).byteLength > document2.maxBytes) {
      this.update({ outcome: "failed", message: `\u5185\u5BB9\u8D85\u8FC7 ${document2.maxBytes / 1024} KiB\uFF0C\u672A\u53D1\u9001\u4FDD\u5B58\uFF1B\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002` });
      return;
    }
    const attempt = this.attempt = { id: operationId(), text: this.state.draft, document: document2 };
    this.update({ saving: true, outcome: "pending", message: "\u6B63\u5728\u4FDD\u5B58\u2026" });
    try {
      const result3 = await bounded(this.remote.save(this.sessionId, {
        ...document2,
        text: attempt.text,
        operationId: attempt.id
      }), this.timeoutMs);
      if (!result3.ok) {
        const code = result3.error.code;
        if (code === "ssh-editor/refused" || code === "gateway/bad-request") {
          this.accept({ state: "failed", message: result3.error.message }, attempt);
          return;
        }
        throw new Error(result3.error.message);
      }
      this.accept(result3.value, attempt);
    } catch (error) {
      this.update({ outcome: "unknown", message: `\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002${message(error)}` });
    } finally {
      this.update({ saving: false });
    }
  }
  async verify() {
    if (!this.attempt || this.state.saving) return;
    const attempt = this.attempt;
    const controller = new AbortController();
    this.update({ saving: true, message: "\u6B63\u5728\u6838\u5BF9\u4FDD\u5B58\u56DE\u6267\u4E0E\u8FDC\u7AEF\u5185\u5BB9\u2026" });
    try {
      const result3 = await bounded(this.remote.status(this.sessionId, attempt.id, controller.signal), this.timeoutMs, () => controller.abort());
      if (!result3.ok) throw new Error(result3.error.message);
      this.accept(result3.value, attempt);
    } catch (error) {
      this.notice(`\u6838\u5BF9\u5931\u8D25\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002${message(error)}`);
    } finally {
      this.update({ saving: false });
    }
  }
  async compare() {
    const document2 = this.state.document;
    if (!document2 || this.state.reading) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.update({ reading: true });
    try {
      const result3 = await bounded(this.remote.read(this.sessionId, document2.path, controller.signal), this.timeoutMs, () => controller.abort());
      if (generation !== this.generation) return;
      if (!result3.ok) throw new Error(result3.error.message);
      if (result3.value.rootUri !== document2.rootUri || result3.value.path !== document2.path || result3.value.sessionId !== this.sessionId) {
        throw new Error("\u6587\u4EF6\u8EAB\u4EFD\u5DF2\u6539\u53D8\uFF0C\u672A\u91C7\u7528\u8BE5\u5185\u5BB9\u3002");
      }
      this.update({ remoteText: result3.value.text, message: "\u4E0B\u65B9\u4E3A\u6700\u65B0\u8FDC\u7AEF\u5185\u5BB9\uFF1B\u4F60\u7684\u8349\u7A3F\u548C\u4FDD\u5B58\u57FA\u7EBF\u5C1A\u672A\u6539\u53D8\u3002" });
    } catch (error) {
      if (generation === this.generation) this.notice(message(error));
    } finally {
      if (generation === this.generation) this.update({ reading: false });
    }
  }
  dispose() {
    this.generation++;
    this.reader?.abort();
    this.listeners.clear();
  }
  accept(result3, attempt) {
    if (this.attempt !== attempt) return;
    if (result3.state === "saved" && result3.version) {
      this.update({
        document: { ...attempt.document, text: attempt.text, version: result3.version },
        outcome: "saved",
        remoteText: void 0,
        message: result3.message ?? "\u5DF2\u4FDD\u5B58\u3002"
      });
    } else this.update({ outcome: result3.state, message: result3.message ?? (result3.state === "pending" ? "\u4FDD\u5B58\u4ECD\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u6838\u5BF9\u3002" : "\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002") });
  }
  update(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
};
function operationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function bounded(promise, timeout, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("\u8BF7\u6C42\u8D85\u65F6\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002"));
    }, timeout);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// client/editor.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var KIND = "ssh-editor";
var ID = "dsh-ssh-remote.editor";
function mountRemoteEditor(ctx, bridge) {
  const fiber = ctx.inject(["remote.sshRemoteEditor", "remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope3) => {
    if (!scope3.sidebarRightTabs || !scope3.sidebarRight || typeof scope3.remote.sshRemoteEditor?.read !== "function") return () => {
    };
    const buffers = /* @__PURE__ */ new Map();
    const model = (sessionId) => {
      let buffer = buffers.get(sessionId);
      if (!buffer) {
        for (const [id, existing] of buffers) {
          if (!existing.needsProtection && !existing.snapshot().reading && !scope3.sidebarRight.tabsIn(id).some((tab) => tab.kind === KIND)) {
            existing.dispose();
            buffers.delete(id);
          }
        }
        if (buffers.size >= 32) throw new Error("\u5DF2\u8FBE\u5230 32 \u4E2A\u4F1A\u8BDD\u7F16\u8F91\u7F13\u51B2\u4E0A\u9650\uFF1B\u8BF7\u5148\u4FDD\u5B58\u8349\u7A3F\u540E\u91CD\u542F\u3002");
        buffer = new EditorModel(sessionId, scope3.remote.sshRemoteEditor);
        buffers.set(sessionId, buffer);
      }
      return buffer;
    };
    const unregister = scope3.sidebarRightTabs.register({
      id: ID,
      kind: KIND,
      keepMounted: true,
      title: () => "\u8FDC\u7A0B\u7F16\u8F91",
      guide: []
    });
    const openEditor = (sessionId, path) => {
      if (scope3.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u3002");
      const buffer = model(sessionId);
      scope3.sidebarRight.openTab(KIND);
      buffer.requestOpen(path);
    };
    if (bridge) bridge.open = openEditor;
    const confirmedClosures = /* @__PURE__ */ new Set();
    const close = scope3.sidebarRight.registerCloseHandler(KIND, (sessionId, tab) => {
      const key = `${sessionId}\0${tab.id}`;
      if (confirmedClosures.has(key)) return;
      const buffer = buffers.get(sessionId);
      if (buffer && !buffer.requestClose(() => {
        confirmedClosures.add(key);
        try {
          scope3.sidebarRight.closeIn(sessionId, tab.id);
        } finally {
          confirmedClosures.delete(key);
        }
      })) {
        throw new Error("\u5DF2\u4FDD\u7559\u8349\u7A3F\uFF0C\u8BF7\u5728\u7F16\u8F91\u5668\u5185\u786E\u8BA4\u662F\u5426\u5173\u95ED\u3002");
      }
    });
    const body = scope3.slots.inject("sidebar.right.pane.tab", () => scope3.slots.register({
      name: "sidebar.right.pane.tab",
      key: ID,
      inject: (sessionId) => ({ model: model(sessionId) })
    }, RemoteEditorPane));
    const title = scope3.slots.inject("sidebar.right.pane.tab.title", () => scope3.slots.register({
      name: "sidebar.right.pane.tab.title",
      key: ID,
      inject: (sessionId) => ({ model: model(sessionId) })
    }, RemoteEditorTitle));
    const menu = scope3.slots.inject("sidebar.right.tab.menu.item", () => scope3.slots.register({
      name: "sidebar.right.tab.menu.item",
      id: `${ID}.open`,
      inject: (sessionId) => ({
        workspaceInfo: scope3.remote.sshRemote.workspaceInfo,
        openEditor: (path) => {
          openEditor(sessionId, path);
        }
      })
    }, RemoteEditMenu));
    const protectUnload = (event) => {
      if (![...buffers.values()].some((buffer) => buffer.needsProtection)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => {
      if (bridge?.open === openEditor) bridge.open = void 0;
      window.removeEventListener("beforeunload", protectUnload);
      menu();
      title();
      body();
      close();
      unregister();
      for (const buffer of buffers.values()) buffer.dispose();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
function RemoteEditorPane({ model }) {
  const state = (0, import_react3.useSyncExternalStore)(model.subscribe, model.snapshot, model.snapshot);
  const [path, setPath] = (0, import_react3.useState)("");
  (0, import_react3.useEffect)(() => {
    if (state.document) setPath(state.document.path);
  }, [state.document?.path]);
  const open = (target) => model.requestOpen(target);
  const document2 = state.document;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { "aria-label": "\u8FDC\u7A0B\u6587\u672C\u7F16\u8F91\u5668", style: { height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 12, minWidth: 0 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Modal,
      {
        open: state.confirmation !== void 0,
        onClose: () => model.confirm(false),
        title: state.confirmation === "close" ? "\u5173\u95ED\u8FDC\u7A0B\u7F16\u8F91\u9875\u7B7E\uFF1F" : "\u653E\u5F03\u5F53\u524D\u8349\u7A3F\uFF1F",
        closeLabel: "\u53D6\u6D88",
        description: state.confirmation === "close" ? "\u8349\u7A3F\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u4E2D\u4FDD\u7559\uFF1B\u9000\u51FA\u5E94\u7528\u4F1A\u4E22\u5931\u3002\u5173\u95ED\u9875\u7B7E\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002" : "\u91CD\u65B0\u52A0\u8F7D\u6216\u5207\u6362\u6587\u4EF6\u4F1A\u653E\u5F03\u5F53\u524D\u672A\u4FDD\u5B58\u4FEE\u6539\uFF1B\u53EA\u6709\u5B8C\u6574\u8BFB\u53D6\u65B0\u6587\u4EF6\u6210\u529F\u540E\u624D\u66FF\u6362\u8349\u7A3F\u3002",
        footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => model.confirm(false), children: "\u4FDD\u7559\u8349\u7A3F" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => model.confirm(true), children: state.confirmation === "close" ? "\u5173\u95ED\u9875\u7B7E" : "\u653E\u5F03\u5E76\u6253\u5F00" })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("form", { style: { display: "flex", gap: 6 }, onSubmit: (event) => {
      event.preventDefault();
      open(path);
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input, { "aria-label": "\u8FDC\u7A0B\u6587\u4EF6\u8DEF\u5F84", placeholder: "\u5DE5\u4F5C\u533A\u5185\u7684\u6587\u4EF6\u8DEF\u5F84\uFF08\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\uFF09", value: path, style: { flex: 1, minWidth: 0 }, onChange: (event) => setPath(event.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { type: "submit", disabled: !path || state.reading || model.unsettled, children: "\u6253\u5F00" })
    ] }),
    document2 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { title: `${document2.alias}:${document2.path}`, style: { overflowWrap: "anywhere", fontSize: 12 }, children: [
        "SSH \xB7 ",
        document2.alias,
        " \xB7 ",
        document2.path,
        " ",
        model.dirty ? "\u25CF \u672A\u4FDD\u5B58" : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: !model.dirty || state.reading || model.unsettled, onClick: () => void model.save(), children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: state.reading || model.unsettled, onClick: () => open(document2.path), children: "\u91CD\u65B0\u52A0\u8F7D" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: state.reading || state.saving, onClick: () => void model.compare(), children: "\u67E5\u770B\u8FDC\u7AEF\u7248\u672C" }),
        model.unsettled && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: state.saving, onClick: () => void model.verify(), children: "\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("small", { children: [
        "UTF-8",
        document2.bom ? " BOM" : "",
        " \xB7 ",
        document2.newline.toUpperCase(),
        " \xB7 \u6700\u5927 ",
        document2.maxBytes / 1024,
        " KiB"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "textarea",
        {
          "aria-label": "\u8FDC\u7A0B\u6587\u4EF6\u5185\u5BB9",
          spellCheck: false,
          value: state.draft,
          disabled: state.reading || state.saving,
          onChange: (event) => model.edit(event.target.value),
          onKeyDown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              void model.save();
            }
          },
          style: {
            flex: 1,
            minHeight: 180,
            resize: "none",
            padding: 10,
            tabSize: 4,
            whiteSpace: "pre",
            overflow: "auto",
            fontFamily: "ui-monospace,monospace",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--dsw-alias-label-primary)",
            background: "var(--dsw-alias-background-primary,transparent)",
            border: "1px solid var(--dsw-alias-border-primary,#aaa)",
            borderRadius: 6
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { role: ["conflict", "unknown", "failed"].includes(state.outcome ?? "") ? "alert" : "status", style: { fontSize: 12, overflowWrap: "anywhere" }, children: state.message || "\u8F93\u5165\u8FDC\u7A0B\u6587\u672C\u6587\u4EF6\u8DEF\u5F84\uFF1B\u4EC5\u652F\u6301\u5DE5\u4F5C\u533A\u5185\u5B8C\u6574 UTF-8 \u6587\u672C\u3002\u4E0D\u81EA\u52A8\u4FDD\u5B58\u3002" }),
    state.remoteText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { children: "\u6700\u65B0\u8FDC\u7AEF\u5185\u5BB9\uFF08\u53EA\u8BFB\uFF1B\u4E0A\u65B9\u4ECD\u662F\u4F60\u7684\u8349\u7A3F\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: { maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }, children: state.remoteText })
    ] })
  ] });
}
function RemoteEditorTitle({ model }) {
  const state = (0, import_react3.useSyncExternalStore)(model.subscribe, model.snapshot, model.snapshot);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
    model.dirty ? "\u25CF " : "",
    state.document ? `\u7F16\u8F91 \xB7 ${state.document.path.split("/").pop()}` : "\u8FDC\u7A0B\u7F16\u8F91"
  ] });
}
function RemoteEditMenu(props) {
  const file = parseFileAddress(props.tab.contentId);
  const cwd = props.useSessions((snapshot) => snapshot.byId[props.sessionId]?.cwd);
  const [remote, setRemote] = (0, import_react3.useState)();
  (0, import_react3.useEffect)(() => {
    let active = true;
    if (cwd) void props.workspaceInfo(cwd).then((result3) => {
      if (active) setRemote(result3.ok && result3.value ? cwd : void 0);
    }, () => {
    });
    return () => {
      active = false;
    };
  }, [cwd, props.workspaceInfo]);
  if (file?.scope !== "session" || file.sessionId !== props.sessionId || remote !== cwd || !cwd) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => {
    props.dismiss();
    props.openEditor(file.path);
  }, children: "\u7F16\u8F91\u8FDC\u7A0B\u6587\u672C" });
}

// client/quick-open.tsx
var import_react4 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime4 = require("react/jsx-runtime");
var KIND2 = "ssh-quick-open";
var ID2 = "dsh-ssh-remote.quick-open";
function safePreviewPath(path) {
  if (!path || path.length > 4096 || /[\\"\u0000-\u001f\u007f-\u009f]/u.test(path) || path.split("/").includes("..") || /^[a-z][a-z\d+.-]*:/iu.test(path)) {
    throw new Error("\u6B64\u8DEF\u5F84\u65E0\u6CD5\u5B89\u5168\u8868\u793A\u4E3A DSH \u5F15\u7528\u6216\u9884\u89C8\u5730\u5740\uFF0C\u8BF7\u4F7F\u7528\u8FDC\u7A0B\u7EC8\u7AEF\uFF1B\u4E0D\u6539\u5199\u6587\u4EF6\u540D\u3002");
  }
  return path;
}
function mountQuickOpen(ctx, editor) {
  const fiber = ctx.inject(["remote.sshRemoteFiles", "remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope3) => {
    if (!scope3.sidebarRightTabs || typeof scope3.remote.sshRemoteFiles?.query !== "function") return () => {
    };
    const unregister = scope3.sidebarRightTabs.register({ id: ID2, kind: KIND2, title: () => "\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00", guide: [] });
    const open = (sessionId, path, editing) => {
      if (scope3.sidebarRight.mounted.getSnapshot() !== sessionId) throw new Error("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u3002");
      safePreviewPath(path);
      if (editing) {
        if (!editor.open) throw new Error("\u8FDC\u7A0B\u7F16\u8F91\u5668\u5C1A\u672A\u52A0\u8F7D\u3002");
        editor.open(sessionId, path);
      } else scope3.sidebarRight.openResourceIn(sessionId, sessionFileAddress(sessionId, path));
    };
    const body = scope3.slots.inject("sidebar.right.pane.tab", () => scope3.slots.register({
      name: "sidebar.right.pane.tab",
      key: ID2,
      inject: (sessionId) => ({ remote: scope3.remote.sshRemoteFiles, open: (path, editing) => open(sessionId, path, editing) })
    }, QuickOpenPane));
    const shortcuts = scope3.inject(["shortcuts"], (child) => child.shortcuts.register({
      id: "dsh-ssh-remote.quick-open",
      label: () => "\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00",
      aliases: ["SSH", "remote", "file"],
      defaults: {},
      regions: ["page", "editable"],
      modals: [],
      resolve: () => {
        const sessionId = scope3.sidebarRight.mounted.getSnapshot();
        if (!sessionId) return { status: "pass" };
        return { status: "handled", run: () => {
          if (scope3.sidebarRight.mounted.getSnapshot() === sessionId) scope3.sidebarRight.openTab(KIND2);
        } };
      }
    }));
    return async () => {
      await shortcuts.dispose();
      body();
      unregister();
    };
  });
  const statusFiber = ctx.inject(["remote.sshRemoteFiles", "remote.sshRemote", "slots", "sessions", "inputTriggers"], (scope3) => {
    if (typeof scope3.remote.sshRemoteFiles?.status !== "function") return () => {
    };
    return scope3.slots.inject("conversation.input.dock", () => scope3.slots.register({
      name: "conversation.input.dock",
      id: `${ID2}.index-status`,
      order: 45,
      inject: (sessionId) => ({
        remote: scope3.remote.sshRemoteFiles,
        workspaceInfo: scope3.remote.sshRemote.workspaceInfo,
        controller: () => {
          const actx = scope3.sessions.scope(sessionId);
          return actx ? scope3.inputTriggers.sessionOf(actx) : void 0;
        }
      })
    }, ReferenceIndexStatus));
  });
  return async () => {
    await statusFiber.dispose();
    await fiber.dispose();
  };
}
function QuickOpenPane({ sessionId, remote, open }) {
  const [query, setQuery] = (0, import_react4.useState)("");
  const [ignored, setIgnored] = (0, import_react4.useState)(false);
  const [revision, setRevision] = (0, import_react4.useState)(0);
  const [result3, setResult] = (0, import_react4.useState)();
  const [status2, setStatus] = (0, import_react4.useState)();
  const [pending, setPending] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)("");
  (0, import_react4.useEffect)(() => {
    setQuery("");
    setIgnored(false);
    setResult(void 0);
    setStatus(void 0);
    setError("");
  }, [sessionId]);
  (0, import_react4.useEffect)(() => {
    const controller = new AbortController();
    let live = true;
    setPending(true);
    setError("");
    const timer = setTimeout(() => {
      void remote.query(sessionId, query, ignored, controller.signal).then((response) => {
        if (!live) return;
        if (!response.ok) {
          setError(response.error.message);
          return;
        }
        if (response.value.sessionId !== sessionId) {
          setError("\u4F1A\u8BDD\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u62D2\u7EDD\u663E\u793A\u7ED3\u679C\u3002");
          return;
        }
        setResult(response.value);
        setStatus(response.value);
      }, (error2) => {
        if (live) setError(String(error2));
      }).finally(() => {
        if (live) setPending(false);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [sessionId, query, ignored, revision, remote]);
  (0, import_react4.useEffect)(() => {
    if (!pending) return;
    const controller = new AbortController();
    let live = true;
    let timer;
    const poll = async () => {
      try {
        const response = await remote.status(sessionId, ignored, controller.signal);
        if (live && response.ok) setStatus(response.value);
      } catch {
      }
      if (live) timer = setTimeout(poll, 750);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [pending, sessionId, ignored, remote]);
  const refreshController = (0, import_react4.useRef)();
  (0, import_react4.useEffect)(() => () => refreshController.current?.abort(), [sessionId, ignored]);
  const refresh = async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const response = await remote.refresh(sessionId, ignored, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setStatus(response.value);
      setRevision((n) => n + 1);
    } catch (error2) {
      if (!controller.signal.aborted) setError(String(error2));
    }
  };
  const choose = (path, editing = false) => {
    try {
      safePreviewPath(path);
      open(path, editing);
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    }
  };
  const current = result3?.sessionId === sessionId ? result3 : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { "aria-label": "\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00", style: { padding: 12, display: "flex", flexDirection: "column", gap: 10, height: "100%", minWidth: 0 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("form", { onSubmit: (event) => {
      event.preventDefault();
      choose(query);
    }, style: { display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Input, { "aria-label": "\u641C\u7D22\u8FDC\u7A0B\u6587\u4EF6", value: query, placeholder: "\u6587\u4EF6\u540D\u6216\u5B8C\u6574\u8DEF\u5F84", onChange: (event) => setQuery(event.target.value), style: { flex: 1, minWidth: 0 } }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { type: "submit", disabled: !query, children: "\u6309\u8DEF\u5F84\u9884\u89C8" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 10, alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "checkbox", checked: ignored, onChange: (event) => setIgnored(event.target.checked) }),
        " \u5305\u542B\u5FFD\u7565\u9879"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { onClick: () => void refresh(), children: "\u5237\u65B0\u7D22\u5F15" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("small", { children: "\u9ED8\u8BA4\u53EA\u8BFB\u9884\u89C8\uFF1B\u201C\u7F16\u8F91\u201D\u4F1A\u590D\u7528\u539F\u7F16\u8F91\u5668\u53CA\u8349\u7A3F\u4FDD\u62A4\u3002\u5305\u542B\u5FFD\u7565\u9879\u4EC5\u5F71\u54CD\u672C\u9875\u641C\u7D22\uFF0C\u4E0D\u6539\u53D8 @ \u8865\u5168\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "status", style: { fontSize: 12, overflowWrap: "anywhere" }, children: [
      pending ? current ? "\u6B63\u5728\u66F4\u65B0\uFF0C\u4EE5\u4E0B\u4E3A\u65E7\u7ED3\u679C\uFF08\u53EF\u80FD\u8FC7\u671F\uFF09\u2026" : "\u6B63\u5728\u641C\u7D22\u8FDC\u7A0B\u6587\u4EF6\u2026" : status2?.message,
      !pending && status2?.stale && " \u7ED3\u679C\u5DF2\u8FC7\u671F\u3002",
      !pending && status2 && ` ${status2.count} \u9879${status2.complete ? "" : "\uFF08\u7D22\u5F15\u4E0D\u5B8C\u6574\uFF0C\u672A\u547D\u4E2D\u4E0D\u4EE3\u8868\u4E0D\u5B58\u5728\uFF09"}`,
      !pending && status2?.unsupported && !status2.message ? ` \xB7 ${status2.unsupported} \u4E2A\u6587\u4EF6\u540D\u4E0D\u80FD\u5B89\u5168\u5F15\u7528\u6216\u9884\u89C8` : ""
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)", overflowWrap: "anywhere" }, children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "list", "aria-label": "\u8FDC\u7A0B\u6587\u4EF6\u641C\u7D22\u7ED3\u679C", style: { flex: 1, overflow: "auto" }, children: [
      current?.candidates.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "listitem", style: { display: "flex", alignItems: "center", gap: 6, paddingBlock: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          import_dsh_client_ui_primitives4.Button,
          {
            variant: "ghost",
            title: candidate.path,
            style: { flex: 1, minWidth: 0, justifyContent: "flex-start", overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left" },
            onClick: () => candidate.kind === "directory" ? setQuery(`${candidate.path}/`) : choose(candidate.path),
            children: [
              candidate.kind === "directory" ? "\u{1F4C1} " : "",
              candidate.path
            ]
          }
        ),
        candidate.kind === "file" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { size: "sm", onClick: () => choose(candidate.path, true), children: "\u7F16\u8F91" })
      ] }, candidate.path)),
      !pending && current?.candidates.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: status2?.complete ? "\u5F53\u524D\u641C\u7D22\u6CA1\u6709\u5339\u914D\u9879\u3002" : "\u6682\u672A\u53D1\u73B0\u5339\u914D\u9879\uFF1B\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u76F4\u63A5\u9884\u89C8\u3002" })
    ] })
  ] });
}
var IndexMenuRefresh = class {
  constructor() {
    __publicField(this, "generation", 0);
    __publicField(this, "stale", false);
  }
  update(status2, controller) {
    const changed = status2.generation !== this.generation || status2.stale && !this.stale;
    this.generation = status2.generation;
    this.stale = status2.stale;
    const menu = controller?.menu.getSnapshot();
    if (changed && menu?.open && menu.hit?.trigger === "@") controller?.refreshOpenMenu();
  }
};
function ReferenceIndexStatus(props) {
  const cwd = props.useSessions((s) => s.byId[props.sessionId]?.cwd);
  const [status2, setStatus] = (0, import_react4.useState)();
  const key = `${props.sessionId}\0${cwd ?? ""}`;
  const latest = (0, import_react4.useRef)(props);
  latest.current = props;
  (0, import_react4.useEffect)(() => {
    if (!cwd) return;
    let active = true;
    let timer;
    const controller = new AbortController(), refresh = new IndexMenuRefresh();
    const poll = async () => {
      try {
        const response = await latest.current.remote.status(props.sessionId, false, controller.signal);
        if (!active) return;
        if (response.ok) {
          setStatus({ key, value: response.value });
          refresh.update(response.value, latest.current.controller());
        }
      } catch {
      }
      if (active) timer = setTimeout(poll, 750);
    };
    void latest.current.workspaceInfo(cwd).then((response) => {
      if (active && response.ok && response.value) void poll();
    }, () => {
    });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, cwd]);
  if (status2?.key !== key || status2.value.state === "idle" || status2.value.state === "ready" && !status2.value.stale && !status2.value.unsupported) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("small", { role: "status", style: { display: "block", overflowWrap: "anywhere", padding: "4px 0", color: "var(--dsw-alias-label-secondary)" }, children: [
    "SSH \u6587\u4EF6\u7D22\u5F15\uFF1A",
    status2.value.message || "\u7ED3\u679C\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u641C\u7D22\u6216\u5237\u65B0\u7D22\u5F15\u3002"
  ] });
}

// client/index.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var name = "dsh-ssh-remote-client";
var inject = ["remote"];
var MUTATION_DEADLINE_MS = 3e4;
var READ_DEADLINE_MS = 3e4;
async function apply(ctx) {
  const disposeMount = await ctx.remote.$mount(typert_remote_client_default);
  const ui = ctx.inject(["remote.sshRemote", "slots", "workspaces"], (scope3) => {
    let pickNative;
    const nativePicker = scope3.inject(["remote.directoryPicker"], (next) => {
      const picker = next.remote.directoryPicker;
      const adapter = async (signal) => {
        const result3 = await picker.pick(signal);
        if (!result3.ok) throw new Error(`directory picker failed: ${result3.error.message}`);
        return result3.value;
      };
      pickNative = adapter;
      return () => {
        if (pickNative === adapter) pickNative = void 0;
      };
    });
    const mountUi = (scope4, directories2) => {
      const ssh = scope4.remote.sshRemote;
      const flowInject = () => ({
        ssh,
        pickLocal: (signal) => {
          const desktop = globalThis.__DSH_DIRECTORY_PICKER__;
          return desktop === void 0 ? pickNative?.(signal) ?? directories2.pickDirectory() : desktop.pick();
        },
        // The composed picker's browse capability (in-app listing/creation).
        // Served only when the host composes the `-browse` backend; chooseLocal
        // probes for it and falls back to the native chooser only on the
        // explicit capability-unavailable signal (`directory-picker-unavailable`).
        listLocal: (path) => directories2.listDirectory(path),
        createLocalDirectory: (path, name2) => directories2.createDirectory(path, name2),
        createWorkspace: (input) => scope4.workspaces.create(input),
        renameWorkspace: (workspaceId, title) => scope4.workspaces.rename(workspaceId, title)
      });
      return scope4.slots.inject(
        "settings.plugins.tab",
        () => scope4.slots.inject(
          "conversation.hero.workspace.directoryFlow",
          () => scope4.slots.inject("sidebar.workspaces.directoryFlow", function* () {
            yield scope4.slots.register(
              {
                name: "settings.plugins.tab",
                id: "ssh-remote",
                order: 20,
                label: () => "SSH Remote",
                inject: () => ({ ssh })
              },
              SshRemotePanel
            );
            yield scope4.slots.register(
              {
                name: "conversation.hero.workspace.directoryFlow",
                priority: -100,
                inject: flowInject
              },
              SshDirectoryFlow
            );
            yield scope4.slots.register(
              {
                name: "sidebar.workspaces.directoryFlow",
                priority: -100,
                inject: flowInject
              },
              SshDirectoryFlow
            );
          })
        )
      );
    };
    const directories = scope3.inject(["uiWorkspace"], (next) => mountUi(
      next,
      next.uiWorkspace
    ));
    return async () => {
      await directories.dispose();
      await nativePicker.dispose();
    };
  });
  const disposePanels = mountNativePanels(ctx);
  const disposeMarkdown = mountSessionMarkdownImages(ctx);
  const editorBridge = {};
  const disposeEditor = mountRemoteEditor(ctx, editorBridge);
  const disposeQuickOpen = mountQuickOpen(ctx, editorBridge);
  try {
    await ui;
  } catch (error) {
    await disposeQuickOpen();
    await disposeEditor();
    await disposeMarkdown();
    await disposePanels();
    await ui.dispose();
    await disposeMount();
    throw error;
  }
  return async () => {
    await disposeQuickOpen();
    await disposeEditor();
    await disposeMarkdown();
    await disposePanels();
    await ui.dispose();
    await disposeMount();
  };
}
async function asResult(run) {
  try {
    return { ok: true, value: await run() };
  } catch (reason) {
    return { ok: false, error: { message: messageOf(reason) } };
  }
}
function withMutationDeadline(operation, label) {
  return withDeadline(operation, `${label} \u8D85\u8FC7 ${MUTATION_DEADLINE_MS / 1e3} \u79D2\uFF1B\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u3002`, MUTATION_DEADLINE_MS);
}
function withReadDeadline(operation, label) {
  return withDeadline(operation, `${label} \u8D85\u8FC7 ${READ_DEADLINE_MS / 1e3} \u79D2\uFF0C\u8BF7\u91CD\u8BD5\u3002`, READ_DEADLINE_MS);
}
function withDeadline(operation, message2, milliseconds, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (run) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    const timer = setTimeout(() => {
      finish(() => {
        onTimeout?.();
        reject(new Error(message2));
      });
    }, milliseconds);
    operation.then(
      (value) => finish(() => resolve(value)),
      (reason) => finish(() => reject(reason))
    );
  });
}
function messageOf(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}
function SshDirectoryFlow({
  open,
  busy,
  onPicked,
  onCancel,
  onError,
  ssh,
  pickLocal,
  listLocal,
  createLocalDirectory,
  createWorkspace,
  renameWorkspace
}) {
  const [config, setConfig] = (0, import_react5.useState)(null);
  const [target, setTarget] = (0, import_react5.useState)(null);
  const [listing, setListing] = (0, import_react5.useState)(null);
  const [loading, setLoading] = (0, import_react5.useState)(false);
  const [mutating, setMutating] = (0, import_react5.useState)(false);
  const [error, setError] = (0, import_react5.useState)("");
  const [newFolder, setNewFolder] = (0, import_react5.useState)("");
  const [pathInput, setPathInput] = (0, import_react5.useState)("");
  const [localCanBrowse, setLocalCanBrowse] = (0, import_react5.useState)(null);
  const [driveAnchors, setDriveAnchors] = (0, import_react5.useState)(null);
  const navigationEpoch = (0, import_react5.useRef)(0);
  const mutationEpoch = (0, import_react5.useRef)(0);
  const mounted = (0, import_react5.useRef)(false);
  const nativePicker = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      navigationEpoch.current += 1;
      mutationEpoch.current += 1;
      nativePicker.current?.abort();
    };
  }, []);
  (0, import_react5.useEffect)(() => {
    if (!open) return;
    const epoch = ++navigationEpoch.current;
    setConfig(null);
    setTarget(null);
    setListing(null);
    setError("");
    setNewFolder("");
    setPathInput("");
    setDriveAnchors(null);
    setLocalCanBrowse(null);
    setLoading(true);
    void Promise.all([
      withReadDeadline(ssh.config(), "SSH \u914D\u7F6E\u8BFB\u53D6").catch((error2) => ({
        ok: false,
        error: { message: messageOf(error2) }
      })),
      probeLocalBrowse(() => withReadDeadline(listLocal(), "\u672C\u673A\u6D4F\u89C8")).then(
        (value) => ({ ok: true, value }),
        (error2) => ({ ok: false, error: error2 })
      )
    ]).then(([configResult, browseProbe]) => {
      if (navigationEpoch.current !== epoch) return;
      if (browseProbe.ok) setLocalCanBrowse(browseProbe.value);
      else {
        setError(`\u672C\u673A\u6D4F\u89C8\u63A2\u6D4B\u5931\u8D25\uFF1A${messageOf(browseProbe.error)}`);
      }
      if (configResult.ok) setConfig(configResult.value);
      else if (browseProbe.ok) setError(configResult.error.message);
    }).finally(() => {
      if (navigationEpoch.current === epoch) setLoading(false);
    });
    return () => {
      navigationEpoch.current += 1;
      nativePicker.current?.abort();
    };
  }, [open, ssh, listLocal]);
  (0, import_react5.useEffect)(() => {
    if (!open || target?.kind !== "local" || driveAnchors !== null) return;
    const epoch = navigationEpoch.current;
    let cancelled = false;
    void asResult(() => withReadDeadline(listLocal("/mnt"), "\u672C\u673A\u78C1\u76D8\u63A2\u6D4B")).then((result3) => {
      if (!cancelled && navigationEpoch.current === epoch) {
        setDriveAnchors(result3.ok ? windowsDriveAnchors(result3.value.entries) : []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, target, driveAnchors, listLocal]);
  async function browseLocalRaw(path) {
    try {
      return { ok: true, value: await withReadDeadline(listLocal(path), "\u672C\u673A\u6D4F\u89C8") };
    } catch (error2) {
      return { ok: false, error: error2 };
    }
  }
  async function enter(targetNext, path) {
    const epoch = ++navigationEpoch.current;
    setLoading(true);
    setError("");
    if (targetNext.kind === "ssh") {
      let result3;
      try {
        result3 = await withReadDeadline(ssh.browse(targetNext.alias, path ?? ""), "\u8FDC\u7A0B\u76EE\u5F55\u6D4F\u89C8");
      } catch (reason) {
        if (navigationEpoch.current === epoch) {
          setError(messageOf(reason));
          setLoading(false);
        }
        return false;
      }
      if (navigationEpoch.current !== epoch) return false;
      if (result3.ok) {
        setTarget(targetNext);
        setListing(result3.value);
        setPathInput(result3.value.path);
      } else {
        setError(result3.error.message);
      }
      setLoading(false);
      return result3.ok;
    }
    const outcome = await browseLocalRaw(path);
    if (navigationEpoch.current !== epoch) return false;
    if (outcome.ok) {
      setTarget(targetNext);
      setListing(outcome.value);
      setPathInput(outcome.value.path);
    } else {
      setError(messageOf(outcome.error));
    }
    setLoading(false);
    return outcome.ok;
  }
  function navigate(path) {
    if (target) void enter(target, path);
  }
  async function chooseLocal() {
    if (localCanBrowse !== false) {
      const epoch = ++navigationEpoch.current;
      setLoading(true);
      setError("");
      const outcome = await browseLocalRaw();
      if (navigationEpoch.current !== epoch) return;
      if (outcome.ok) {
        setLoading(false);
        setTarget({ kind: "local" });
        setListing(outcome.value);
        setPathInput(outcome.value.path);
        return;
      }
      if (!isDirectoryPickerUnavailable(outcome.error)) {
        setError(messageOf(outcome.error));
        setLoading(false);
        return;
      }
      setLocalCanBrowse(false);
      setLoading(false);
    }
    await pickLocalFallback();
  }
  async function pickLocalFallback() {
    const epoch = ++navigationEpoch.current;
    nativePicker.current?.abort();
    const controller = new AbortController();
    nativePicker.current = controller;
    setLoading(true);
    setError("");
    try {
      const path = await withDeadline(
        pickLocal(controller.signal),
        "\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668\u8D85\u8FC7 30 \u79D2\u672A\u8FD4\u56DE\uFF0C\u5DF2\u505C\u6B62\u7B49\u5F85\u3002\u82E5\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4ECD\u5728\u6216\u7F6E\u4E8E\u540E\u53F0\uFF0C\u8BF7\u5148\u5173\u95ED\u540E\u91CD\u8BD5\uFF1B\u82E5\u4ECD\u65E0\u5BF9\u8BDD\u6846\uFF0C\u8BF7\u91CD\u542F DSH \u540E\u518D\u8BD5\u3002",
        READ_DEADLINE_MS,
        () => controller.abort()
      );
      if (navigationEpoch.current === epoch && path) onPicked(path);
    } catch (reason) {
      if (navigationEpoch.current === epoch) setError(messageOf(reason));
    } finally {
      if (nativePicker.current === controller) nativePicker.current = null;
      if (navigationEpoch.current === epoch) setLoading(false);
    }
  }
  async function commit() {
    if (!target || !listing) return;
    const epoch = ++navigationEpoch.current;
    const mutation = ++mutationEpoch.current;
    setMutating(true);
    if (target.kind === "local") {
      setMutating(false);
      onPicked(listing.path);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result3 = await withMutationDeadline(
        ssh.materializeWorkspace(target.alias, listing.path),
        "\u8FDC\u7A0B\u5DE5\u4F5C\u533A\u9A8C\u8BC1"
      );
      if (navigationEpoch.current !== epoch) return;
      if (result3.ok) {
        const workspace = await withMutationDeadline(
          createWorkspace({ path: result3.value.anchorPath }),
          "\u5DE5\u4F5C\u533A\u521B\u5EFA"
        );
        if (navigationEpoch.current !== epoch) return;
        if (workspace.title !== result3.value.title) {
          await withMutationDeadline(
            renameWorkspace(workspace.workspaceId, result3.value.title),
            "\u5DE5\u4F5C\u533A\u547D\u540D"
          );
          if (navigationEpoch.current !== epoch) return;
        }
        onPicked(result3.value.anchorPath);
      } else {
        onError(result3.error.message);
      }
    } catch (reason) {
      if (navigationEpoch.current === epoch) onError(messageOf(reason));
    } finally {
      if (navigationEpoch.current === epoch) setLoading(false);
      if (mounted.current && mutationEpoch.current === mutation) setMutating(false);
    }
  }
  async function createFolder() {
    if (!target || !listing || !newFolder.trim()) return;
    const epoch = ++navigationEpoch.current;
    const mutation = ++mutationEpoch.current;
    const targetSnapshot = target;
    const listingPath = listing.path;
    const folderName = newFolder.trim();
    setLoading(true);
    setMutating(true);
    setError("");
    try {
      const created = targetSnapshot.kind === "ssh" ? await withMutationDeadline(
        ssh.createDirectory(targetSnapshot.alias, listingPath, folderName),
        "\u8FDC\u7A0B\u6587\u4EF6\u5939\u521B\u5EFA"
      ) : await asResult(() => withMutationDeadline(
        createLocalDirectory(listingPath, folderName),
        "\u672C\u673A\u6587\u4EF6\u5939\u521B\u5EFA"
      ));
      if (navigationEpoch.current !== epoch) return;
      if (created.ok) {
        setNewFolder("");
        await enter(targetSnapshot, created.value);
      } else {
        setError(created.error.message);
        setLoading(false);
      }
    } catch (reason) {
      if (navigationEpoch.current === epoch) {
        setError(messageOf(reason));
        setLoading(false);
      }
    } finally {
      if (mounted.current && mutationEpoch.current === mutation) setMutating(false);
    }
  }
  function cancel() {
    navigationEpoch.current += 1;
    nativePicker.current?.abort();
    onCancel();
  }
  const disabled = loading || busy || mutating;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    import_dsh_client_ui_primitives5.Modal,
    {
      open,
      onClose: () => {
        if (!busy && !mutating) cancel();
      },
      className: "dsh-ssh-remote-flow",
      title: !target ? "\u6DFB\u52A0\u5DE5\u4F5C\u533A" : target.kind === "local" ? "\u672C\u673A\u6587\u4EF6" : `SSH \xB7 ${target.alias}`,
      closeLabel: "\u5173\u95ED",
      description: listing ? listing.path : "\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A",
      footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "ghost", disabled: busy || mutating, onClick: cancel, children: "\u53D6\u6D88" }),
        target && listing && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "primary", disabled, onClick: () => void commit(), children: busy ? "\u6B63\u5728\u6DFB\u52A0\u2026" : "\u6253\u5F00\u6B64\u6587\u4EF6\u5939" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("style", { children: ".dsh-ssh-remote-flow{width:min(880px,94vw)}.dsh-ssh-remote-flow .dsh-ssh-remote-field{width:100%;box-sizing:border-box}" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
          !target || !listing ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              import_dsh_client_ui_primitives5.Button,
              {
                variant: "outline",
                disabled,
                onClick: () => void chooseLocal(),
                style: sourceRowStyle,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "\u672C\u673A" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: subtleText, children: localCanBrowse === false ? "\u4F7F\u7528\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668" : "\u5728\u5E94\u7528\u5185\u6D4F\u89C8 Host \u6587\u4EF6\u7CFB\u7EDF\uFF08\u542B /mnt \u4E0B\u7684 Windows \u76D8\uFF09" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: hostListStyle, children: [
              config?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                import_dsh_client_ui_primitives5.Button,
                {
                  variant: "outline",
                  disabled,
                  onClick: () => void enter({ kind: "ssh", alias: host.alias }),
                  style: sourceRowStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: host.alias }),
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: subtleText, children: [
                      host.user ? `${host.user}@` : "",
                      host.host,
                      ":",
                      host.port
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: dimmedText, children: [
                      "Helper \xB7 ",
                      helperStateLabel(host.helper.status),
                      host.helper.version ? ` \xB7 ${host.helper.version}` : ""
                    ] }),
                    host.helper.error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { ...dimmedText, color: "var(--dsw-alias-label-error)" }, children: host.helper.error }),
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: dimmedText, children: searchSummary(host.helper) })
                  ]
                },
                host.alias
              )),
              !loading && config?.hosts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: subtleText, children: "~/.ssh/config \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5177\u4F53 Host\u3002" })
            ] })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_dsh_client_ui_primitives5.Input,
                {
                  "aria-label": "\u6587\u4EF6\u5939\u8DEF\u5F84",
                  className: "dsh-ssh-remote-field",
                  value: pathInput,
                  disabled: busy || mutating,
                  onChange: (event) => setPathInput(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter" && pathInput.trim()) navigate(pathInput.trim());
                  },
                  placeholder: "\u8F93\u5165\u5B8C\u6574\u6587\u4EF6\u5939\u8DEF\u5F84"
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { disabled: busy || mutating || !pathInput.trim(), onClick: () => navigate(pathInput.trim()), children: "\u524D\u5F80" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { disabled: busy || mutating, onClick: () => navigate(listing.path), children: "\u5237\u65B0\u76EE\u5F55" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { disabled: busy || mutating, onClick: () => navigate(listing.home), children: "\u4E3B\u76EE\u5F55" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: chipRowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Pill, { disabled, onClick: () => {
                setTarget(null);
                setListing(null);
              }, children: target.kind === "local" ? "\u672C\u673A" : "\u4E3B\u673A" }),
              listing.crumbs.map((crumb) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Pill, { disabled, onClick: () => navigate(crumb.path), children: crumb.name }, crumb.path))
            ] }),
            target.kind === "local" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: chipRowStyle, children: [
              (driveAnchors ?? []).map((anchor) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Pill, { disabled, onClick: () => navigate(anchor.path), children: anchor.label }, anchor.path)),
              driveAnchors === null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: subtleText, children: "\u68C0\u6D4B Windows \u76D8\u2026" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: entryListStyle, children: [
              listing.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                import_dsh_client_ui_primitives5.Button,
                {
                  variant: "ghost",
                  size: "sm",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconFolderCloseRegular, {}),
                  disabled,
                  onClick: () => navigate(entry.path),
                  style: entryRowStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: entry.name }),
                    entry.hidden && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { marginLeft: "auto", ...dimmedText }, children: "\u9690\u85CF" })
                  ]
                },
                entry.path
              )),
              !loading && listing.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { padding: 16, ...dimmedText }, children: "\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002" })
            ] }),
            listing.truncated && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: 12, ...dimmedText }, children: "\u76EE\u5F55\u5217\u8868\u5DF2\u622A\u65AD\uFF08\u6700\u591A 1000 \u9879\uFF09\uFF1B\u672A\u663E\u793A\u7684\u6587\u4EF6\u5939\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u524D\u5F80\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_dsh_client_ui_primitives5.Input,
                {
                  value: newFolder,
                  className: "dsh-ssh-remote-field",
                  disabled,
                  onChange: (event) => setNewFolder(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void createFolder();
                  },
                  placeholder: "\u65B0\u5EFA\u6587\u4EF6\u5939\u540D\u79F0"
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_dsh_client_ui_primitives5.Button,
                {
                  variant: "ghost",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconPlusOutlineRegular, {}),
                  disabled: disabled || !newFolder.trim(),
                  onClick: () => void createFolder(),
                  children: "\u65B0\u5EFA"
                }
              )
            ] })
          ] }),
          loading && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "status", style: subtleText, children: "\u6B63\u5728\u8BFB\u53D6\u2026" }),
          error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: error })
        ] })
      ]
    }
  );
}
var sourceRowStyle = {
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  width: "100%",
  height: "auto",
  padding: "10px 14px"
};
var chipRowStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
var entryListStyle = {
  maxHeight: 320,
  overflowY: "auto",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: 10,
  background: "var(--dsw-alias-bg-layer-1)",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 2,
  padding: 6
};
var hostListStyle = {
  maxHeight: "min(50vh, 420px)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  // Keep clickable buttons clear of the scrollbar gutter.
  paddingRight: 4
};
var entryRowStyle = { justifyContent: "flex-start", flexShrink: 0 };
var subtleText = { color: "var(--dsw-alias-label-secondary)", fontSize: 12 };
var dimmedText = { color: "var(--dsw-alias-label-dimmed)", fontSize: 11 };
function helperStateLabel(state) {
  return {
    disconnected: "\u672A\u8FDE\u63A5",
    installing: "\u6B63\u5728\u5B89\u88C5",
    connecting: "\u6B63\u5728\u8FDE\u63A5",
    connected: "\u5DF2\u8FDE\u63A5",
    degraded: "\u5DF2\u8FDE\u63A5\uFF08\u80FD\u529B\u53D7\u9650\uFF09",
    reconnecting: "\u6B63\u5728\u91CD\u8FDE",
    error: "\u9519\u8BEF"
  }[state];
}
function helperCapabilitySummary(capabilities) {
  const names = Object.entries(capabilities).filter(([, value]) => value !== false && value !== null).map(([name2]) => name2);
  return names.length === 0 ? "\u7B49\u5F85\u63E1\u624B" : names.join(" \xB7 ");
}
function searchSummary(helper) {
  const search = helper.environment?.search;
  if (search === void 0) return "\u8FDC\u7A0B\u641C\u7D22\uFF1A\u672A\u68C0\u67E5\uFF08\u8FDE\u63A5\u6216\u91CD\u8BD5\u540E\u68C0\u67E5 rg\uFF09";
  return search.available ? `\u8FDC\u7A0B\u641C\u7D22\uFF1A\u53EF\u7528${search.version ? ` \xB7 ${search.version}` : ""}` : `\u8FDC\u7A0B\u641C\u7D22\uFF1A\u4E0D\u53EF\u7528\uFF1B\u8BF7\u5728\u8FDC\u7AEF\u5B89\u88C5 ripgrep\uFF0C\u786E\u4FDD rg \u5728\u767B\u5F55\u73AF\u5883 PATH \u4E2D\uFF0C\u7136\u540E\u91CD\u8BD5\u8FDE\u63A5\u3002${search.error ? ` ${search.error}` : ""}`;
}
function SshRemotePanel({ ssh }) {
  const [config, setConfig] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)("");
  const [loading, setLoading] = (0, import_react5.useState)(false);
  const [actions, setActions] = (0, import_react5.useState)({});
  const [hostErrors, setHostErrors] = (0, import_react5.useState)({});
  const [details, setDetails] = (0, import_react5.useState)(null);
  const epoch = (0, import_react5.useRef)(0);
  const mounted = (0, import_react5.useRef)(false);
  const actionEpochs = (0, import_react5.useRef)(/* @__PURE__ */ new Map());
  const statusRevision = (0, import_react5.useRef)(0);
  const polling = (0, import_react5.useRef)(null);
  async function load(showLoading = true) {
    const request = ++epoch.current;
    const revision = statusRevision.current;
    if (showLoading) setLoading(true);
    try {
      const result3 = await withReadDeadline(ssh.config(), "SSH \u914D\u7F6E\u8BFB\u53D6");
      if (!mounted.current || epoch.current !== request) return;
      if (result3.ok) {
        setConfig((current) => revision === statusRevision.current || current === null ? result3.value : {
          ...result3.value,
          hosts: result3.value.hosts.map((host) => ({
            ...host,
            helper: current.hosts.find((previous) => previous.alias === host.alias)?.helper ?? host.helper
          }))
        });
        setError("");
      } else setError(result3.error.message);
    } catch (reason) {
      if (mounted.current && epoch.current === request) setError(messageOf(reason));
    } finally {
      if (mounted.current && showLoading && epoch.current === request) setLoading(false);
    }
  }
  async function loadStatuses() {
    if (!mounted.current || polling.current !== null) return;
    const lifecycle = epoch.current;
    const revision = statusRevision.current;
    const operation = Promise.resolve().then(() => ssh.statuses());
    polling.current = operation;
    void operation.finally(() => {
      if (polling.current === operation) polling.current = null;
    }).catch(() => {
    });
    try {
      const result3 = await withReadDeadline(operation, "\u8FDE\u63A5\u72B6\u6001\u8BFB\u53D6");
      if (!mounted.current || epoch.current !== lifecycle || statusRevision.current !== revision || !result3.ok) return;
      setConfig((current) => current === null ? current : {
        ...current,
        hosts: current.hosts.map((host) => ({
          ...host,
          helper: actionEpochs.current.has(host.alias) ? host.helper : result3.value[host.alias] ?? host.helper
        }))
      });
    } catch {
    }
  }
  (0, import_react5.useEffect)(() => {
    mounted.current = true;
    void load();
    const timer = setInterval(() => {
      void loadStatuses();
    }, 5e3);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      epoch.current += 1;
      statusRevision.current += 1;
      actionEpochs.current.clear();
      polling.current = null;
    };
  }, [ssh]);
  async function runHostAction(alias, action) {
    const request = ++statusRevision.current;
    actionEpochs.current.set(alias, request);
    const isCurrent = () => mounted.current && actionEpochs.current.get(alias) === request;
    setActions((current) => ({ ...current, [alias]: action }));
    setHostErrors((current) => ({ ...current, [alias]: void 0 }));
    if (action === "connect" || action === "retry") {
      setConfig((current) => current === null ? current : {
        ...current,
        hosts: current.hosts.map((host) => host.alias === alias ? {
          ...host,
          helper: { ...host.helper, status: action === "retry" ? "reconnecting" : "connecting", error: "" }
        } : host)
      });
    }
    try {
      const operation = action === "connect" ? ssh.connectHost(alias) : action === "disconnect" ? ssh.disconnectHost(alias) : action === "retry" ? ssh.retryHost(alias) : ssh.diagnostics(alias);
      const result3 = await (action === "diagnostics" ? withReadDeadline(operation, "\u8FDE\u63A5\u8BCA\u65AD") : withMutationDeadline(operation, "\u4E3B\u673A\u64CD\u4F5C"));
      if (!isCurrent()) return;
      if (!result3.ok) setHostErrors((current) => ({ ...current, [alias]: result3.error.message }));
      else {
        if (action === "diagnostics") setDetails(result3.value);
        setConfig((current) => current === null ? current : {
          ...current,
          hosts: current.hosts.map((host) => host.alias === alias ? { ...host, helper: result3.value } : host)
        });
      }
    } catch (reason) {
      if (isCurrent()) setHostErrors((current) => ({ ...current, [alias]: messageOf(reason) }));
    } finally {
      if (isCurrent()) {
        actionEpochs.current.delete(alias);
        statusRevision.current += 1;
        setActions((current) => ({ ...current, [alias]: void 0 }));
      }
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14, padding: 12, maxWidth: 760 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { style: { margin: 0 }, children: "SSH Connections" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 4, color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: "\u8FDE\u63A5\u7531\u672C\u673A OpenSSH \u5EFA\u7ACB\uFF1B\u7248\u672C\u5316 helper \u7EDF\u4E00\u8FDC\u7AEF\u6587\u4EF6\u3001\u8FDB\u7A0B\u548C PTY\u3002\u663E\u5F0F\u65AD\u5F00\u4F1A\u505C\u6B62\u8BE5 helper session \u7BA1\u7406\u7684\u8FDC\u7AEF\u8FDB\u7A0B\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", size: "sm", disabled: loading, onClick: () => void load(), children: loading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0" })
    ] }),
    config && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: 10, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: subtleText, children: "SSH config" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { style: { fontSize: 12 }, children: config.configPath }),
      !config.configExists && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: "\u8BF7\u521B\u5EFA\u8BE5\u6587\u4EF6\u5E76\u6DFB\u52A0\u5177\u4F53 Host \u540E\u5237\u65B0\u3002" })
    ] }),
    config?.hosts.length === 0 && config.configExists && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: subtleText, children: "\u6CA1\u6709\u53D1\u73B0\u5177\u4F53 SSH Host alias\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: config?.hosts.map((host) => {
      const action = actions[host.alias];
      const busy = action !== void 0;
      const canStop = action === "connect" || action === "retry" || ["connected", "degraded", "installing", "connecting", "reconnecting"].includes(host.helper.status);
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { role: "group", "aria-label": `SSH \u4E3B\u673A ${host.alias}`, style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontWeight: 600 }, children: host.alias }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { ...dimmedText, color: host.helper.status === "error" ? "var(--dsw-alias-label-error)" : void 0 }, children: helperStateLabel(host.helper.status) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...subtleText, overflowWrap: "anywhere" }, children: [
          host.user ? `${host.user}@` : "",
          host.host,
          ":",
          host.port
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 6, ...dimmedText }, children: [
          "Helper ",
          host.helper.version || "\u5C1A\u672A\u63E1\u624B",
          " \xB7 ",
          helperCapabilitySummary(host.helper.capabilities)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: searchSummary(host.helper) }),
        (hostErrors[host.alias] || host.helper.error) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "alert", style: { marginTop: 6, color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: hostErrors[host.alias] || host.helper.error }),
        host.helper.hint && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: host.helper.hint }),
        (host.proxyJump || host.proxyCommand || host.identityFile) && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }, children: [
          host.proxyJump && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_dsh_client_ui_primitives5.Pill, { children: [
            "ProxyJump: ",
            host.proxyJump
          ] }),
          host.proxyCommand && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Pill, { children: "ProxyCommand" }),
          host.identityFile && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Pill, { children: "Identity configured" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }, children: [
          canStop ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "outline", disabled: action === "disconnect", onClick: () => void runHostAction(host.alias, "disconnect"), children: action === "disconnect" ? "\u6B63\u5728\u505C\u6B62\u2026" : "\u505C\u6B62 / \u65AD\u5F00" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => void runHostAction(host.alias, "connect"), children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u8FDE\u63A5" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void runHostAction(host.alias, "retry"), children: "\u91CD\u8BD5" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => void runHostAction(host.alias, "diagnostics"), children: "\u8BCA\u65AD" })
        ] })
      ] }, host.alias);
    }) }),
    details && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
          details.alias,
          " \xB7 \u8BCA\u65AD"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "ghost", onClick: () => setDetails(null), children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { style: { margin: "8px 0 0", maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 11 }, children: JSON.stringify(details, null, 2) })
    ] }),
    config && config.legacyHostCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: subtleText, children: [
      "\u4ECD\u6709 ",
      config.legacyHostCount,
      " \u4E2A\u65E7 DSH host \u4EC5\u4F5C\u4E3A SFTP \u517C\u5BB9\u515C\u5E95\uFF1B\u8BF7\u8FC1\u79FB\u5230 ",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: config.configPath }),
      "\u3002"
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)" }, children: error })
  ] });
}
return module.exports; } });
