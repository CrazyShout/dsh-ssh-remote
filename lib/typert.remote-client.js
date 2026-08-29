// client/typert.remote-client.ts
function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
var stringSchema = { parse(value) {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
} };
var helperStatusSchema = {
  parse(value) {
    const row = object(value, "helper status");
    for (const key of ["status", "version", "sessionId", "error"]) {
      if (typeof row[key] !== "string") throw new Error(`helper.${key} must be a string`);
    }
    object(row.capabilities, "helper capabilities");
    return value;
  }
};
var configSchema = {
  parse(value) {
    const config = object(value, "SSH config");
    if (typeof config.configPath !== "string" || typeof config.configExists !== "boolean") throw new Error("invalid SSH config");
    if (!Array.isArray(config.hosts) || typeof config.legacyHostCount !== "number") throw new Error("invalid SSH hosts");
    for (const item of config.hosts) {
      const host = object(item, "SSH host");
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
    const statuses = object(value, "helper statuses");
    for (const status of Object.values(statuses)) helperStatusSchema.parse(status);
    return value;
  }
};
var directoryEntrySchema = {
  parse(value) {
    const entry = object(value, "directory entry");
    if (typeof entry.name !== "string" || typeof entry.path !== "string" || typeof entry.hidden !== "boolean") {
      throw new Error("invalid directory entry");
    }
    return value;
  }
};
var directoryListingSchema = {
  parse(value) {
    const listing = object(value, "directory listing");
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
    const anchor = object(value, "workspace anchor");
    for (const key of ["anchorPath", "uri", "alias", "remotePath", "title"]) {
      if (typeof anchor[key] !== "string") throw new Error(`anchor.${key} must be a string`);
    }
    if (typeof anchor.createdAt !== "number") throw new Error("anchor.createdAt must be a number");
    return value;
  }
};
var diagnosticsSchema = {
  parse(value) {
    helperStatusSchema.parse(value);
    const details = object(value, "helper diagnostics");
    for (const key of ["alias", "helperSha256", "stderr", "assetPath"]) {
      if (typeof details[key] !== "string") throw new Error(`diagnostics.${key} must be a string`);
    }
    for (const key of ["lastConnectedAt", "lastHealthAt", "nextRetryAt"]) {
      if (typeof details[key] !== "number") throw new Error(`diagnostics.${key} must be a number`);
    }
    return value;
  }
};
function parameter(name) {
  return { name, wire: name, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name}`, schema: stringSchema } };
}
function invocation(method, parameters, schema, typeSymbol) {
  return {
    id: `dsh-ssh-remote#sshRemote/${method}`,
    service: "sshRemote",
    namespace: "sshRemote",
    method,
    invocation: { kind: "direct" },
    parameters,
    result: { mode: "strict", typeSymbol, schema },
    sourceLocation: { file: "src/registry.ts", line: 1, column: 1 }
  };
}
var TYPERT_REMOTE = {
  package: "dsh-ssh-remote",
  descriptors: [
    invocation("config", [], configSchema, "dsh-ssh-remote#SshConfig"),
    invocation("statuses", [], statusesSchema, "dsh-ssh-remote#HelperHostStatuses"),
    invocation("browse", [parameter("alias"), parameter("path")], directoryListingSchema, "dsh-ssh-remote#RemoteDirectoryListing"),
    invocation("createDirectory", [parameter("alias"), parameter("parent"), parameter("name")], stringSchema, "string"),
    invocation("materializeWorkspace", [parameter("alias"), parameter("remotePath")], workspaceAnchorSchema, "dsh-ssh-remote#SshWorkspaceAnchor"),
    invocation("connectHost", [parameter("alias")], helperStatusSchema, "dsh-ssh-remote#HelperHostStatus"),
    invocation("disconnectHost", [parameter("alias")], helperStatusSchema, "dsh-ssh-remote#HelperHostStatus"),
    invocation("retryHost", [parameter("alias")], helperStatusSchema, "dsh-ssh-remote#HelperHostStatus"),
    invocation("diagnostics", [parameter("alias")], diagnosticsSchema, "dsh-ssh-remote#HelperHostDiagnostics")
  ]
};
var typert_remote_client_default = TYPERT_REMOTE;
export {
  TYPERT_REMOTE,
  typert_remote_client_default as default
};
