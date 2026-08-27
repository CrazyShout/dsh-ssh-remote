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
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// client/local-browse.ts
function windowsDriveAnchors(entries) {
  return entries.filter((entry) => /^[A-Za-z]$/.test(entry.name)).map((entry) => ({
    label: `Windows \xB7 ${entry.name.toUpperCase()}:`,
    path: `/mnt/${entry.name.toLowerCase()}`
  })).sort((a, b) => a.path.localeCompare(b.path));
}
function isDirectoryPickerUnavailable(reason) {
  if (!(reason instanceof Error)) return false;
  return reason.rpcError?.code === "directory-picker-unavailable";
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
      // The composed picker's browse capability (in-app listing/creation).
      // Served only when the host composes the `-browse` backend; chooseLocal
      // probes for it and falls back to the native chooser only on the
      // explicit capability-unavailable signal (`directory-picker-unavailable`).
      listLocal: (path) => scope.workspaces.listDirectory(path),
      createLocalDirectory: (path, name2) => scope.workspaces.createDirectory(path, name2),
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
async function asResult(run) {
  try {
    return { ok: true, value: await run() };
  } catch (reason) {
    return { ok: false, error: { message: messageOf(reason) } };
  }
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
  const [config, setConfig] = (0, import_react.useState)(null);
  const [target, setTarget] = (0, import_react.useState)(null);
  const [listing, setListing] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [newFolder, setNewFolder] = (0, import_react.useState)("");
  const [localCanBrowse, setLocalCanBrowse] = (0, import_react.useState)(null);
  const [driveAnchors, setDriveAnchors] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    setTarget(null);
    setListing(null);
    setError("");
    setNewFolder("");
    setDriveAnchors(null);
    setLocalCanBrowse(null);
    setLoading(true);
    void Promise.all([
      ssh.config(),
      probeLocalBrowse(() => listLocal()).catch((reason) => {
        setError(`\u672C\u673A\u6D4F\u89C8\u63A2\u6D4B\u5931\u8D25\uFF1A${messageOf(reason)}`);
        return null;
      })
    ]).then(([configResult, canBrowse]) => {
      if (canBrowse !== null) setLocalCanBrowse(canBrowse);
      if (configResult.ok) setConfig(configResult.value);
      else if (canBrowse !== null) setError(configResult.error.message);
    }).finally(() => setLoading(false));
  }, [open, ssh, listLocal]);
  (0, import_react.useEffect)(() => {
    if (!open || target?.kind !== "local" || driveAnchors !== null) return;
    let cancelled = false;
    void asResult(() => listLocal("/mnt")).then((result) => {
      if (!cancelled) setDriveAnchors(result.ok ? windowsDriveAnchors(result.value.entries) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, target, driveAnchors, listLocal]);
  async function browseLocalRaw(path) {
    try {
      return { ok: true, value: await listLocal(path) };
    } catch (error2) {
      return { ok: false, error: error2 };
    }
  }
  async function enter(targetNext, path) {
    setLoading(true);
    setError("");
    if (targetNext.kind === "ssh") {
      const result = await ssh.browse(targetNext.alias, path ?? "");
      if (result.ok) {
        setTarget(targetNext);
        setListing(result.value);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
      return result.ok;
    }
    const outcome = await browseLocalRaw(path);
    if (outcome.ok) {
      setTarget(targetNext);
      setListing(outcome.value);
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
      setLoading(true);
      setError("");
      const outcome = await browseLocalRaw();
      if (outcome.ok) {
        setLoading(false);
        setTarget({ kind: "local" });
        setListing(outcome.value);
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
    setLoading(true);
    setError("");
    try {
      const path = await pickLocal();
      if (path) onPicked(path);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }
  async function commit() {
    if (!target || !listing) return;
    if (target.kind === "local") {
      onPicked(listing.path);
      return;
    }
    setLoading(true);
    setError("");
    const result = await ssh.materializeWorkspace(target.alias, listing.path);
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
    if (!target || !listing || !newFolder.trim()) return;
    setLoading(true);
    setError("");
    const created = target.kind === "ssh" ? await ssh.createDirectory(target.alias, listing.path, newFolder.trim()) : await asResult(() => createLocalDirectory(listing.path, newFolder.trim()));
    if (created.ok) {
      setNewFolder("");
      await enter(target, created.value);
    } else {
      setError(created.error.message);
      setLoading(false);
    }
  }
  const disabled = loading || busy;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    import_dsh_client_ui_primitives.Modal,
    {
      open,
      onClose: () => {
        if (!busy) onCancel();
      },
      className: "dsh-ssh-remote-flow",
      title: !target ? "\u6DFB\u52A0\u5DE5\u4F5C\u533A" : target.kind === "local" ? "\u672C\u673A\u6587\u4EF6" : `SSH \xB7 ${target.alias}`,
      closeLabel: "\u5173\u95ED",
      description: listing ? listing.path : "\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A",
      footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", disabled: busy, onClick: onCancel, children: "\u53D6\u6D88" }),
        target && listing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", disabled, onClick: () => void commit(), children: busy ? "\u6B63\u5728\u6DFB\u52A0\u2026" : "\u6253\u5F00\u6B64\u6587\u4EF6\u5939" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: ".dsh-ssh-remote-flow{width:min(880px,94vw)}" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
          !target || !listing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              import_dsh_client_ui_primitives.Button,
              {
                variant: "outline",
                disabled,
                onClick: () => void chooseLocal(),
                style: sourceRowStyle,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u672C\u673A" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: subtleText, children: localCanBrowse === false ? "\u4F7F\u7528\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668" : "\u5728\u5E94\u7528\u5185\u6D4F\u89C8 Host \u6587\u4EF6\u7CFB\u7EDF\uFF08\u542B /mnt \u4E0B\u7684 Windows \u76D8\uFF09" })
                ]
              }
            ),
            config?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              import_dsh_client_ui_primitives.Button,
              {
                variant: "outline",
                disabled,
                onClick: () => void enter({ kind: "ssh", alias: host.alias }),
                style: sourceRowStyle,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: host.alias }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: subtleText, children: [
                    host.user ? `${host.user}@` : "",
                    host.host,
                    ":",
                    host.port
                  ] })
                ]
              },
              host.alias
            )),
            !loading && config?.hosts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: subtleText, children: "~/.ssh/config \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5177\u4F53 Host\u3002" })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: chipRowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { disabled, onClick: () => {
                setTarget(null);
                setListing(null);
              }, children: target.kind === "local" ? "\u672C\u673A" : "\u4E3B\u673A" }),
              listing.crumbs.map((crumb) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { disabled, onClick: () => navigate(crumb.path), children: crumb.name }, crumb.path))
            ] }),
            target.kind === "local" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: chipRowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { disabled, onClick: () => navigate(listing.home), children: "\u4E3B\u76EE\u5F55" }),
              (driveAnchors ?? []).map((anchor) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { disabled, onClick: () => navigate(anchor.path), children: anchor.label }, anchor.path)),
              driveAnchors === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: subtleText, children: "\u68C0\u6D4B Windows \u76D8\u2026" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: entryListStyle, children: [
              listing.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "ghost",
                  size: "sm",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderClose16, {}),
                  disabled,
                  onClick: () => navigate(entry.path),
                  style: entryRowStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.name }),
                    entry.hidden && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: "auto", ...dimmedText }, children: "\u9690\u85CF" })
                  ]
                },
                entry.path
              )),
              !loading && listing.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 16, ...dimmedText }, children: "\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002" })
            ] }),
            listing.truncated && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, ...dimmedText }, children: "\u4EC5\u663E\u793A\u524D 1000 \u4E2A\u76EE\u5F55\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Input,
                {
                  value: newFolder,
                  disabled,
                  onChange: (event) => setNewFolder(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void createFolder();
                  },
                  placeholder: "\u65B0\u5EFA\u6587\u4EF6\u5939\u540D\u79F0"
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "ghost",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, {}),
                  disabled: disabled || !newFolder.trim(),
                  onClick: () => void createFolder(),
                  children: "\u65B0\u5EFA"
                }
              )
            ] })
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: error })
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
var entryRowStyle = { justifyContent: "flex-start", flexShrink: 0 };
var subtleText = { color: "var(--dsw-alias-label-secondary)", fontSize: 12 };
var dimmedText = { color: "var(--dsw-alias-label-dimmed)", fontSize: 11 };
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4, color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: "Concrete Host aliases are discovered from your local OpenSSH config." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled: loading, onClick: () => void load(), children: loading ? "Refreshing\u2026" : "Refresh" })
    ] }),
    config && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 10, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: "SSH config" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { style: { fontSize: 12 }, children: config.configPath }),
      !config.configExists && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6, color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: [
        "File not found. Create it and add a concrete ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Host" }),
        " entry, then refresh."
      ] })
    ] }),
    config?.hosts.length === 0 && config.configExists && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-secondary)" }, children: "No concrete SSH Host aliases found." }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: config?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          padding: 12,
          border: "1px solid var(--dsw-alias-border-l2)",
          borderRadius: 8
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: host.alias }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 12, overflowWrap: "anywhere" }, children: [
            host.user ? `${host.user}@` : "",
            host.host,
            ":",
            host.port
          ] }),
          (host.proxyJump || host.proxyCommand || host.identityFile) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }, children: [
            host.proxyJump && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Pill, { children: [
              "ProxyJump: ",
              host.proxyJump
            ] }),
            host.proxyCommand && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { children: "ProxyCommand" }),
            host.identityFile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { children: "Identity configured" })
          ] })
        ]
      },
      host.alias
    )) }),
    config && config.legacyHostCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: [
      config.legacyHostCount,
      " legacy DSH host ",
      config.legacyHostCount === 1 ? "entry remains" : "entries remain",
      " as a read-only fallback. Move it to ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: config.configPath }),
      " when convenient."
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)" }, children: error })
  ] });
}
return module.exports; } });
