// shared/ssh-schema.js
function sshInvocations(schemas) {
  const methods = [
    ["config", [], "SshConfig"],
    ["statuses", [], "HelperHostStatuses"],
    ["workspaceInfo", ["path"], "RemoteWorkspaceInfo"],
    ["browse", ["alias", "path"], "RemoteDirectoryListing"],
    ["createDirectory", ["alias", "parent", "name"], "string"],
    ["materializeWorkspace", ["alias", "remotePath"], "SshWorkspaceAnchor"],
    ["connectHost", ["alias"], "HelperHostStatus"],
    ["disconnectHost", ["alias"], "HelperHostStatus"],
    ["retryHost", ["alias"], "HelperHostStatus"],
    ["diagnostics", ["alias"], "HelperHostDiagnostics"],
    ["refreshEnvironment", ["alias"], "HelperHostStatus"],
    ["migrationPreview", ["selections"], "MigrationPreview"],
    ["migrationApply", ["token"], "MigrationResult"],
    ["migrationRollback", ["id"], "boolean"]
  ];
  return methods.map(([method, parameters, result4]) => ({
    id: `dsh-ssh-remote#sshRemote/${method}`,
    service: "sshRemote",
    namespace: "sshRemote",
    method,
    invocation: { kind: "direct" },
    parameters: parameters.map((name) => ({
      name,
      wire: name,
      source: "json",
      codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name}`, create: () => schemas[name] ?? schemas.string }
    })),
    result: { mode: "strict", typeSymbol: result4 === "string" || result4 === "boolean" ? result4 : `dsh-ssh-remote#${result4}`, create: () => schemas[result4] },
    sourceLocation: { file: "src/registry.ts", line: 1, column: 1 }
  }));
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

// client/port-forward-schema.ts
var string3 = { parse(value) {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
} };
var identity = { parse(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{16,80}$/u.test(value)) throw new Error("invalid forwarding identity");
  return value;
} };
function object2(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid port forwarding object");
  return value;
}
function parsePorts(value, tombstone) {
  const row = object2(value);
  identity.parse(row.id);
  if (!["http", "https"].includes(String(row.protocol))) throw new Error("invalid forwarding protocol");
  for (const key of ["localPort", "remotePort"]) if (!Number.isInteger(row[key]) || Number(row[key]) < (tombstone ? 0 : key === "localPort" ? 1024 : 1) || Number(row[key]) > 65535) throw new Error("invalid port");
  return value;
}
var input = { parse: (value) => parsePorts(value, false) };
var view = { parse(value) {
  parsePorts(value, true);
  const row = object2(value);
  string3.parse(row.alias);
  string3.parse(row.error);
  if (!["starting", "listening", "stopping", "stopped", "error"].includes(String(row.state)) || typeof row.createdAt !== "number" || typeof row.canRetry !== "boolean") throw new Error("invalid forward state");
  const probe = object2(row.probe);
  string3.parse(probe.message);
  if (!["reachable", "unreachable", "unknown"].includes(String(probe.state))) throw new Error("invalid probe");
  return value;
} };
var list = { parse(value) {
  const row = object2(value);
  string3.parse(row.host);
  string3.parse(row.alias);
  if (typeof row.supported !== "boolean" || !Array.isArray(row.items) || row.items.length > 32) throw new Error("invalid forward list");
  for (const item of row.items) view.parse(item);
  return value;
} };
var scope3 = {
  name: "workspaceFileScope",
  wire: "workspaceFileScopeId",
  source: "lookup",
  lookup: "workspaceFileScope",
  codec: { mode: "strict", typeSymbol: "@deepseek-ai/dsh-session/types#SessionId", create: () => string3 }
};
var parameter3 = (name, schema) => ({
  name,
  wire: name,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#ports/${name}`, create: () => schema }
});
function invocation3(method, parameters, schema, cancel = false) {
  return {
    id: `dsh-ssh-remote#sshRemotePorts/${method}`,
    service: "sshRemotePorts",
    namespace: "sshRemotePorts",
    method,
    invocation: { kind: "direct" },
    parameters: [scope3, ...parameters],
    ...cancel ? { cancellation: { parameter: "signal" } } : {},
    result: { mode: "strict", typeSymbol: `dsh-ssh-remote#ports/${method}Result`, create: () => schema },
    sourceLocation: { file: "src/port-forwards.ts", line: 1, column: 1 }
  };
}
var portForwardInvocations = [
  invocation3("list", [], list, true),
  invocation3("create", [parameter3("input", input)], view),
  invocation3("stop", [parameter3("id", identity)], view),
  invocation3("probe", [parameter3("id", identity)], view)
];

// node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
var Cached = class {
  constructor(getter) {
    this._getter = getter;
    this._value = void 0;
  }
  get value() {
    const getter = this._getter;
    if (getter !== void 0) {
      this._value = getter();
      this._getter = void 0;
    }
    return this._value;
  }
};
function cached(getter) {
  return new Cached(getter);
}
function nullish(input2) {
  return input2 === null || input2 === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function rawShape(def) {
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
  return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key, getter) {
  Object.defineProperty(target, key, {
    get() {
      const value = getter();
      assignProp(this, key, value);
      return value;
    },
    enumerable: true,
    configurable: true
  });
}
function putProp(target, key, value) {
  if (key in target)
    assignProp(target, key, value);
  else
    target[key] = value;
}
function mirrorShape(target, source, keys, wrap) {
  const raw = sourceShape(source);
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (!desc.enumerable)
      continue;
    if (desc.get) {
      deferProp(target, key, () => {
        const value = source._zod.def.shape[key];
        return wrap ? wrap(value, key) : value;
      });
    } else
      putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
  }
}
function mirrorProps(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc.enumerable)
      continue;
    if (desc.get)
      deferProp(target, key, () => source[key]);
    else
      putProp(target, key, desc.value);
  }
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str2) {
  return str2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = sourceShape(schema);
    for (const key of Reflect.ownKeys(shape)) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
  mirrorProps(newShape, shape);
  return newShape;
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path2, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path2);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function attachSchema(issues, start, inst) {
  var _a2;
  for (let i = start; i < issues.length; i++) {
    (_a2 = issues[i]).schema ?? (_a2.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config2) {
  var _a2;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a2 = iss).schema ?? (_a2.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str2) {
  const units = str2.length;
  if (!highSurrogate.test(str2))
    return units;
  let count = units;
  for (let i = 0; i < units - 1; i++) {
    if ((str2.charCodeAt(i) & 64512) === 55296 && (str2.charCodeAt(i + 1) & 64512) === 56320) {
      count--;
      i++;
    }
  }
  return count;
}
function getLengthableOrigin(input2) {
  if (Array.isArray(input2))
    return "array";
  if (typeof input2 === "string")
    return "string";
  return "unknown";
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return void 0;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = void 0;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: void 0 };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}

// node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: void 0, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition();
      }
      try {
        return new Definition();
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition();
}
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer2, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = /* @__PURE__ */ new Set();
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = void 0;
      }
    } else if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer2(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = void 0;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: void 0, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = void 0;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, void 0, {
  Parent: Error
});

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result4 = schema._zod.run({ value, issues: [] }, ctx);
    if (result4 instanceof Promise) {
      throw new $ZodAsyncError();
    }
    if (result4.issues.length) {
      const e = new (_params?.Err ?? _Err)(result4.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result4.value;
  };
  return fn;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result4 = schema._zod.run({ value, issues: [] }, ctx);
    if (result4 instanceof Promise)
      result4 = await result4;
    if (result4.issues.length) {
      const e = new (params?.Err ?? _Err)(result4.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result4.value;
  };
  return fn;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result4 = schema._zod.run({ value, issues: [] }, ctx);
  if (result4 instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result4.issues.length ? failure(_Err, result4.issues, ctx) : { success: true, data: result4.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = void 0;
        ctx = void 0;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = void 0;
      ctx = void 0;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result4 = schema._zod.run({ value, issues: [] }, ctx);
  if (result4 instanceof Promise)
    result4 = await result4;
  return result4.issues.length ? failure(_Err, result4.issues, ctx) : { success: true, data: result4.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// node_modules/zod/v4/core/regexes.js
var anyString = /^[\s\S]{0,}$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
var _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== void 0;
};
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.check = (payload) => {
    const input2 = payload.value;
    if (isInt) {
      if (!Number.isInteger(input2)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input: input2,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input2)) {
        if (input2 > 0) {
          payload.issues.push({
            input: input2,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input: input2,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input2 < minimum) {
      payload.issues.push({
        origin: "number",
        input: input2,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input2 > maximum) {
      payload.issues.push({
        origin: "number",
        input: input2,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input2 = payload.value;
    const units = input2.length;
    const length = typeof input2 === "string" && units > def.maximum ? codePointLength(input2) : units;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input2);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input: input2,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a2, _b;
  $ZodCheck.init(inst, def);
  if (def.pattern)
    (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 6,
  patch: 5
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result4 = inst._zod.parse(payload, ctx);
      if (result4 instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result4.then((result5) => runChecks(result5, checks, ctx));
      }
      return runChecks(result4, checks, ctx);
    };
  }
}, {
  // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {
      }
      return validateAsync(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input2 = payload.value;
    if (typeof input2 === "number" && !Number.isNaN(input2) && Number.isFinite(input2)) {
      return payload;
    }
    const received = typeof input2 === "number" ? Number.isNaN(input2) ? "NaN" : !Number.isFinite(input2) ? String(input2) : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input: input2,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input2 = payload.value;
    if (typeof input2 === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input: input2,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result4, final, index) {
  if (result4.issues.length) {
    final.issues.push(...prefixIssues(index, result4.issues));
  }
  final.value[index] = result4.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input2 = payload.value;
    if (!Array.isArray(input2)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input: input2,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, Array(input2.length), ctx) : Array(input2.length);
    const proms = [];
    const abortEarly = ctx?.abortEarly;
    for (let i = 0; i < input2.length; i++) {
      const item = input2[i];
      const result4 = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result4 instanceof Promise) {
        proms.push(result4.then((result5) => handleArrayResult(result5, payload, i)));
      } else {
        handleArrayResult(result4, payload, i);
        if (abortEarly && result4.issues.length !== 0 && aborted(result4))
          break;
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result4, final, key, input2, optin, optout) {
  const isPresent = key in input2;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result4.issues.length) {
    if (optin !== void 0 && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result4.issues));
  }
  if (!isPresent && optin === void 0) {
    if (!result4.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result4.value === void 0) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result4.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input2, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key in input2) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input2[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input2, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input2, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input: input2,
      inst,
      // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  const sh = desc?.get ? desc.get.raw : def.shape ?? {};
  if (sh) {
    const get = () => {
      const newSh = { ...sh };
      Object.defineProperty(def, "shape", { value: newSh });
      get.raw = newSh;
      return newSh;
    };
    get.raw = sh;
    Object.defineProperty(def, "shape", { get });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
          assignProp(propValues, key, /* @__PURE__ */ new Set());
        }
        for (const v of field.values)
          propValues[key].add(v);
        if (field.optin !== void 0)
          propValues[key].add(void 0);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input2 = payload.value;
    if (!isObject2(input2)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input: input2,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    const abortEarly = ctx?.abortEarly;
    let seen = payload.issues.length;
    for (const key of value.allKeys) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (key === "__proto__")
        continue;
      const el = shape[key];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input2[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input2, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input2, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input2, payload, ctx, _normalized.value, inst, abortEarly === true);
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  defineLazyInternal(inst, "pattern", (zod) => {
    const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
    return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input2 = payload.value;
    if (valuesSet.has(input2)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input: input2,
      inst
    });
    return payload;
  };
});
function handleOptionalResult(payload, result4) {
  payload.value = result4.issues.length ? void 0 : result4.value;
  return payload;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  inst._zod.optout = "optional";
  defineLazyInternal(inst, "values", (zod) => {
    const values = zod.def.innerType._zod.values;
    return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      if (def.innerType._zod.optin !== "defaulted")
        return payload;
      const result4 = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result4 instanceof Promise)
        return result4.then((result5) => handleOptionalResult(payload, result5));
      return handleOptionalResult(payload, result4);
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});

// node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
  return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
  return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}

// node_modules/zod/v4/mini/schemas.js
var ZodMiniType = /* @__PURE__ */ $constructor("ZodMiniType", (inst, def) => {
  if (!inst._zod)
    throw new Error("Uninitialized schema in ZodMiniType.");
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
}, {
  // `with` is an alias for `check`: the same function object, not a wrapper.
  get with() {
    return this.check;
  },
  set with(value) {
    own(this, "with", value);
  },
  parse(data, params) {
    return parse(this, data, params, { callee: this.parse });
  },
  parseAsync(data, params) {
    return parseAsync(this, data, params, { callee: this.parseAsync });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  check(...checks) {
    const def = this.def;
    return this.clone({
      ...def,
      checks: [
        ...def.checks ?? [],
        ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }, { parent: true });
  },
  clone(_def, params) {
    return clone(this, _def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta2) {
    reg.add(this, meta2);
    return this;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  }
});
var ZodMiniString = /* @__PURE__ */ $constructor("ZodMiniString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function string5(params) {
  return _string(ZodMiniString, params);
}
var ZodMiniNumber = /* @__PURE__ */ $constructor("ZodMiniNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function number2(params) {
  return _number(ZodMiniNumber, params);
}
var ZodMiniNumberFormat = /* @__PURE__ */ $constructor("ZodMiniNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodMiniNumber.init(inst, def);
});
function int(params) {
  return _int(ZodMiniNumberFormat, params);
}
var ZodMiniBoolean = /* @__PURE__ */ $constructor("ZodMiniBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function boolean2(params) {
  return _boolean(ZodMiniBoolean, params);
}
var ZodMiniArray = /* @__PURE__ */ $constructor("ZodMiniArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function array(element, params) {
  return new ZodMiniArray({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
var ZodMiniObject = /* @__PURE__ */ $constructor("ZodMiniObject", (inst, def) => {
  $ZodObject.init(inst, def);
  ZodMiniType.init(inst, def);
  installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
});
// @__NO_SIDE_EFFECTS__
function object3(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodMiniObject(def);
}
// @__NO_SIDE_EFFECTS__
function extend2(schema, shape) {
  return extend(schema, shape);
}
var ZodMiniEnum = /* @__PURE__ */ $constructor("ZodMiniEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodMiniType.init(inst, def);
  inst.options = [...inst._zod.values];
});
// @__NO_SIDE_EFFECTS__
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodMiniEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodMiniOptional = /* @__PURE__ */ $constructor("ZodMiniOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function optional(innerType) {
  return new ZodMiniOptional({
    type: "optional",
    innerType
  });
}
var ZodMiniNullable = /* @__PURE__ */ $constructor("ZodMiniNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function nullable(innerType) {
  return new ZodMiniNullable({
    type: "nullable",
    innerType
  });
}

// shared/transfer-schema.js
var id = string5().check(_regex(/^[a-zA-Z0-9-]{16,80}$/u));
var bytes = int().check(_gte(0), _lte(2 ** 40));
var cursor = int().check(_gte(0), _lte(1e4));
var path = string5().check(_maxLength(4096));
var sha = string5().check(_regex(/^[0-9a-f]{64}$/u));
var optional2 = optional;
var limitedArray = (item, limit) => array(item).check(_maxLength(limit));
var entry = object3({ path, kind: _enum(["file", "directory", "excluded"]), size: optional2(bytes), version: optional2(string5()), reason: optional2(string5()) });
var file = extend2(entry, {
  index: cursor,
  id,
  state: _enum(["queued", "verifying", "transferring", "complete", "paused", "failed", "unknown", "skipped"]),
  offset: bytes,
  sha256: optional2(sha),
  error: optional2(string5()),
  replaceVersion: optional2(nullable(string5()))
});
var job = object3({
  id,
  direction: _enum(["upload", "download"]),
  rootUri: string5(),
  alias: string5(),
  target: path,
  sources: optional2(limitedArray(path, 100)),
  destination: optional2(id),
  state: _enum(["preparing", "ready", "running", "paused", "complete", "cancelled", "cleanup-pending", "expired"]),
  count: cursor,
  appended: cursor,
  totalBytes: bytes,
  created: number2(),
  updated: number2(),
  error: optional2(string5()),
  live: boolean2(),
  nonce: id
});
var page = object3({ job, entries: limitedArray(file, 200), next: cursor, done: boolean2(), run: optional2(id) });
var plan = object3({ id, direction: _enum(["upload", "download"]), target: path, sources: optional2(limitedArray(path, 100)), count: optional2(cursor), totalBytes: optional2(bytes) });
var append = object3({ id, after: cursor, entries: limitedArray(entry, 200) });
var control = object3({ id, action: _enum(["resume", "pause", "cancel", "heartbeat", "forget"]), run: id, destination: optional2(id) });
var request = object3({ id, index: cursor, run: id, action: _enum(["begin", "verify", "finish", "skip", "retry"]), sha256: optional2(sha), offset: optional2(bytes), replace: optional2(boolean2()) });
var result3 = object3({ file, state: optional2(string5()), verifyOffset: optional2(bytes), prefix: optional2(sha) });
var scope4 = {
  name: "workspaceFileScope",
  wire: "workspaceFileScopeId",
  source: "lookup",
  lookup: "workspaceFileScope",
  codec: { mode: "strict", typeSymbol: "@deepseek-ai/dsh-session/types#SessionId", create: () => string5() }
};
var parameter4 = (name, schema) => ({ name, wire: name, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#transfer/${name}`, create: () => schema } });
var invocation4 = (method, parameters, schema, cancel = false) => ({
  id: `dsh-ssh-remote#sshRemoteTransfers/${method}`,
  service: "sshRemoteTransfers",
  namespace: "sshRemoteTransfers",
  method,
  invocation: { kind: "direct" },
  parameters: [scope4, ...parameters],
  ...cancel ? { cancellation: { parameter: "signal" } } : {},
  result: { mode: "strict", typeSymbol: `dsh-ssh-remote#transfer/${method}Result`, create: () => schema },
  sourceLocation: { file: "src/transfers.ts", line: 1, column: 1 }
});
var transferInvocations = [
  invocation4("list", [], limitedArray(job, 64), true),
  invocation4("plan", [parameter4("request", plan)], page),
  invocation4("append", [parameter4("request", append)], page),
  invocation4("page", [parameter4("id", id), parameter4("cursor", cursor)], page, true),
  invocation4("control", [parameter4("request", control)], page),
  invocation4("file", [parameter4("request", request)], result3)
];

// shared/terminal-state-schema.js
var str = string5();
var nullable2 = (schema) => nullable(schema);
var bounded = (schema, max) => array(schema).check(_maxLength(max));
var command = object3({ command: nullable2(str), cwd: nullable2(str), startedAt: number2(), elapsedMs: nullable2(number2()), exitCode: nullable2(number2()), uncertain: boolean2() });
var shellSnapshotSchema = object3({
  instance: str,
  sequence: str,
  revision: number2(),
  state: _enum(["starting", "prompt", "running", "unsupported", "unknown", "exited"]),
  reason: str,
  cwd: nullable2(str),
  current: nullable2(command),
  recent: bounded(command, 16)
});
var view2 = extend2(shellSnapshotSchema, { id: str, title: str, alias: str, stale: boolean2(), observedAt: number2() });
var scope5 = {
  name: "workspaceFileScope",
  wire: "workspaceFileScopeId",
  source: "lookup",
  lookup: "workspaceFileScope",
  codec: { mode: "strict", typeSymbol: "@deepseek-ai/dsh-session/types#SessionId", create: () => str }
};
var invocation5 = (method, parameters, result4) => ({
  id: `dsh-ssh-remote#sshRemoteTerminalState/${method}`,
  service: "sshRemoteTerminalState",
  namespace: "sshRemoteTerminalState",
  method,
  invocation: { kind: "direct" },
  parameters: [scope5, ...parameters],
  cancellation: { parameter: "signal" },
  result: { mode: "strict", typeSymbol: `dsh-ssh-remote#terminalState/${method}`, create: () => result4 },
  sourceLocation: { file: "src/terminal-state.ts", line: 1, column: 1 }
});
var terminalStateInvocations = [invocation5("list", [], bounded(view2, 64)), invocation5(
  "context",
  [{ name: "id", wire: "id", source: "json", codec: { mode: "strict", typeSymbol: "string", create: () => str } }],
  object3({ terminal: view2, text: str.check(_maxLength(65536)), truncated: boolean2() })
)];

// shared/update-schema.js
function updateInvocations(schemas) {
  return [["info", [], "UpdateInfo"], ["check", ["force"], "ReleaseCheck"]].map(([method, parameters, result4]) => ({
    id: `dsh-ssh-remote#sshRemoteUpdates/${method}`,
    service: "sshRemoteUpdates",
    namespace: "sshRemoteUpdates",
    method,
    invocation: { kind: "direct" },
    parameters: parameters.map((name) => ({
      name,
      wire: name,
      source: "json",
      codec: { mode: "strict", typeSymbol: "boolean", create: () => schemas.boolean }
    })),
    result: { mode: "strict", typeSymbol: `dsh-ssh-remote#${result4}`, create: () => schemas[result4] },
    sourceLocation: { file: "src/updates.ts", line: 1, column: 1 }
  }));
}

// client/typert.remote-client.ts
function object4(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
var stringSchema = { parse(value) {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
} };
var helperStatusSchema = {
  parse(value) {
    const row = object4(value, "helper status");
    for (const key of ["status", "version", "sessionId", "error"]) {
      if (typeof row[key] !== "string") throw new Error(`helper.${key} must be a string`);
    }
    object4(row.capabilities, "helper capabilities");
    for (const key of ["errorCode", "hint"]) {
      if (row[key] !== void 0 && typeof row[key] !== "string") throw new Error(`helper.${key} must be a string`);
    }
    if (row.retryable !== void 0 && typeof row.retryable !== "boolean") throw new Error("helper.retryable must be boolean");
    if (row.environment !== void 0) {
      const environment = object4(row.environment, "helper environment");
      const search = object4(environment.search, "helper search");
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
    const config2 = object4(value, "SSH config");
    if (typeof config2.configPath !== "string" || typeof config2.configExists !== "boolean") throw new Error("invalid SSH config");
    if (!Array.isArray(config2.hosts) || typeof config2.legacyHostCount !== "number") throw new Error("invalid SSH hosts");
    for (const item of config2.hosts) {
      const host = object4(item, "SSH host");
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
    const statuses = object4(value, "helper statuses");
    for (const status2 of Object.values(statuses)) helperStatusSchema.parse(status2);
    return value;
  }
};
var directoryEntrySchema = {
  parse(value) {
    const entry2 = object4(value, "directory entry");
    if (typeof entry2.name !== "string" || typeof entry2.path !== "string" || typeof entry2.hidden !== "boolean") {
      throw new Error("invalid directory entry");
    }
    return value;
  }
};
var directoryListingSchema = {
  parse(value) {
    const listing = object4(value, "directory listing");
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
    const anchor = object4(value, "workspace anchor");
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
    const info = object4(value, "remote workspace");
    for (const key of ["alias", "remotePath", "uri"]) {
      if (typeof info[key] !== "string") throw new Error(`remote workspace.${key} must be a string`);
    }
    return value;
  }
};
var diagnosticsSchema = {
  parse(value) {
    helperStatusSchema.parse(value);
    const details = object4(value, "helper diagnostics");
    for (const key of ["alias", "helperSha256", "stderr", "assetPath"]) {
      if (typeof details[key] !== "string") throw new Error(`diagnostics.${key} must be a string`);
    }
    for (const key of ["lastConnectedAt", "lastHealthAt", "nextRetryAt"]) {
      if (typeof details[key] !== "number") throw new Error(`diagnostics.${key} must be a number`);
    }
    return value;
  }
};
var migrationObject = { parse(value) {
  return object4(value, "migration result");
} };
var booleanSchema = { parse(value) {
  if (typeof value !== "boolean") throw new Error("expected boolean");
  return value;
} };
var selectionsSchema = { parse(value) {
  if (!Array.isArray(value)) throw new Error("expected selections");
  return value;
} };
var updateInfoSchema = { parse(value) {
  const row = object4(value, "update information");
  for (const key of ["profileId", "runningVersion", "installedVersion", "source", "sourceKind"]) stringSchema.parse(row[key]);
  booleanSchema.parse(row.enabled);
  return value;
} };
var releaseCheckSchema = { parse(value) {
  const row = object4(value, "release check");
  if (typeof row.checkedAt !== "number") throw new Error("invalid check timestamp");
  stringSchema.parse(row.error);
  if (row.latest !== null) {
    const latest = object4(row.latest, "release");
    for (const key of ["version", "url", "packageUrl", "publishedAt", "sha256"]) stringSchema.parse(latest[key]);
    if (!Array.isArray(latest.testedDshVersions)) throw new Error("invalid tested versions");
    latest.testedDshVersions.forEach(stringSchema.parse);
  }
  return value;
} };
var TYPERT_REMOTE = {
  package: "dsh-ssh-remote",
  descriptors: [
    ...sshInvocations({
      string: stringSchema,
      boolean: booleanSchema,
      selections: selectionsSchema,
      SshConfig: configSchema,
      HelperHostStatuses: statusesSchema,
      RemoteWorkspaceInfo: workspaceInfoSchema,
      RemoteDirectoryListing: directoryListingSchema,
      SshWorkspaceAnchor: workspaceAnchorSchema,
      HelperHostStatus: helperStatusSchema,
      HelperHostDiagnostics: diagnosticsSchema,
      MigrationPreview: migrationObject,
      MigrationResult: migrationObject
    }),
    ...editorInvocations,
    ...fileSearchInvocations,
    ...portForwardInvocations,
    ...transferInvocations,
    ...terminalStateInvocations,
    ...updateInvocations({ boolean: booleanSchema, UpdateInfo: updateInfoSchema, ReleaseCheck: releaseCheckSchema })
  ]
};
var typert_remote_client_default = TYPERT_REMOTE;
export {
  TYPERT_REMOTE,
  typert_remote_client_default as default
};
