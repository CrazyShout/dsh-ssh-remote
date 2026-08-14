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
    if (!isNum(value.port)) throw new Error("host.port must be a number");
    if (!isStr(value.user)) throw new Error("host.user must be a string");
    if (!isStr(value.identityFile)) throw new Error("host.identityFile must be a string");
    if (!isStr(value.proxyJump)) throw new Error("host.proxyJump must be a string");
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
var name = "dsh-ssh-remote-client";
var inject = ["remote", "slots"];
async function apply(ctx) {
  const remote = ctx.remote;
  const disposeMount = await remote.$mount(typert_remote_client_default);
  return () => {
    void disposeMount?.();
  };
}
return module.exports; } });
