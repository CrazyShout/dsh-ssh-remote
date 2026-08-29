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
function parameter(name2) {
  return { name: name2, wire: name2, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name2}`, schema: stringSchema } };
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

// client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-ssh-remote-client";
var inject = ["remote"];
var MUTATION_DEADLINE_MS = 3e4;
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
function withMutationDeadline(operation, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (run) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`${label} \u8D85\u8FC7 ${MUTATION_DEADLINE_MS / 1e3} \u79D2\uFF1B\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u3002`)));
    }, MUTATION_DEADLINE_MS);
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
  const [config, setConfig] = (0, import_react.useState)(null);
  const [target, setTarget] = (0, import_react.useState)(null);
  const [listing, setListing] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [mutating, setMutating] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [newFolder, setNewFolder] = (0, import_react.useState)("");
  const [localCanBrowse, setLocalCanBrowse] = (0, import_react.useState)(null);
  const [driveAnchors, setDriveAnchors] = (0, import_react.useState)(null);
  const navigationEpoch = (0, import_react.useRef)(0);
  const mutationEpoch = (0, import_react.useRef)(0);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const epoch = ++navigationEpoch.current;
    setConfig(null);
    setTarget(null);
    setListing(null);
    setError("");
    setNewFolder("");
    setDriveAnchors(null);
    setLocalCanBrowse(null);
    setLoading(true);
    void Promise.all([
      ssh.config().catch((error2) => ({
        ok: false,
        error: { message: messageOf(error2) }
      })),
      probeLocalBrowse(() => listLocal()).then(
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
      if (navigationEpoch.current === epoch) navigationEpoch.current += 1;
    };
  }, [open, ssh, listLocal]);
  (0, import_react.useEffect)(() => {
    if (!open || target?.kind !== "local" || driveAnchors !== null) return;
    const epoch = navigationEpoch.current;
    let cancelled = false;
    void asResult(() => listLocal("/mnt")).then((result) => {
      if (!cancelled && navigationEpoch.current === epoch) {
        setDriveAnchors(result.ok ? windowsDriveAnchors(result.value.entries) : []);
      }
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
    const epoch = ++navigationEpoch.current;
    setLoading(true);
    setError("");
    if (targetNext.kind === "ssh") {
      let result;
      try {
        result = await ssh.browse(targetNext.alias, path ?? "");
      } catch (reason) {
        if (navigationEpoch.current === epoch) {
          setError(messageOf(reason));
          setLoading(false);
        }
        return false;
      }
      if (navigationEpoch.current !== epoch) return false;
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
    if (navigationEpoch.current !== epoch) return false;
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
      const epoch = ++navigationEpoch.current;
      setLoading(true);
      setError("");
      const outcome = await browseLocalRaw();
      if (navigationEpoch.current !== epoch) return;
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
    const epoch = ++navigationEpoch.current;
    setLoading(true);
    setError("");
    try {
      const path = await pickLocal();
      if (navigationEpoch.current === epoch && path) onPicked(path);
    } catch (reason) {
      if (navigationEpoch.current === epoch) setError(messageOf(reason));
    } finally {
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
      const result = await withMutationDeadline(
        ssh.materializeWorkspace(target.alias, listing.path),
        "\u8FDC\u7A0B\u5DE5\u4F5C\u533A\u9A8C\u8BC1"
      );
      if (navigationEpoch.current !== epoch) return;
      if (result.ok) {
        const workspace = await withMutationDeadline(
          createWorkspace({ path: result.value.anchorPath }),
          "\u5DE5\u4F5C\u533A\u521B\u5EFA"
        );
        if (navigationEpoch.current !== epoch) return;
        if (workspace.title !== result.value.title) {
          await withMutationDeadline(
            renameWorkspace(workspace.workspaceId, result.value.title),
            "\u5DE5\u4F5C\u533A\u547D\u540D"
          );
          if (navigationEpoch.current !== epoch) return;
        }
        onPicked(result.value.anchorPath);
      } else {
        onError(result.error.message);
      }
    } catch (reason) {
      if (navigationEpoch.current === epoch) onError(messageOf(reason));
    } finally {
      if (navigationEpoch.current === epoch) setLoading(false);
      if (mutationEpoch.current === mutation) setMutating(false);
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
      if (mutationEpoch.current === mutation) setMutating(false);
    }
  }
  function cancel() {
    navigationEpoch.current += 1;
    onCancel();
  }
  const disabled = loading || busy || mutating;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    import_dsh_client_ui_primitives.Modal,
    {
      open,
      onClose: () => {
        if (!busy && !mutating) cancel();
      },
      className: "dsh-ssh-remote-flow",
      title: !target ? "\u6DFB\u52A0\u5DE5\u4F5C\u533A" : target.kind === "local" ? "\u672C\u673A\u6587\u4EF6" : `SSH \xB7 ${target.alias}`,
      closeLabel: "\u5173\u95ED",
      description: listing ? listing.path : "\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A",
      footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", disabled: busy || mutating, onClick: cancel, children: "\u53D6\u6D88" }),
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
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: dimmedText, children: [
                    "Helper \xB7 ",
                    helperStateLabel(host.helper.status),
                    host.helper.version ? ` \xB7 ${host.helper.version}` : ""
                  ] }),
                  host.helper.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...dimmedText, color: "var(--dsw-alias-label-error)" }, children: host.helper.error })
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
function SshRemotePanel({ ssh }) {
  const [config, setConfig] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [busyAlias, setBusyAlias] = (0, import_react.useState)("");
  const [details, setDetails] = (0, import_react.useState)(null);
  const epoch = (0, import_react.useRef)(0);
  async function load(showLoading = true) {
    const request = ++epoch.current;
    if (showLoading) setLoading(true);
    try {
      const result = await ssh.config();
      if (epoch.current !== request) return;
      if (result.ok) {
        setConfig(result.value);
        setError("");
      } else setError(result.error.message);
    } catch (reason) {
      if (epoch.current === request) setError(messageOf(reason));
    } finally {
      if (showLoading && epoch.current === request) setLoading(false);
    }
  }
  async function loadStatuses() {
    try {
      const result = await ssh.statuses();
      if (!result.ok) return;
      setConfig((current) => current === null ? current : {
        ...current,
        hosts: current.hosts.map((host) => ({
          ...host,
          helper: result.value[host.alias] ?? host.helper
        }))
      });
    } catch {
    }
  }
  (0, import_react.useEffect)(() => {
    void load();
    const timer = setInterval(() => {
      void loadStatuses();
    }, 5e3);
    return () => {
      clearInterval(timer);
      epoch.current += 1;
    };
  }, [ssh]);
  async function runHostAction(alias, action) {
    setBusyAlias(alias);
    setError("");
    try {
      const result = action === "connect" ? await ssh.connectHost(alias) : action === "disconnect" ? await ssh.disconnectHost(alias) : action === "retry" ? await ssh.retryHost(alias) : await ssh.diagnostics(alias);
      if (!result.ok) setError(result.error.message);
      else if (action === "diagnostics") setDetails(result.value);
      await load(false);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyAlias("");
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14, padding: 12, maxWidth: 760 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0 }, children: "SSH Connections" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4, color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: "\u8FDE\u63A5\u7531\u672C\u673A OpenSSH \u5EFA\u7ACB\uFF1B\u7248\u672C\u5316 helper \u7EDF\u4E00\u8FDC\u7AEF\u6587\u4EF6\u3001\u8FDB\u7A0B\u548C PTY\u3002\u663E\u5F0F\u65AD\u5F00\u4F1A\u505C\u6B62\u8BE5 helper session \u7BA1\u7406\u7684\u8FDC\u7AEF\u8FDB\u7A0B\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled: loading || Boolean(busyAlias), onClick: () => void load(), children: loading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0" })
    ] }),
    config && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 10, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: subtleText, children: "SSH config" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { style: { fontSize: 12 }, children: config.configPath }),
      !config.configExists && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: "\u8BF7\u521B\u5EFA\u8BE5\u6587\u4EF6\u5E76\u6DFB\u52A0\u5177\u4F53 Host \u540E\u5237\u65B0\u3002" })
    ] }),
    config?.hosts.length === 0 && config.configExists && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: subtleText, children: "\u6CA1\u6709\u53D1\u73B0\u5177\u4F53 SSH Host alias\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: config?.hosts.map((host) => {
      const busy = busyAlias === host.alias;
      const connected = host.helper.status === "connected" || host.helper.status === "degraded";
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: host.alias }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...dimmedText, color: host.helper.status === "error" ? "var(--dsw-alias-label-error)" : void 0 }, children: helperStateLabel(host.helper.status) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...subtleText, overflowWrap: "anywhere" }, children: [
          host.user ? `${host.user}@` : "",
          host.host,
          ":",
          host.port
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6, ...dimmedText }, children: [
          "Helper ",
          host.helper.version || "\u5C1A\u672A\u63E1\u624B",
          " \xB7 ",
          helperCapabilitySummary(host.helper.capabilities)
        ] }),
        host.helper.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 6, color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: host.helper.error }),
        (host.proxyJump || host.proxyCommand || host.identityFile) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }, children: [
          host.proxyJump && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Pill, { children: [
            "ProxyJump: ",
            host.proxyJump
          ] }),
          host.proxyCommand && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { children: "ProxyCommand" }),
          host.identityFile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Pill, { children: "Identity configured" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }, children: [
          connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void runHostAction(host.alias, "disconnect"), children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u65AD\u5F00" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => void runHostAction(host.alias, "connect"), children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u8FDE\u63A5" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void runHostAction(host.alias, "retry"), children: "\u91CD\u8BD5" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => void runHostAction(host.alias, "diagnostics"), children: "\u8BCA\u65AD" })
        ] })
      ] }, host.alias);
    }) }),
    details && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
          details.alias,
          " \xB7 \u8BCA\u65AD"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "ghost", onClick: () => setDetails(null), children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: { margin: "8px 0 0", maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 11 }, children: JSON.stringify(details, null, 2) })
    ] }),
    config && config.legacyHostCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: subtleText, children: [
      "\u4ECD\u6709 ",
      config.legacyHostCount,
      " \u4E2A\u65E7 DSH host \u4EC5\u4F5C\u4E3A SFTP \u517C\u5BB9\u515C\u5E95\uFF1B\u8BF7\u8FC1\u79FB\u5230 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: config.configPath }),
      "\u3002"
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)" }, children: error })
  ] });
}
return module.exports; } });
