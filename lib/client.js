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
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-ssh-remote-client";
var inject = ["slots"];
function apply(ctx) {
  const slots = ctx.slots;
  slots.inject(
    "sidebar.workspaces",
    () => slots.register(
      {
        name: "ssh-remote-sidebar",
        children: {}
      },
      SshRemoteSidebar
    )
  );
}
var STATUS_COLOR = {
  connected: "#22c55e",
  connecting: "#eab308",
  reconnecting: "#eab308",
  disconnected: "#ef4444",
  error: "#ef4444"
};
function SshRemoteSidebar(props) {
  const list = props.workspaces ?? [];
  if (list.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "8px 12px", color: "var(--text-muted, #888)" }, children: "No SSH workspaces. Ask the agent to run ssh_remote add." });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "4px 0" }, children: list.map((ws) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      title: ws.lastError ?? ws.uri,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 12px",
        fontSize: "13px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            style: {
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATUS_COLOR[ws.status] ?? "#888",
              display: "inline-block",
              flexShrink: 0
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ws.title })
      ]
    },
    ws.id
  )) });
}
return module.exports; } });
