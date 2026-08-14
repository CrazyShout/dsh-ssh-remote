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
function isStr(v) {
  return typeof v === "string";
}
function isNum(v) {
  return typeof v === "number";
}
var hostEntrySchema = {
  parse(value) {
    parseObject(value);
    if (!isStr(value.name)) throw new Error("host.name must be a string");
    if (!isStr(value.host)) throw new Error("host.host must be a string");
    if (value.port !== void 0 && !isNum(value.port)) throw new Error("host.port must be a number");
    if (value.user !== void 0 && !isStr(value.user)) throw new Error("host.user must be a string");
    if (value.identityFile !== void 0 && !isStr(value.identityFile)) throw new Error("host.identityFile must be a string");
    if (value.proxyJump !== void 0 && !isStr(value.proxyJump)) throw new Error("host.proxyJump must be a string");
    return value;
  }
};
var configSchema = {
  parse(value) {
    parseObject(value);
    if (!Array.isArray(value.hosts)) throw new Error("hosts must be an array");
    for (const host of value.hosts) hostEntrySchema.parse(host);
    return value;
  }
};
var okResultSchema = {
  parse(value) {
    parseObject(value);
    if (typeof value.ok !== "boolean") throw new Error("ok must be a boolean");
    return value;
  }
};
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
      sourceLocation: { file: "src/registry.ts", line: 100, column: 3 }
    },
    {
      id: "dsh-ssh-remote#sshRemote/saveConfig",
      service: "sshRemote",
      namespace: "sshRemote",
      method: "saveConfig",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "request",
          wire: "request",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-ssh-remote#SaveConfigRequest",
            schema: configSchema
          }
        }
      ],
      result: {
        mode: "strict",
        typeSymbol: "dsh-ssh-remote#SaveConfigResult",
        schema: okResultSchema
      },
      sourceLocation: { file: "src/registry.ts", line: 106, column: 3 }
    }
  ]
};
var typert_remote_client_default = TYPERT_REMOTE;

// client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-ssh-remote-client";
var inject = ["remote", "slots", "locale"];
var EMPTY = { name: "", host: "", port: 22, user: "", identityFile: "", proxyJump: "" };
async function apply(ctx) {
  const remote = ctx.remote;
  const disposeMount = await remote.$mount(typert_remote_client_default);
  const ssh = remote.sshRemote;
  const slots = ctx.slots;
  const disposeTab = slots.inject(
    "settings.plugins.tab",
    () => slots.register(
      { name: "settings.plugins.tab", id: "ssh-remote", order: 20, label: () => "SSH Remote" },
      () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SshRemotePanel, { ssh })
    )
  );
  return () => {
    disposeTab?.();
    void disposeMount?.();
  };
}
function SshRemotePanel({ ssh }) {
  const [hosts, setHosts] = (0, import_react.useState)([]);
  const [draft, setDraft] = (0, import_react.useState)(EMPTY);
  const [error, setError] = (0, import_react.useState)("");
  const [saved, setSaved] = (0, import_react.useState)(false);
  async function load() {
    const r = await ssh.config();
    if (r.ok) setHosts(r.value.hosts);
    else setError(r.error.message);
  }
  (0, import_react.useEffect)(() => {
    void load();
  }, []);
  function set(k, v) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  async function add() {
    if (!draft.name || !draft.host) {
      setError("name and host are required");
      return;
    }
    const next = [...hosts.filter((h) => h.name !== draft.name), { ...draft }];
    const r = await ssh.saveConfig({ hosts: next });
    if (r.ok) {
      setHosts(next);
      setDraft(EMPTY);
      setSaved(true);
      setError("");
    } else {
      setError(r.error.message);
    }
  }
  async function remove(name2) {
    const next = hosts.filter((h) => h.name !== name2);
    const r = await ssh.saveConfig({ hosts: next });
    if (r.ok) setHosts(next);
    else setError(r.error.message);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12, padding: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0 }, children: "SSH Remote Hosts" }),
    hosts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#888" }, children: "No hosts configured." }),
    hosts.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { flex: 1 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: h.name }),
        " \u2014 ",
        h.user ? h.user + "@" : "",
        h.host,
        ":",
        h.port,
        h.proxyJump ? ` (jump: ${h.proxyJump})` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => void remove(h.name), children: "Remove" })
    ] }, h.name)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("hr", { style: { width: "100%" } }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "name *", value: draft.name, onChange: (v) => set("name", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "host *", value: draft.host, onChange: (v) => set("host", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "port", value: String(draft.port), onChange: (v) => set("port", Number(v) || 22) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "user", value: draft.user, onChange: (v) => set("user", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "identityFile", value: draft.identityFile, onChange: (v) => set("identityFile", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "proxyJump", value: draft.proxyJump, onChange: (v) => set("proxyJump", v) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => void add(), children: "Add host" }),
    saved && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#22c55e" }, children: "Saved." }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ef4444" }, children: error })
  ] });
}
function Field({ label, value, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }, children: [
    label,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value, onChange: (e) => onChange(e.target.value) })
  ] });
}
return module.exports; } });
