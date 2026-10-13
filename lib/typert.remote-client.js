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
var parameter = (name, schema = string) => ({
  name,
  wire: name,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#editor/${name}`, create: () => schema }
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
var parameter2 = (name, schema) => ({
  name,
  wire: name,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#file-search/${name}`, create: () => schema }
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
  invocation2("preview", [parameter2("path", string2)], { parse(value) {
    if (!value || typeof value !== "object") throw new Error("invalid preview identity");
    const row = value;
    string2.parse(row.sessionId);
    string2.parse(row.path);
    return value;
  } }),
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
function parameter3(name) {
  return { name, wire: name, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name}`, create: () => stringSchema } };
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
export {
  TYPERT_REMOTE,
  typert_remote_client_default as default
};
