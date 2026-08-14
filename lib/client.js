window.__ModuleLoader__.load({ id: "dsh-ssh-remote", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// lib/typert.remote-client.js
function parseObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object");
  }
  return value;
}
var discoveredHostSchema = {
  parse(value) {
    parseObject(value);
    for (const key of ["alias", "host", "user", "identityFile", "proxyJump", "proxyCommand"]) {
      if (typeof value[key] !== "string") throw new Error(`host.${key} must be a string`);
    }
    if (typeof value.port !== "number") throw new Error("host.port must be a number");
    return value;
  }
};
var configSchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.configPath !== "string") throw new Error("configPath must be a string");
    if (typeof value.configExists !== "boolean") throw new Error("configExists must be a boolean");
    if (!Array.isArray(value.hosts)) throw new Error("hosts must be an array");
    for (const host of value.hosts) discoveredHostSchema.parse(host);
    if (typeof value.legacyHostCount !== "number") throw new Error("legacyHostCount must be a number");
    return value;
  }
};
var stringSchema = {
  parse(value) {
    if (typeof value !== "string") throw new Error("expected a string");
    return value;
  }
};
var directoryEntrySchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.name !== "string" || typeof value.path !== "string" || typeof value.hidden !== "boolean") {
      throw new Error("invalid remote directory entry");
    }
    return value;
  }
};
var directoryListingSchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.path !== "string" || typeof value.home !== "string" || typeof value.truncated !== "boolean") {
      throw new Error("invalid remote directory listing");
    }
    if (!Array.isArray(value.crumbs) || !Array.isArray(value.entries)) {
      throw new Error("remote directory listing rows must be arrays");
    }
    value.crumbs.forEach((entry) => directoryEntrySchema.parse(entry));
    value.entries.forEach((entry) => directoryEntrySchema.parse(entry));
    return value;
  }
};
var workspaceAnchorSchema = {
  parse(value) {
    parseObject(value);
    for (const key of ["anchorPath", "uri", "alias", "remotePath", "title"]) {
      if (typeof value[key] !== "string") throw new Error(`anchor.${key} must be a string`);
    }
    if (typeof value.createdAt !== "number") throw new Error("anchor.createdAt must be a number");
    return value;
  }
};
function parameter(name2, schema) {
  return {
    name: name2,
    wire: name2,
    source: "json",
    codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name2}`, schema }
  };
}
var TYPERT_REMOTE = {
  package: "dsh-ssh-remote",
  descriptors: [
    {
      id: "dsh-ssh-remote#sshRemote/config",
      service: "sshRemote",
      namespace: "sshRemote",
      method: "config",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "dsh-ssh-remote#SshConfig",
        schema: configSchema
      },
      sourceLocation: { file: "src/registry.ts", line: 132, column: 3 }
    },
    {
      id: "dsh-ssh-remote#sshRemote/browse",
      service: "sshRemote",
      namespace: "sshRemote",
      method: "browse",
      invocation: { kind: "direct" },
      parameters: [parameter("alias", stringSchema), parameter("path", stringSchema)],
      result: {
        mode: "strict",
        typeSymbol: "dsh-ssh-remote#RemoteDirectoryListing",
        schema: directoryListingSchema
      },
      sourceLocation: { file: "src/registry.ts", line: 175, column: 3 }
    },
    {
      id: "dsh-ssh-remote#sshRemote/createDirectory",
      service: "sshRemote",
      namespace: "sshRemote",
      method: "createDirectory",
      invocation: { kind: "direct" },
      parameters: [
        parameter("alias", stringSchema),
        parameter("parent", stringSchema),
        parameter("name", stringSchema)
      ],
      result: { mode: "strict", typeSymbol: "string", schema: stringSchema },
      sourceLocation: { file: "src/registry.ts", line: 219, column: 3 }
    },
    {
      id: "dsh-ssh-remote#sshRemote/materializeWorkspace",
      service: "sshRemote",
      namespace: "sshRemote",
      method: "materializeWorkspace",
      invocation: { kind: "direct" },
      parameters: [parameter("alias", stringSchema), parameter("remotePath", stringSchema)],
      result: {
        mode: "strict",
        typeSymbol: "dsh-ssh-remote#SshWorkspaceAnchor",
        schema: workspaceAnchorSchema
      },
      sourceLocation: { file: "src/registry.ts", line: 244, column: 3 }
    }
  ]
};
var typert_remote_client_default = TYPERT_REMOTE;

// client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-ssh-remote-client";
var inject = ["remote"];
async function apply(ctx) {
  const disposeMount = await ctx.remote.$mount(typert_remote_client_default);
  const ui = ctx.inject(["remote.sshRemote", "slots", "workspaces"], (scope) => {
    const ssh = scope.remote.sshRemote;
    const flowInject = () => ({
      ssh,
      pickLocal: () => scope.workspaces.pickDirectory(),
      createWorkspace: (input) => scope.workspaces.create(input),
      renameWorkspace: (workspaceId, title) => scope.workspaces.rename(workspaceId, title)
    });
    return scope.slots.inject(
      "settings.plugins.tab",
      () => scope.slots.inject(
        "conversation.hero.workspace.directoryFlow",
        () => scope.slots.inject("sidebar.workspaces.directoryFlow", function* () {
          yield scope.slots.register(
            {
              name: "settings.plugins.tab",
              id: "ssh-remote",
              order: 20,
              label: () => "SSH Remote",
              inject: () => ({ ssh })
            },
            SshRemotePanel
          );
          yield scope.slots.register(
            {
              name: "conversation.hero.workspace.directoryFlow",
              priority: -100,
              inject: flowInject
            },
            SshDirectoryFlow
          );
          yield scope.slots.register(
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
  });
  try {
    await ui;
  } catch (error) {
    await ui.dispose();
    await disposeMount();
    throw error;
  }
  return async () => {
    await ui.dispose();
    await disposeMount();
  };
}
function SshDirectoryFlow({
  open,
  busy,
  onPicked,
  onCancel,
  onError,
  ssh,
  pickLocal,
  createWorkspace,
  renameWorkspace
}) {
  const [config, setConfig] = (0, import_react.useState)(null);
  const [alias, setAlias] = (0, import_react.useState)("");
  const [listing, setListing] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [newFolder, setNewFolder] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    if (!open) return;
    setAlias("");
    setListing(null);
    setError("");
    setNewFolder("");
    setLoading(true);
    void ssh.config().then((result) => {
      if (result.ok) setConfig(result.value);
      else setError(result.error.message);
    }).finally(() => setLoading(false));
  }, [open, ssh]);
  async function browse(hostAlias, path) {
    setLoading(true);
    setError("");
    const result = await ssh.browse(hostAlias, path ?? "");
    if (result.ok) {
      setAlias(hostAlias);
      setListing(result.value);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }
  async function chooseLocal() {
    setLoading(true);
    setError("");
    try {
      const path = await pickLocal();
      if (path) onPicked(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }
  async function chooseRemote() {
    if (!listing || !alias) return;
    setLoading(true);
    setError("");
    const result = await ssh.materializeWorkspace(alias, listing.path);
    if (result.ok) {
      try {
        const workspace = await createWorkspace({ path: result.value.anchorPath });
        if (workspace.title !== result.value.title) {
          await renameWorkspace(workspace.workspaceId, result.value.title);
        }
        onPicked(result.value.anchorPath);
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : String(reason));
      }
    } else {
      onError(result.error.message);
    }
    setLoading(false);
  }
  async function createFolder() {
    if (!listing || !alias || !newFolder.trim()) return;
    setLoading(true);
    setError("");
    const result = await ssh.createDirectory(alias, listing.path, newFolder.trim());
    if (result.ok) {
      setNewFolder("");
      await browse(alias, result.value);
    } else {
      setError(result.error.message);
      setLoading(false);
    }
  }
  if (!open) return null;
  const disabled = loading || busy;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      role: "presentation",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      },
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 1e4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.38)",
        padding: 24
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "\u6DFB\u52A0\u5DE5\u4F5C\u533A",
          style: {
            width: "min(720px, 94vw)",
            maxHeight: "min(720px, 88vh)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflow: "hidden",
            padding: 20,
            borderRadius: 16,
            background: "var(--dsw-alias-bg-base, #fff)",
            color: "var(--dsw-alias-label-primary, #111)",
            boxShadow: "0 24px 70px rgba(0,0,0,.24)"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0 }, children: listing ? `SSH \xB7 ${alias}` : "\u6DFB\u52A0\u5DE5\u4F5C\u533A" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4, color: "#888", fontSize: 12 }, children: listing ? listing.path : "\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: busy, onClick: onCancel, "aria-label": "\u5173\u95ED", children: "\xD7" })
            ] }),
            !listing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  disabled,
                  onClick: () => void chooseLocal(),
                  style: sourceButtonStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u8FD9\u53F0 Mac" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#888", fontSize: 12 }, children: "\u4F7F\u7528\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668" })
                  ]
                }
              ),
              config?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  disabled,
                  onClick: () => void browse(host.alias),
                  style: sourceButtonStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: host.alias }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: "#888", fontSize: 12 }, children: [
                      host.user ? `${host.user}@` : "",
                      host.host,
                      ":",
                      host.port
                    ] })
                  ]
                },
                host.alias
              )),
              !loading && config?.hosts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#888" }, children: "~/.ssh/config \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5177\u4F53 Host\u3002" })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled, onClick: () => {
                  setAlias("");
                  setListing(null);
                }, children: "\u4E3B\u673A" }),
                listing.crumbs.map((crumb) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled, onClick: () => void browse(alias, crumb.path), children: crumb.name }, crumb.path))
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    minHeight: 180,
                    overflow: "auto",
                    border: "1px solid rgba(128,128,128,.25)",
                    borderRadius: 10
                  },
                  children: [
                    listing.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "button",
                      {
                        disabled,
                        onClick: () => void browse(alias, entry.path),
                        style: directoryButtonStyle,
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: "\u{1F4C1}" }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.name }),
                          entry.hidden && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: "auto", color: "#999", fontSize: 11 }, children: "\u9690\u85CF" })
                        ]
                      },
                      entry.path
                    )),
                    !loading && listing.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 16, color: "#888" }, children: "\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002" })
                  ]
                }
              ),
              listing.truncated && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#d97706", fontSize: 12 }, children: "\u4EC5\u663E\u793A\u524D 1000 \u4E2A\u76EE\u5F55\u3002" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: newFolder,
                    disabled,
                    onChange: (event) => setNewFolder(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === "Enter") void createFolder();
                    },
                    placeholder: "\u65B0\u5EFA\u6587\u4EF6\u5939\u540D\u79F0",
                    style: { flex: 1, minWidth: 0, padding: "8px 10px" }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: disabled || !newFolder.trim(), onClick: () => void createFolder(), children: "\u65B0\u5EFA" })
              ] })
            ] }),
            error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "alert", style: { color: "#ef4444", fontSize: 12 }, children: error }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: busy, onClick: onCancel, children: "\u53D6\u6D88" }),
              listing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled, onClick: () => void chooseRemote(), children: busy ? "\u6B63\u5728\u6DFB\u52A0\u2026" : "\u6253\u5F00\u6B64\u6587\u4EF6\u5939" })
            ] })
          ]
        }
      )
    }
  );
}
var sourceButtonStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 4,
  padding: 12,
  textAlign: "left",
  border: "1px solid rgba(128,128,128,.25)",
  borderRadius: 10,
  background: "transparent"
};
var directoryButtonStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 12px",
  border: 0,
  borderBottom: "1px solid rgba(128,128,128,.12)",
  background: "transparent",
  textAlign: "left"
};
function SshRemotePanel({ ssh }) {
  const [config, setConfig] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const [loading, setLoading] = (0, import_react.useState)(false);
  async function load() {
    setLoading(true);
    setError("");
    const r = await ssh.config();
    if (r.ok) setConfig(r.value);
    else setError(r.error.message);
    setLoading(false);
  }
  (0, import_react.useEffect)(() => {
    void load();
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14, padding: 12, maxWidth: 760 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0 }, children: "SSH Connections" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4, color: "#888", fontSize: 12 }, children: "Concrete Host aliases are discovered from your local OpenSSH config." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: loading, onClick: () => void load(), children: loading ? "Refreshing\u2026" : "Refresh" })
    ] }),
    config && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 10, border: "1px solid rgba(128,128,128,.25)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#888", fontSize: 12 }, children: "SSH config" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { style: { fontSize: 12 }, children: config.configPath }),
      !config.configExists && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6, color: "#d97706", fontSize: 12 }, children: [
        "File not found. Create it and add a concrete ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Host" }),
        " entry, then refresh."
      ] })
    ] }),
    config?.hosts.length === 0 && config.configExists && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#888" }, children: "No concrete SSH Host aliases found." }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: config?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: 12,
          border: "1px solid rgba(128,128,128,.25)",
          borderRadius: 8
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              "aria-hidden": "true",
              style: {
                width: 9,
                height: 9,
                marginTop: 5,
                borderRadius: "50%",
                background: "#6b7280",
                display: "inline-block",
                flex: "0 0 auto"
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { minWidth: 0, flex: 1 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: host.alias }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "#888", fontSize: 12, overflowWrap: "anywhere" }, children: [
              host.user ? `${host.user}@` : "",
              host.host,
              ":",
              host.port
            ] }),
            (host.proxyJump || host.proxyCommand || host.identityFile) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }, children: [
              host.proxyJump && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, { children: [
                "ProxyJump: ",
                host.proxyJump
              ] }),
              host.proxyCommand && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: "ProxyCommand" }),
              host.identityFile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: "Identity configured" })
            ] })
          ] })
        ]
      },
      host.alias
    )) }),
    config && config.legacyHostCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "#d97706", fontSize: 12 }, children: [
      config.legacyHostCount,
      " legacy DSH host ",
      config.legacyHostCount === 1 ? "entry remains" : "entries remain",
      " as a read-only fallback. Move it to ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: config.configPath }),
      " when convenient."
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ef4444" }, children: error })
  ] });
}
function Badge({ children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      style: {
        padding: "2px 6px",
        borderRadius: 999,
        background: "rgba(128,128,128,.12)",
        color: "#888",
        fontSize: 11
      },
      children
    }
  );
}
return module.exports; } });
