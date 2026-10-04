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
  SshDirectoryFlow: () => SshDirectoryFlow,
  SshRemotePanel: () => SshRemotePanel,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

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
    for (const key of ["errorCode", "hint"]) {
      if (row[key] !== void 0 && typeof row[key] !== "string") throw new Error(`helper.${key} must be a string`);
    }
    if (row.retryable !== void 0 && typeof row.retryable !== "boolean") throw new Error("helper.retryable must be boolean");
    if (row.environment !== void 0) {
      const environment = object(row.environment, "helper environment");
      const search = object(environment.search, "helper search");
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
var workspaceInfoSchema = {
  parse(value) {
    if (value === null) return value;
    const info = object(value, "remote workspace");
    for (const key of ["alias", "remotePath", "uri"]) {
      if (typeof info[key] !== "string") throw new Error(`remote workspace.${key} must be a string`);
    }
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
  return { name: name2, wire: name2, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name2}`, create: () => stringSchema } };
}
function invocation(method, parameters, schema, typeSymbol) {
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
    invocation("config", [], configSchema, "dsh-ssh-remote#SshConfig"),
    invocation("statuses", [], statusesSchema, "dsh-ssh-remote#HelperHostStatuses"),
    invocation("workspaceInfo", [parameter("path")], workspaceInfoSchema, "dsh-ssh-remote#RemoteWorkspaceInfo"),
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

// client/native-panels.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function mountNativePanels(ctx) {
  const fiber = ctx.inject(["remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope) => {
    const ssh = scope.remote.sshRemote;
    if (typeof ssh.workspaceInfo !== "function") return () => {
    };
    const workspaceInfo = (path) => ssh.workspaceInfo(path);
    const inject2 = (sessionId) => ({
      workspaceInfo,
      openPanel: (kind) => {
        if (scope.sidebarRight.mounted.getSnapshot() !== sessionId) {
          throw new Error("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u91CD\u65B0\u6253\u5F00\u3002");
        }
        if (scope.sidebarRightTabs.get(kind) === void 0) {
          throw new Error(kind === "files" ? "\u6587\u4EF6\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002" : "\u7EC8\u7AEF\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002");
        }
        scope.sidebarRight.openTab(kind);
      },
      availablePanels: () => (scope.sidebarRightTabs.get("files") === void 0 ? 0 : 1) | (scope.sidebarRightTabs.get("terminal") === void 0 ? 0 : 2),
      subscribePanels: (listener) => scope.sidebarRightTabs.subscribe(listener)
    });
    const header = scope.slots.inject("conversation.session.header.utilities", () => scope.slots.register({
      name: "conversation.session.header.utilities",
      id: "dsh-ssh-remote.native-panels",
      order: 40,
      inject: inject2
    }, NativePanelActions));
    const blank = scope.slots.inject("conversation.input.dock", () => scope.slots.register({
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
    void Promise.resolve().then(() => workspaceInfo(cwd)).then((result) => {
      if (active) setResolved({ key, info: result.ok ? result.value : null });
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
        title: (panels & 1) === 0 ? "DSH \u6587\u4EF6\u9762\u677F\u5C1A\u672A\u52A0\u8F7D\u3002" : `\u6D4F\u89C8 ${identity}\uFF0C\u6587\u4EF6\u9884\u89C8\u4E3A\u53EA\u8BFB\u3002`,
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
    failure?.key === key && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 11 }, children: failure.message })
  ] });
}

// client/index.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var name = "dsh-ssh-remote-client";
var inject = ["remote"];
var MUTATION_DEADLINE_MS = 3e4;
var READ_DEADLINE_MS = 3e4;
async function apply(ctx) {
  const disposeMount = await ctx.remote.$mount(typert_remote_client_default);
  const ui = ctx.inject(["remote.sshRemote", "slots", "workspaces"], (scope) => {
    let pickNative;
    const nativePicker = scope.inject(["remote.directoryPicker"], (next) => {
      const picker = next.remote.directoryPicker;
      const adapter = async (signal) => {
        const result = await picker.pick(signal);
        if (!result.ok) throw new Error(`directory picker failed: ${result.error.message}`);
        return result.value;
      };
      pickNative = adapter;
      return () => {
        if (pickNative === adapter) pickNative = void 0;
      };
    });
    const mountUi = (scope2, directories2) => {
      const ssh = scope2.remote.sshRemote;
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
        createWorkspace: (input) => scope2.workspaces.create(input),
        renameWorkspace: (workspaceId, title) => scope2.workspaces.rename(workspaceId, title)
      });
      return scope2.slots.inject(
        "settings.plugins.tab",
        () => scope2.slots.inject(
          "conversation.hero.workspace.directoryFlow",
          () => scope2.slots.inject("sidebar.workspaces.directoryFlow", function* () {
            yield scope2.slots.register(
              {
                name: "settings.plugins.tab",
                id: "ssh-remote",
                order: 20,
                label: () => "SSH Remote",
                inject: () => ({ ssh })
              },
              SshRemotePanel
            );
            yield scope2.slots.register(
              {
                name: "conversation.hero.workspace.directoryFlow",
                priority: -100,
                inject: flowInject
              },
              SshDirectoryFlow
            );
            yield scope2.slots.register(
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
    const directories = scope.inject(["uiWorkspace"], (next) => mountUi(
      next,
      next.uiWorkspace
    ));
    return async () => {
      await directories.dispose();
      await nativePicker.dispose();
    };
  });
  const disposePanels = mountNativePanels(ctx);
  try {
    await ui;
  } catch (error) {
    await disposePanels();
    await ui.dispose();
    await disposeMount();
    throw error;
  }
  return async () => {
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
function withDeadline(operation, message, milliseconds, onTimeout) {
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
        reject(new Error(message));
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
  const [config, setConfig] = (0, import_react2.useState)(null);
  const [target, setTarget] = (0, import_react2.useState)(null);
  const [listing, setListing] = (0, import_react2.useState)(null);
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [mutating, setMutating] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)("");
  const [newFolder, setNewFolder] = (0, import_react2.useState)("");
  const [pathInput, setPathInput] = (0, import_react2.useState)("");
  const [localCanBrowse, setLocalCanBrowse] = (0, import_react2.useState)(null);
  const [driveAnchors, setDriveAnchors] = (0, import_react2.useState)(null);
  const navigationEpoch = (0, import_react2.useRef)(0);
  const mutationEpoch = (0, import_react2.useRef)(0);
  const mounted = (0, import_react2.useRef)(false);
  const nativePicker = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      navigationEpoch.current += 1;
      mutationEpoch.current += 1;
      nativePicker.current?.abort();
    };
  }, []);
  (0, import_react2.useEffect)(() => {
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
  (0, import_react2.useEffect)(() => {
    if (!open || target?.kind !== "local" || driveAnchors !== null) return;
    const epoch = navigationEpoch.current;
    let cancelled = false;
    void asResult(() => withReadDeadline(listLocal("/mnt"), "\u672C\u673A\u78C1\u76D8\u63A2\u6D4B")).then((result) => {
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
      let result;
      try {
        result = await withReadDeadline(ssh.browse(targetNext.alias, path ?? ""), "\u8FDC\u7A0B\u76EE\u5F55\u6D4F\u89C8");
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
        setPathInput(result.value.path);
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    import_dsh_client_ui_primitives2.Modal,
    {
      open,
      onClose: () => {
        if (!busy && !mutating) cancel();
      },
      className: "dsh-ssh-remote-flow",
      title: !target ? "\u6DFB\u52A0\u5DE5\u4F5C\u533A" : target.kind === "local" ? "\u672C\u673A\u6587\u4EF6" : `SSH \xB7 ${target.alias}`,
      closeLabel: "\u5173\u95ED",
      description: listing ? listing.path : "\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A",
      footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", disabled: busy || mutating, onClick: cancel, children: "\u53D6\u6D88" }),
        target && listing && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", disabled, onClick: () => void commit(), children: busy ? "\u6B63\u5728\u6DFB\u52A0\u2026" : "\u6253\u5F00\u6B64\u6587\u4EF6\u5939" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: ".dsh-ssh-remote-flow{width:min(880px,94vw)}.dsh-ssh-remote-flow .dsh-ssh-remote-field{width:100%;box-sizing:border-box}" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
          !target || !listing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              import_dsh_client_ui_primitives2.Button,
              {
                variant: "outline",
                disabled,
                onClick: () => void chooseLocal(),
                style: sourceRowStyle,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "\u672C\u673A" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: subtleText, children: localCanBrowse === false ? "\u4F7F\u7528\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668" : "\u5728\u5E94\u7528\u5185\u6D4F\u89C8 Host \u6587\u4EF6\u7CFB\u7EDF\uFF08\u542B /mnt \u4E0B\u7684 Windows \u76D8\uFF09" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: hostListStyle, children: [
              config?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                import_dsh_client_ui_primitives2.Button,
                {
                  variant: "outline",
                  disabled,
                  onClick: () => void enter({ kind: "ssh", alias: host.alias }),
                  style: sourceRowStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: host.alias }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: subtleText, children: [
                      host.user ? `${host.user}@` : "",
                      host.host,
                      ":",
                      host.port
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: dimmedText, children: [
                      "Helper \xB7 ",
                      helperStateLabel(host.helper.status),
                      host.helper.version ? ` \xB7 ${host.helper.version}` : ""
                    ] }),
                    host.helper.error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...dimmedText, color: "var(--dsw-alias-label-error)" }, children: host.helper.error }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: dimmedText, children: searchSummary(host.helper) })
                  ]
                },
                host.alias
              )),
              !loading && config?.hosts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: subtleText, children: "~/.ssh/config \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5177\u4F53 Host\u3002" })
            ] })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Input,
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
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { disabled: busy || mutating || !pathInput.trim(), onClick: () => navigate(pathInput.trim()), children: "\u524D\u5F80" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { disabled: busy || mutating, onClick: () => navigate(listing.path), children: "\u5237\u65B0\u76EE\u5F55" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { disabled: busy || mutating, onClick: () => navigate(listing.home), children: "\u4E3B\u76EE\u5F55" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: chipRowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { disabled, onClick: () => {
                setTarget(null);
                setListing(null);
              }, children: target.kind === "local" ? "\u672C\u673A" : "\u4E3B\u673A" }),
              listing.crumbs.map((crumb) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { disabled, onClick: () => navigate(crumb.path), children: crumb.name }, crumb.path))
            ] }),
            target.kind === "local" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: chipRowStyle, children: [
              (driveAnchors ?? []).map((anchor) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { disabled, onClick: () => navigate(anchor.path), children: anchor.label }, anchor.path)),
              driveAnchors === null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: subtleText, children: "\u68C0\u6D4B Windows \u76D8\u2026" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: entryListStyle, children: [
              listing.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                import_dsh_client_ui_primitives2.Button,
                {
                  variant: "ghost",
                  size: "sm",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconFolderCloseRegular, {}),
                  disabled,
                  onClick: () => navigate(entry.path),
                  style: entryRowStyle,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: entry.name }),
                    entry.hidden && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { marginLeft: "auto", ...dimmedText }, children: "\u9690\u85CF" })
                  ]
                },
                entry.path
              )),
              !loading && listing.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { padding: 16, ...dimmedText }, children: "\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002" })
            ] }),
            listing.truncated && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12, ...dimmedText }, children: "\u76EE\u5F55\u5217\u8868\u5DF2\u622A\u65AD\uFF08\u6700\u591A 1000 \u9879\uFF09\uFF1B\u672A\u663E\u793A\u7684\u6587\u4EF6\u5939\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u524D\u5F80\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Input,
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
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Button,
                {
                  variant: "ghost",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutlineRegular, {}),
                  disabled: disabled || !newFolder.trim(),
                  onClick: () => void createFolder(),
                  children: "\u65B0\u5EFA"
                }
              )
            ] })
          ] }),
          loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "status", style: subtleText, children: "\u6B63\u5728\u8BFB\u53D6\u2026" }),
          error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: error })
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
  const [config, setConfig] = (0, import_react2.useState)(null);
  const [error, setError] = (0, import_react2.useState)("");
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [actions, setActions] = (0, import_react2.useState)({});
  const [hostErrors, setHostErrors] = (0, import_react2.useState)({});
  const [details, setDetails] = (0, import_react2.useState)(null);
  const epoch = (0, import_react2.useRef)(0);
  const mounted = (0, import_react2.useRef)(false);
  const actionEpochs = (0, import_react2.useRef)(/* @__PURE__ */ new Map());
  const statusRevision = (0, import_react2.useRef)(0);
  const polling = (0, import_react2.useRef)(null);
  async function load(showLoading = true) {
    const request = ++epoch.current;
    const revision = statusRevision.current;
    if (showLoading) setLoading(true);
    try {
      const result = await withReadDeadline(ssh.config(), "SSH \u914D\u7F6E\u8BFB\u53D6");
      if (!mounted.current || epoch.current !== request) return;
      if (result.ok) {
        setConfig((current) => revision === statusRevision.current || current === null ? result.value : {
          ...result.value,
          hosts: result.value.hosts.map((host) => ({
            ...host,
            helper: current.hosts.find((previous) => previous.alias === host.alias)?.helper ?? host.helper
          }))
        });
        setError("");
      } else setError(result.error.message);
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
      const result = await withReadDeadline(operation, "\u8FDE\u63A5\u72B6\u6001\u8BFB\u53D6");
      if (!mounted.current || epoch.current !== lifecycle || statusRevision.current !== revision || !result.ok) return;
      setConfig((current) => current === null ? current : {
        ...current,
        hosts: current.hosts.map((host) => ({
          ...host,
          helper: actionEpochs.current.has(host.alias) ? host.helper : result.value[host.alias] ?? host.helper
        }))
      });
    } catch {
    }
  }
  (0, import_react2.useEffect)(() => {
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
      const result = await (action === "diagnostics" ? withReadDeadline(operation, "\u8FDE\u63A5\u8BCA\u65AD") : withMutationDeadline(operation, "\u4E3B\u673A\u64CD\u4F5C"));
      if (!isCurrent()) return;
      if (!result.ok) setHostErrors((current) => ({ ...current, [alias]: result.error.message }));
      else {
        if (action === "diagnostics") setDetails(result.value);
        setConfig((current) => current === null ? current : {
          ...current,
          hosts: current.hosts.map((host) => host.alias === alias ? { ...host, helper: result.value } : host)
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14, padding: 12, maxWidth: 760 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { style: { margin: 0 }, children: "SSH Connections" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { marginTop: 4, color: "var(--dsw-alias-label-secondary)", fontSize: 12 }, children: "\u8FDE\u63A5\u7531\u672C\u673A OpenSSH \u5EFA\u7ACB\uFF1B\u7248\u672C\u5316 helper \u7EDF\u4E00\u8FDC\u7AEF\u6587\u4EF6\u3001\u8FDB\u7A0B\u548C PTY\u3002\u663E\u5F0F\u65AD\u5F00\u4F1A\u505C\u6B62\u8BE5 helper session \u7BA1\u7406\u7684\u8FDC\u7AEF\u8FDB\u7A0B\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", size: "sm", disabled: loading, onClick: () => void load(), children: loading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0" })
    ] }),
    config && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: 10, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: subtleText, children: "SSH config" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { style: { fontSize: 12 }, children: config.configPath }),
      !config.configExists && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: "\u8BF7\u521B\u5EFA\u8BE5\u6587\u4EF6\u5E76\u6DFB\u52A0\u5177\u4F53 Host \u540E\u5237\u65B0\u3002" })
    ] }),
    config?.hosts.length === 0 && config.configExists && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: subtleText, children: "\u6CA1\u6709\u53D1\u73B0\u5177\u4F53 SSH Host alias\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: config?.hosts.map((host) => {
      const action = actions[host.alias];
      const busy = action !== void 0;
      const canStop = action === "connect" || action === "retry" || ["connected", "degraded", "installing", "connecting", "reconnecting"].includes(host.helper.status);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { role: "group", "aria-label": `SSH \u4E3B\u673A ${host.alias}`, style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontWeight: 600 }, children: host.alias }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...dimmedText, color: host.helper.status === "error" ? "var(--dsw-alias-label-error)" : void 0 }, children: helperStateLabel(host.helper.status) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...subtleText, overflowWrap: "anywhere" }, children: [
          host.user ? `${host.user}@` : "",
          host.host,
          ":",
          host.port
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 6, ...dimmedText }, children: [
          "Helper ",
          host.helper.version || "\u5C1A\u672A\u63E1\u624B",
          " \xB7 ",
          helperCapabilitySummary(host.helper.capabilities)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: searchSummary(host.helper) }),
        (hostErrors[host.alias] || host.helper.error) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "alert", style: { marginTop: 6, color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: hostErrors[host.alias] || host.helper.error }),
        host.helper.hint && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: host.helper.hint }),
        (host.proxyJump || host.proxyCommand || host.identityFile) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }, children: [
          host.proxyJump && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Pill, { children: [
            "ProxyJump: ",
            host.proxyJump
          ] }),
          host.proxyCommand && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: "ProxyCommand" }),
          host.identityFile && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: "Identity configured" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }, children: [
          canStop ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: action === "disconnect", onClick: () => void runHostAction(host.alias, "disconnect"), children: action === "disconnect" ? "\u6B63\u5728\u505C\u6B62\u2026" : "\u505C\u6B62 / \u65AD\u5F00" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => void runHostAction(host.alias, "connect"), children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u8FDE\u63A5" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void runHostAction(host.alias, "retry"), children: "\u91CD\u8BD5" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => void runHostAction(host.alias, "diagnostics"), children: "\u8BCA\u65AD" })
        ] })
      ] }, host.alias);
    }) }),
    details && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { children: [
          details.alias,
          " \xB7 \u8BCA\u65AD"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { size: "sm", variant: "ghost", onClick: () => setDetails(null), children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: { margin: "8px 0 0", maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 11 }, children: JSON.stringify(details, null, 2) })
    ] }),
    config && config.legacyHostCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: subtleText, children: [
      "\u4ECD\u6709 ",
      config.legacyHostCount,
      " \u4E2A\u65E7 DSH host \u4EC5\u4F5C\u4E3A SFTP \u517C\u5BB9\u515C\u5E95\uFF1B\u8BF7\u8FC1\u79FB\u5230 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: config.configPath }),
      "\u3002"
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)" }, children: error })
  ] });
}
return module.exports; } });
