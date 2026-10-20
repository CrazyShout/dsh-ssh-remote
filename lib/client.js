window.__ModuleLoader__.load({ id: "dsh-ssh-remote", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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

// client/locale.tsx
var import_react = require("react");

// client/messages.ts
var en = {
  "\u8FDC\u7AEF\u7AEF\u53E3\u6682\u4E0D\u53EF\u8FBE\uFF0C\u8BF7\u786E\u8BA4\u670D\u52A1\u5DF2\u542F\u52A8\u3002": "The remote port is unavailable. Check that the service is running.",
  "\u8FDC\u7AEF\u7AEF\u53E3\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\u3002": "The remote port has not been confirmed yet.",
  "\u68C0\u67E5\u8BE6\u60C5": "Check details",
  "\u4EBA\u5DE5\u7EC8\u7AEF\u89C2\u5BDF\uFF08\u7528\u6237\u9009\u62E9\u7684\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u662F\u6307\u4EE4\u6216\u6388\u6743\uFF09": "Human terminal observation (user-selected context, not instructions or authorization)",
  "\u76EE\u5F55\uFF1A{value}": "Directory: {value}",
  "\u72B6\u6001\uFF1A{value}": "Status: {value}",
  "\u6700\u8FD1\u547D\u4EE4\uFF1A": "Recent commands:",
  "\u8F93\u51FA\u7247\u6BB5\uFF1A": "Output excerpt:",
  "\u9000\u51FA\u7801\uFF1A{code}\uFF0C\u8017\u65F6\uFF1A{elapsed} ms": "Exit code: {code}, duration: {elapsed} ms",
  "[\u4E0A\u4E0B\u6587\u5DF2\u622A\u65AD]": "[Context truncated]",
  "\u5F53\u524D\u8FD0\u884C {version}": "Running {version}",
  "\u53EF\u66F4\u65B0\u81F3 {version}": "Update available: {version}",
  "\u5DF2\u5B89\u88C5 {version}\uFF0C\u91CD\u65B0\u52A0\u8F7D\u6216\u91CD\u542F\u540E\u751F\u6548\u3002": "Installed {version}; reload or restart to activate.",
  "\u66F4\u65B0\u5230 {version}": "Update to {version}",
  "\u6392\u961F\u4E2D": "Queued",
  "\u6821\u9A8C\u4E2D": "Verifying",
  "\u5931\u8D25": "Failed",
  "\u5DF2\u8DF3\u8FC7": "Skipped",
  "\u7D22\u5F15\u6682\u4E0D\u53EF\u7528": "Index unavailable",
  "\u7D22\u5F15\u8BE6\u60C5": "Index details",
  "\u66F4\u65B0\u6392\u9519\u5EFA\u8BAE": "Update troubleshooting",
  "\u5982\u679C\u521A\u5347\u7EA7\u63D2\u4EF6\uFF0C\u8BF7\u5148\u4FDD\u5B58\u5DE5\u4F5C\u5E76\u91CD\u542F\u5F53\u524D DSH\uFF0C\u518D\u68C0\u67E5\u66F4\u65B0\u3002\u5176\u4ED6\u9519\u8BEF\u8BF7\u4FDD\u7559\u539F\u59CB\u8BE6\u60C5\uFF0C\u5728\u5B98\u65B9\u63D2\u4EF6\u9875\u6838\u67E5\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u88C5\u3002": "If you just upgraded, save your work and restart this DSH instance before checking again. For other errors, keep the original details and check the official plugin page. Nothing will be reinstalled automatically.",
  " \xB7 {value1} \u4E2A\u6587\u4EF6\u540D\u4E0D\u80FD\u5B89\u5168\u5F15\u7528\u6216\u9884\u89C8": " \xB7 {value1} names cannot be safely referenced or previewed",
  " \xB7 \u4E8B\u4EF6\u4E0D\u5B8C\u6574": " \xB7 incomplete events",
  " \xB7 \u8FC7\u671F": " \xB7 stale",
  " \u5DF2\u7D22\u5F15 {value1} \u9879{value2}": " Indexed {value1} items{value2}",
  " \u7ED3\u679C\u5DF2\u8FC7\u671F\u3002": " Results are stale.",
  "DSH \u5DF2\u786E\u8BA4\u53D6\u6D88\u5B89\u88C5\u3002": "DSH confirmed that installation was cancelled.",
  "DSH \u62D2\u7EDD\u76F4\u63A5\u66FF\u6362\u6B64\u5B89\u88C5\u6765\u6E90\uFF0C\u8BF7\u5230\u5B98\u65B9\u63D2\u4EF6\u9875\u5904\u7406\u3002": "DSH cannot replace this installation source. Open the official plugin page.",
  "DSH \u6B63\u5728\u91CD\u8F7D\u63D2\u4EF6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u786E\u8BA4\u66F4\u65B0\u7ED3\u679C\u3002": "DSH is reloading the plugin. Recheck the result shortly.",
  "DSH \u8981\u6C42\u91CD\u542F\u4EE5\u52A0\u8F7D {value1}\uFF0C\u8BF7\u5148\u4FDD\u5B58\u5DE5\u4F5C\u3002": "DSH requires a restart to load {value1}. Save your work first.",
  "SSH \u4E3B\u673A {value1}": "SSH host {value1}",
  "SSH \u63D2\u4EF6 {value1} \u53EF\u7528\u3002": "SSH plugin {value1} is available.",
  "SSH \u63D2\u4EF6\u7248\u672C\u66F4\u65B0": "SSH plugin updates",
  "SSH \u6587\u4EF6\u4F20\u8F93": "SSH file transfers",
  "SSH \u7AEF\u53E3\u8F6C\u53D1": "SSH port forwarding",
  "SSH \u7EC8\u7AEF\u72B6\u6001": "SSH terminal status",
  "SSH \u8FDE\u63A5": "SSH connections",
  "SSH \u914D\u7F6E\u6587\u4EF6": "SSH configuration",
  "SSH \u914D\u7F6E\u8BFB\u53D6": "Reading SSH configuration",
  "{value1} \u7684 SSH \u522B\u540D": "SSH alias for {value1}",
  "{value1} \u8D85\u8FC7 {value2} \u79D2\uFF0C\u8BF7\u91CD\u8BD5\u3002": "{value1} timed out after {value2} seconds. Please retry.",
  "{value1} \u8D85\u8FC7 {value2} \u79D2\uFF1B\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u3002": "{value1} exceeded {value2} seconds. The result is unknown; refresh to verify.",
  "~/.ssh/config \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5177\u4F53 Host\u3002": "No concrete Host aliases were found in ~/.ssh/config.",
  "\xB7 \u6682\u505C\u4E03\u5929\u540E\u5230\u671F\uFF0C\u672C\u5730\u6682\u5B58\u6E05\u7406\u9700\u6388\u6743\u3002": " \xB7 Expires after seven paused days. Local staging cleanup needs permission.",
  "\xB7 \u6700\u5927": " \xB7 maximum ",
  "\xB7 \u8BCA\u65AD": " \xB7 Diagnostics",
  "\u2460 \u9009\u62E9": "1. Select ",
  "\u2461 \u6838\u5BF9\u6E05\u5355 \u2462 \u786E\u8BA4\u5F00\u59CB": "  2. Review manifest  3. Confirm and start",
  "\u25CF \u672A\u4FDD\u5B58": "\u25CF Unsaved",
  "\u3002\u4EC5\u76D1\u542C\u5BBF\u4E3B 127.0.0.1\uFF0C\u76EE\u6807\u4E5F\u662F\u8BE5 SSH \u4E3B\u673A\u7684 127.0.0.1\uFF1B\u4E0D\u81EA\u52A8\u542F\u52A8\u8FDC\u7AEF\u670D\u52A1\u3002\u5173\u95ED\u9762\u677F\u4E0D\u505C\u6B62\u8F6C\u53D1\uFF1B\u624B\u52A8\u505C\u6B62\u3001\u63D2\u4EF6\u5378\u8F7D\u6216\u9000\u51FA\u65F6\u91CA\u653E\u3002\u65AD\u7EBF\u4E0D\u81EA\u52A8\u91CD\u8FDE\u3002": ". Listens only on the DSH Host loopback address and forwards to the SSH host loopback. It does not start remote services. Closing this panel keeps forwards running; stopping, unloading or quitting releases them. Disconnections do not reconnect automatically.",
  "\u4E0A\u4F20": "Upload",
  "\u4E0A\u4F20\u5230\u8FDC\u7AEF\u76EE\u5F55": "Remote destination folder",
  "\u4E0A\u4F20\u76EE\u6807\u53EA\u80FD\u662F\u4E00\u4E2A\u76EE\u5F55\u3002": "Choose one destination folder for the upload.",
  "\u4E0A\u4F20\u786E\u8BA4\u504F\u79FB\u4E0D\u5339\u914D\u3002": "The acknowledged upload offset does not match.",
  "\u4E0A\u6B21\u5B89\u88C5\u5DF2\u7ED3\u675F\uFF0C\u4F46\u5F53\u524D\u7248\u672C\u6216\u6765\u6E90\u5DF2\u88AB\u66F4\u6539\u3002\u8BF7\u6838\u5BF9\u5F53\u524D\u5B89\u88C5\u540E\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0\u3002": "The previous installation ended, but its version or source changed. Verify the installation before checking again.",
  "\u4E0A\u6B21\u5B89\u88C5\u7ED3\u679C\u672A\u77E5\u3002\u8BF7\u5728\u5B98\u65B9\u63D2\u4EF6\u9875\u6838\u5BF9\u7248\u672C\uFF0C\u6216\u91CD\u65B0\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u88C5\u3002": "The previous installation result is unknown. Verify the version on the official plugin page or recheck here. Installation will not be repeated automatically.",
  "\u4E0A\u6B21\u68C0\u67E5\uFF1A": "Last checked: ",
  "\u4E0B\u65B9\u4E3A\u6700\u65B0\u8FDC\u7AEF\u5185\u5BB9\uFF1B\u4F60\u7684\u8349\u7A3F\u548C\u4FDD\u5B58\u57FA\u7EBF\u5C1A\u672A\u6539\u53D8\u3002": "The latest remote content is shown below. Your draft and save baseline are unchanged.",
  "\u4E0B\u8F7D": "Download",
  "\u4E0B\u8F7D\u5206\u5757\u8D85\u8FC7\u4E0A\u9650\u3002": "The download chunk exceeds the limit.",
  "\u4E0B\u8F7D\u5206\u5757\u8D8A\u754C\u3002": "The download chunk is out of bounds.",
  "\u4E0B\u8F7D\u5206\u5757\u957F\u5EA6\u6216\u6821\u9A8C\u5931\u8D25\u3002": "The download chunk length or checksum does not match.",
  "\u4E0B\u8F7D\u54CD\u5E94\u6CA1\u6709\u6570\u636E\u6D41\u3002": "The download response has no data stream.",
  "\u4E0B\u8F7D\u5C1A\u672A\u5B8C\u6574\uFF0C\u4E0D\u80FD\u53D1\u5E03\u3002": "The download is incomplete and cannot be published.",
  "\u4E0B\u8F7D\u76EE\u5F55\u7ED1\u5B9A\u65E0\u6548\u3002": "The download folder binding is invalid.",
  "\u4E0B\u8F7D\u8FDC\u7AEF\u6587\u4EF6\u6216\u76EE\u5F55": "Remote files or folders to download",
  "\u4E0D\u53EF\u7528": "Unavailable",
  "\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u540D\u6216\u76F8\u5BF9\u8DEF\u5F84\u3002": "Unsupported filename or relative path.",
  "\u4E0E DSH \u7684\u8FDE\u63A5\u4E0D\u53EF\u7528": "The connection to DSH is unavailable",
  "\u4E3B\u673A": "Hosts",
  "\u4E3B\u673A\u64CD\u4F5C": "Host operation",
  "\u4E3B\u76EE\u5F55": "Home",
  "\u4EC5\u89C2\u5BDF\u65B0\u5EFA\u7684\u53D7\u652F\u6301 Bash / Zsh\uFF0C\u5DF2\u6709\u7EC8\u7AEF\u4E0D\u6CE8\u5165\u3002\u547D\u4EE4\u884C\u8FD4\u56DE\u4E0D\u4EE3\u8868\u540E\u53F0\u4EFB\u52A1\u7ED3\u675F\uFF1B\u5D4C\u5957 SSH\u3001tmux \u5185\u90E8\u72B6\u6001\u672A\u77E5\u3002\u4E0D\u81EA\u52A8\u53D1\u9001\u6D88\u606F\u6216\u66F4\u6539 Agent \u76EE\u5F55\u3002": "Observes newly created supported Bash/Zsh terminals only. A returned prompt does not mean background jobs finished. Nested SSH and tmux state is unknown. Nothing is sent automatically and the agent directory is not changed.",
  "\u4ECD\u6709\u6682\u5B58\u9879\uFF0C\u4FDD\u7559\u6E05\u7406\u56DE\u6267\u3002": "Staging items remain; the cleanup receipt was retained.",
  "\u4ECE\u5B98\u65B9\u201C\u6DFB\u52A0\u5DE5\u4F5C\u533A\u201D\u5165\u53E3\u9009\u62E9 SSH \u4E3B\u673A\uFF0C\u518D\u9009\u62E9\u8FDC\u7AEF\u6587\u4EF6\u5939\u3002Desktop \u4E0E Web \u7684\u63D2\u4EF6\u914D\u7F6E\u5206\u522B\u7BA1\u7406\u3002": "Use the official Add workspace action, choose an SSH host, then a remote folder. Desktop and Web manage plugin profiles separately.",
  "\u4EFB\u52A1": "Task ",
  "\u4EFB\u52A1\u6E05\u5355\uFF08": "Task manifest (",
  "\u4EFB\u52A1\u8BE6\u60C5": "Task details",
  "\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u672A\u6253\u5F00\u9884\u89C8\u3002": "The session changed; the preview was not opened.",
  "\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u91CD\u65B0\u6253\u5F00\u3002": "The session changed. Open this action again in the current session.",
  "\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u3002": "The session changed. Please reopen.",
  "\u4F1A\u8BDD\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u62D2\u7EDD\u663E\u793A\u7ED3\u679C\u3002": "The session identity does not match; results were not displayed.",
  "\u4F20\u8F93": "Transferring",
  "\u4F20\u8F93\u4E0E\u6062\u590D\u8BF4\u660E": "Transfer and recovery details",
  "\u4F20\u8F93\u4E2D": "Transferring",
  "\u4F20\u8F93\u4EFB\u52A1": "Transfer tasks",
  "\u4F20\u8F93\u65B9\u5411": "Transfer direction",
  "\u4F20\u8F93\u6E05\u5355\u5206\u9875\u65E0\u6548\u3002": "Invalid transfer manifest pagination.",
  "\u4F20\u8F93\u88AB\u62D2\u7EDD\u3002": "The transfer was rejected.",
  "\u4F20\u8F93\u8FDC\u7AEF\u76F8\u5BF9\u8DEF\u5F84": "Remote relative transfer path",
  "\u4F7F\u7528\u5B98\u65B9\u201C\u5DE5\u4F5C\u533A\u6587\u4EF6\u201D\u548C\u201C\u65B0\u5EFA\u7EC8\u7AEF\u201D\uFF1BSSH \u6807\u8BC6\u6253\u5F00\u5FEB\u901F\u67E5\u627E\u3001\u4F20\u8F93\u3001\u8F6C\u53D1\u53CA\u7EC8\u7AEF\u72B6\u6001\u3002": "Use the official Workspace files and New terminal tools. The SSH badge opens quick open, transfers, forwarding and terminal status.",
  "\u4F7F\u7528\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668": "Use the system folder picker",
  "\u4F9D\u8D56\u9700\u8981\u6784\u5EFA\u786E\u8BA4\uFF08{value1}\uFF09\u3002\u8BF7\u5230\u5B98\u65B9\u63D2\u4EF6\u9875\u6309\u63D0\u793A\u5904\u7406\uFF1B\u672C\u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u6279\u51C6\u811A\u672C\u3002": "Dependencies need build approval ({value1}). Follow the official plugin page prompts; this plugin never approves scripts automatically.",
  "\u4FDD\u5B58": "Save",
  "\u4FDD\u5B58\u4ECD\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u6838\u5BF9\u3002": "Saving is still in progress. Verify shortly.",
  "\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002": "The save result is unconfirmed. Your draft is retained.",
  "\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002{value1}": "The save result is unconfirmed. Your draft is retained. {value1}",
  "\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u5207\u6362\u6587\u4EF6\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002": "Verify the pending save first. Switching files does not undo a save already sent.",
  "\u4FDD\u7559\u8349\u7A3F": "Keep draft",
  "\u4FEE\u6539\u524D": "Before",
  "\u505C\u6B62": "Stop",
  "\u505C\u6B62 / \u65AD\u5F00": "Stop / disconnect",
  "\u505C\u6B62/\u6E05\u7406\u5F85\u786E\u8BA4": "Stop / cleanup unconfirmed",
  "\u505C\u6B62\u6B64\u8BF7\u6C42": "Stop this request",
  "\u505C\u6B62\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1A": "Stop result unconfirmed: ",
  "\u505C\u6B62\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8FDE\uFF0C\u8BF7\u5237\u65B0\u72B6\u6001\u6216\u518D\u6B21\u505C\u6B62\u3002": "Stopping is unconfirmed. No automatic reconnect will occur; refresh the status or stop again.",
  "\u5141\u8BB8\u66FF\u6362\u540C\u540D\u6587\u4EF6\uFF08\u5F00\u59CB\u524D\u6821\u9A8C\u7248\u672C\uFF09": "Allow replacing existing files (version checked before starting)",
  "\u5148\u786E\u8BA4 SSH \u53EF\u7528": "Verify SSH first",
  "\u5173\u95ED": "Close",
  "\u5173\u95ED\u8FDC\u7A0B\u7F16\u8F91\u9875\u7B7E\uFF1F": "Close the remote editor tab?",
  "\u5173\u95ED\u9875\u7B7E": "Close tab",
  "\u5185\u5BB9\u8D85\u8FC7 {value1} KiB\uFF0C\u672A\u53D1\u9001\u4FDD\u5B58\uFF1B\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002": "Content exceeds {value1} KiB. No save was sent; your draft is retained.",
  "\u51ED\u636E\u6216\u6784\u5EFA\u7F13\u5B58\uFF0C\u9ED8\u8BA4\u6392\u9664": "Credentials or build cache, excluded by default",
  "\u5206\u5757\u504F\u79FB\u8D85\u51FA 1 TiB / \u6574\u6570\u8FB9\u754C\u3002": "The chunk offset exceeds the 1 TiB or integer boundary.",
  "\u521B\u5EFA\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1B\u5C06\u4ECE\u5217\u8868\u6838\u5BF9\u3002\u53EF\u505C\u6B62\u6B64\u8BF7\u6C42\uFF0C\u4E0D\u8981\u91CD\u590D\u521B\u5EFA\u3002": "Creation is unconfirmed and will be checked against the list. You can stop this request; do not create a duplicate.",
  "\u521D\u59CB\u5316\u4E2D": "Initializing",
  "\u5237\u65B0": "Refresh",
  "\u5237\u65B0\u4E2D\u2026": "Refreshing\u2026",
  "\u5237\u65B0\u4EFB\u52A1": "Refresh tasks",
  "\u5237\u65B0\u72B6\u6001": "Refresh status",
  "\u5237\u65B0\u76EE\u5F55": "Refresh folder",
  "\u5237\u65B0\u7D22\u5F15": "Refresh index",
  "\u5237\u65B0\u8F6C\u53D1\u72B6\u6001": "Refresh forwards",
  "\u524D\u5F80": "Go",
  "\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5728\u9884\u89C8\u6846\u5185\u624B\u52A8\u9009\u62E9\u590D\u5236\u3002": "Clipboard unavailable. Select and copy from the preview manually.",
  "\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u547D\u4EE4\u3002": "Clipboard unavailable. Copy the command manually.",
  "\u5305\u542B\u5FFD\u7565\u9879": "Include ignored files",
  "\u5355\u6279\u8D85\u8FC7 1 TiB \u6216\u8DEF\u5F84\u6E05\u5355\u8D85\u8FC7 8 MiB\u3002": "The batch exceeds 1 TiB or its path manifest exceeds 8 MiB.",
  "\u5355\u6587\u4EF6 / \u5355\u6279\u6700\u591A 1 TiB\u300110,000 \u9879\uFF0C\u4E24\u4E2A\u6587\u4EF6\u5E76\u53D1\u3002\u5173\u95ED\u9762\u677F\u4E0D\u505C\u6B62\u4F20\u8F93\uFF0C\u91CD\u542F\u540E\u9700\u91CD\u65B0\u6388\u6743\u3002\u9ED8\u8BA4\u6392\u9664\u51ED\u636E\u3001.env\u3001\u5BC6\u94A5\u3001.git \u548C\u7F13\u5B58\uFF0C\u4E0D\u8DDF\u968F\u7B26\u53F7\u94FE\u63A5\u3002\u4E0B\u8F7D\u4FDD\u5B58\u5230\u6388\u6743\u7684\u672C\u673A\u76EE\u5F55\uFF1B\u5176\u4ED6\u7A0B\u5E8F\u7684\u5E76\u53D1\u5199\u5165\u4ECD\u53EF\u80FD\u51B2\u7A81\u3002": "Up to 1 TiB per file/batch and 10,000 entries, with two concurrent files. Closing the panel does not stop transfers; restarting requires new permission. Credentials, .env, keys, .git and caches are excluded by default; symlinks are not followed. Downloads use your authorized local folder. External concurrent writes may still conflict.",
  "\u5355\u6587\u4EF6\u8D85\u8FC7 1 TiB\u3002": "The file exceeds 1 TiB.",
  "\u539F\u59CB\u7EC8\u7AEF\uFF08\u672A\u542F\u7528\u611F\u77E5\uFF09": "Plain terminal (observation unavailable)",
  "\u53D1\u5E03\u5230\u672C\u5730\u6587\u4EF6\u5939": "Publishing to local folder",
  "\u53D1\u5E03\u65B9 SHA-256\uFF1A": "Publisher SHA-256: ",
  "\u53D6\u6D88": "Cancel",
  "\u53D6\u6D88\u5B89\u88C5": "Cancel installation",
  "\u53D6\u6D88\u5E76\u6E05\u7406\u6682\u5B58": "Cancel and clean staging",
  "\u53D6\u6D88\u66F4\u65B0": "Cancel update",
  "\u53D6\u6D88\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u5B89\u88C5\u7ED3\u679C\u3002": "Cancellation is unconfirmed. Recheck the installation result.",
  "\u53EA\u67E5\u8BE2\u672C\u9879\u76EE\u7684 GitHub Release\uFF0C\u4E0D\u4E0A\u4F20\u4F1A\u8BDD\u3001SSH \u914D\u7F6E\u6216\u9879\u76EE\u5185\u5BB9\u3002\u5B89\u88C5\u3001\u4F9D\u8D56\u5BA1\u6279\u548C\u662F\u5426\u9700\u8981\u91CD\u542F\u7531 DSH \u5224\u65AD\u3002": "Only this project\u2019s GitHub Releases are queried. No sessions, SSH configuration or project content are uploaded. DSH handles installation, dependency approval and restart requirements.",
  "\u5408\u6210\u65F6\u6682\u5B58\u6570\u636E\u53D1\u751F\u53D8\u5316\u3002": "Staging data changed during assembly.",
  "\u547D\u4EE4\u6587\u672C\u672A\u77E5": "Command text unknown",
  "\u547D\u4EE4\u6587\u672C\u672A\u77E5\uFF08\u5386\u53F2\u914D\u7F6E\u672A\u63D0\u4F9B\uFF09": "Command text unavailable from shell history",
  "\u547D\u4EE4\u8FD0\u884C\u4E2D": "Command running",
  "\u56DE\u6EDA\u672C\u6B21\u8FC1\u79FB": "Roll back this migration",
  "\u5728 DSH \u6240\u5728\u673A\u5668\u914D\u7F6E SSH Host \u522B\u540D\uFF0C\u8FDC\u7AEF\u9700\u8981 Python 3.8+\u3002\u5C06\u547D\u4EE4\u4E2D\u7684 devbox \u6362\u6210\u4F60\u7684\u522B\u540D\u3002": "Configure an SSH Host alias on the machine running DSH. The remote needs Python 3.8+. Replace devbox with your alias.",
  "\u5728\u5E94\u7528\u5185\u6D4F\u89C8 Host \u6587\u4EF6\u7CFB\u7EDF\uFF08\u542B /mnt \u4E0B\u7684 Windows \u76D8\uFF09": "Browse the DSH Host filesystem, including Windows drives under /mnt",
  "\u5904\u7406\u4E2D\u2026": "Working\u2026",
  "\u590D\u5236\u547D\u4EE4": "Copy command",
  "\u590D\u5236\u5730\u5740": "Copy address",
  "\u590D\u5236\u7247\u6BB5": "Copy excerpt",
  "\u5B89\u88C5\u4E0E\u8FDE\u63A5\u6392\u9519": "Installation and connection troubleshooting",
  "\u5B89\u88C5\u5305\u5DF2\u5C31\u7EEA\uFF0CDSH \u6B63\u5728\u5E94\u7528\u66F4\u65B0\u2026": "The package is ready. DSH is applying the update\u2026",
  "\u5B89\u88C5\u53EF\u80FD\u5DF2\u8FDB\u5165\u5E94\u7528\u9636\u6BB5\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u7ED3\u679C\u3002": "Installation may already be applying. Recheck the result.",
  "\u5B89\u88C5\u54CD\u5E94\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u7ED3\u679C\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u88C5\u3002": "The installation response is unconfirmed. Recheck the result; it will not reinstall automatically.",
  "\u5B89\u88C5\u5DF2\u8FD4\u56DE\uFF0C\u7248\u672C\u6216\u6FC0\u6D3B\u72B6\u6001\u4ECD\u5F85\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u3002": "Installation returned, but its version or activation is unconfirmed. Recheck the result.",
  "\u5B89\u88C5\u6216\u6FC0\u6D3B\u672A\u5B8C\u6210\uFF0C\u8BF7\u5728\u5B98\u65B9\u63D2\u4EF6\u9875\u67E5\u770B\u8BCA\u65AD\u3002": "Installation or activation did not complete. See diagnostics on the official plugin page.",
  "\u5B89\u88C5\u6765\u6E90\u4E0E\u66F4\u65B0\u8BF4\u660E": "Installation source and update details",
  "\u5B89\u88C5\u6765\u6E90\u6216\u7248\u672C\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0\u3002": "The installation source or version changed. Check for updates again.",
  "\u5B8C\u6210": "Complete",
  "\u5C1A\u672A\u4FDD\u5B58\u3002": "Not saved yet.",
  "\u5C1A\u672A\u63E1\u624B": "Handshake pending",
  "\u5C1A\u672A\u83B7\u5F97\u8BE5\u4E3B\u673A\u7684\u8FDE\u63A5\u72B6\u6001": "No connection status is available for this host yet",
  "\u5DE5\u4F5C\u533A\u5185\u7684\u6587\u4EF6\u8DEF\u5F84\uFF08\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\uFF09": "File path within the workspace (full paths accepted)",
  "\u5DE5\u4F5C\u533A\u5185\u76EE\u5F55\uFF0C\u7559\u7A7A\u4E3A\u6839\u76EE\u5F55": "Workspace folder; leave blank for the root",
  "\u5DE5\u4F5C\u533A\u521B\u5EFA": "Creating workspace",
  "\u5DE5\u4F5C\u533A\u547D\u540D": "Naming workspace",
  "\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55": "Workspace root",
  "\u5DE5\u5177\u5C1A\u672A\u52A0\u8F7D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002": "The tool has not loaded. Please try again shortly.",
  "\u5DE5\u5177\u6B63\u5728\u52A0\u8F7D\u2026": "Loading tool\u2026",
  "\u5DF2\u4FDD\u5B58\u3002": "Saved.",
  "\u5DF2\u4FDD\u7559\u8349\u7A3F\uFF0C\u8BF7\u5728\u7F16\u8F91\u5668\u5185\u786E\u8BA4\u662F\u5426\u5173\u95ED\u3002": "Your draft is retained. Confirm closing in the editor.",
  "\u5DF2\u505C\u6B62": "Stopped",
  "\u5DF2\u5230\u671F": "Expired",
  "\u5DF2\u53D6\u6D88": "Cancelled",
  "\u5DF2\u53D6\u6D88\u5E76\u6E05\u7406\u5DF2\u6388\u6743\u7684\u672A\u5B8C\u6210\u6682\u5B58\uFF0C\u5DF2\u5B8C\u6210\u6587\u4EF6\u4FDD\u7559\u3002": "Cancelled and cleaned authorized incomplete staging. Completed files were retained.",
  "\u5DF2\u590D\u5236 DSH \u5BBF\u4E3B\u7684\u56DE\u73AF\u5730\u5740\u3002": "Copied the DSH Host loopback address.",
  "\u5DF2\u590D\u5236\u68C0\u67E5\u547D\u4EE4\u3002": "Check command copied.",
  "\u5DF2\u590D\u5236\uFF0C\u672A\u53D1\u9001\u3002": "Copied, not sent.",
  "\u5DF2\u5B89\u88C5 {value1}\uFF1B\u5F53\u524D\u4ECD\u8FD0\u884C {value2}\uFF0C\u8BF7\u4FDD\u5B58\u5DE5\u4F5C\u540E\u91CD\u542F DSH\u3002": "Installed {value1}; still running {value2}. Save your work and restart DSH.",
  "\u5DF2\u5B8C\u6210": "Complete",
  "\u5DF2\u63D2\u5165\u539F\u4F1A\u8BDD\u8349\u7A3F\uFF0C\u672A\u53D1\u9001\u3002": "Inserted into the original session draft, not sent.",
  "\u5DF2\u662F\u6700\u65B0\u7A33\u5B9A\u7248": "Running the latest stable version",
  "\u5DF2\u6682\u505C": "Paused",
  "\u5DF2\u66F4\u65B0\u5230 {value1}\u3002": "Updated to {value1}.",
  "\u5DF2\u6709\u516B\u4E2A\u4F1A\u8BDD\u4F20\u8F93\u6A21\u578B\uFF0C\u8BF7\u5148\u505C\u6B62\u5176\u4E2D\u4E00\u4E2A\u3002": "Eight sessions already have active transfers. Stop one first.",
  "\u5DF2\u8FBE\u5230 32 \u4E2A\u4F1A\u8BDD\u7F16\u8F91\u7F13\u51B2\u4E0A\u9650\uFF1B\u8BF7\u5148\u4FDD\u5B58\u8349\u7A3F\u540E\u91CD\u542F\u3002": "The limit of 32 session editor buffers was reached. Save drafts before restarting.",
  "\u5DF2\u8FD4\u56DE\u547D\u4EE4\u884C": "Prompt ready",
  "\u5DF2\u8FDE\u63A5": "Connected",
  "\u5DF2\u8FDE\u63A5\uFF08\u80FD\u529B\u53D7\u9650\uFF09": "Connected (limited)",
  "\u5DF2\u914D\u7F6E\u5BC6\u94A5\u8DEF\u5F84": "Key path configured",
  "\u5DF2\u9A8C\u6536 DSH\uFF1A": "Tested DSH: ",
  "\u5DF2\u9A8C\u8BC1\uFF1A": "Verified: ",
  "\u5EFA\u7ACB\u4E0A\u4F20\u8BA1\u5212": "Review upload plan",
  "\u5EFA\u7ACB\u8F6C\u53D1": "Create forward",
  "\u5F00\u59CB\u4F7F\u7528": "Getting started",
  "\u5F00\u59CB\u5F00\u53D1": "Start developing",
  "\u5F53\u524D\u4F1A\u8BDD\u5C1A\u65E0\u7EC8\u7AEF\u3002\u8BF7\u4F7F\u7528\u4FA7\u8FB9\u680F\u7684\u201C\u65B0\u5EFA\u7EC8\u7AEF\u201D\u3002": "No terminals in this session. Use New terminal in the official sidebar.",
  "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u53EF\u7528\u7684 SSH \u5DE5\u4F5C\u533A\u3002": "This session has no available SSH workspace.",
  "\u5F53\u524D\u4F1A\u8BDD\u7EC8\u7AEF": "Session terminal",
  "\u5F53\u524D\u4F7F\u7528\u6E90\u7801\u94FE\u63A5\uFF0C\u8BF7\u4F7F\u7528 Git \u540C\u6B65\u3002\u6B64\u5904\u4E0D\u4F1A\u7528\u5B89\u88C5\u5305\u8986\u76D6\u4F60\u7684\u5F00\u53D1\u76EE\u5F55\u3002": "This is a source-linked installation. Update with Git; packages will not overwrite your development directory.",
  "\u5F53\u524D\u641C\u7D22\u6CA1\u6709\u5339\u914D\u9879\u3002": "No matching files.",
  "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u76EE\u5F55\u6388\u6743\u3002\u53EF\u4EE5\u4E0A\u4F20\u6587\u4EF6\uFF1B\u76EE\u5F55\u4E0A\u4F20\u548C\u4E0B\u8F7D\u8BF7\u4F7F\u7528\u652F\u6301 File System Access \u7684 Desktop / Chromium \u5B89\u5168\u9875\u9762\u3002": "This browser cannot authorize folders. File uploads are available; folder uploads and downloads require Desktop or Chromium with File System Access in a secure context.",
  "\u5F53\u524D\u76EE\u5F55\u672A\u77E5": "Current directory unknown",
  "\u5FEB\u901F\u6253\u5F00": "Quick open",
  "\u603B\u8FDB\u5EA6 \xB7": "Total progress \xB7 ",
  "\u6062\u590D\u6216\u56DE\u6EDA\u5DF2\u6709\u8FC1\u79FB": "Recover or roll back a migration",
  "\u6211\u786E\u8BA4\u6D4F\u89C8\u5668\u5C31\u5728 DSH \u5BBF\u4E3B {value1} \u4E0A\uFF08\u4EC5\u542F\u7528\u6253\u5F00\u7F51\u9875\uFF0C\u4E0D\u6539\u53D8\u76D1\u542C\u8303\u56F4\uFF09": "My browser runs on DSH Host {value1} (enables opening pages only; listener scope stays unchanged)",
  "\u6240\u9009\u4EFB\u52A1\u5DF2\u4F20\u8F93\u5E76\u5B8C\u6210 SHA-256 \u6821\u9A8C\u3002": "The selected task completed transfer and SHA-256 verification.",
  "\u624B\u52A8\u4FDD\u5B58\uFF1B\u8349\u7A3F\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u4E2D\u4FDD\u7559\u3002": "Save manually. Drafts last only for this app run.",
  "\u6253\u5F00": "Open",
  "\u6253\u5F00\u534F\u8BAE": "URL protocol",
  "\u6253\u5F00\u6B64\u6587\u4EF6\u5939": "Open this folder",
  "\u6253\u5F00\u7F51\u9875": "Open page",
  "\u6253\u5F00\u8F6C\u53D1\u7F51\u9875 {value1}": "Open forwarded page {value1}",
  "\u62D6\u62FD\u6587\u4EF6\u6216\u76EE\u5F55\u5230\u8FD9\u91CC\uFF0C\u6216\u9009\u62E9\uFF1A": "Drop files or folders here, or choose:",
  "\u62DF\u63D2\u5165\u7247\u6BB5\uFF08\u53EF\u5220\u9664\u4E0D\u9700\u8981\u7684\u5185\u5BB9\uFF1B\u5148\u68C0\u67E5\u5176\u4E2D\u662F\u5426\u542B\u5BC6\u94A5\u7B49\u654F\u611F\u4FE1\u606F\uFF09": "Excerpt to insert (remove unwanted content and check for secrets first)",
  "\u6309\u8DEF\u5F84\u9884\u89C8": "Preview path",
  "\u6388\u6743\u76EE\u5F55\u5E76\u5F00\u59CB / \u7EE7\u7EED": "Authorize folder and start / resume",
  "\u6392\u9664": "Excluded",
  "\u6392\u9664\u9879": "Excluded entry",
  "\u63D2\u5165\u539F\u4F1A\u8BDD\u8349\u7A3F": "Insert into original draft",
  "\u641C\u7D22\u5E2E\u52A9": "Search help",
  "\u641C\u7D22\u8FDC\u7A0B\u6587\u4EF6": "Search remote files",
  "\u6536\u8D77": "Collapse",
  "\u653E\u5F03\u5E76\u6253\u5F00": "Discard and open",
  "\u653E\u5F03\u5F53\u524D\u8349\u7A3F\uFF1F": "Discard the current draft?",
  "\u6587\u4EF6\u4F1A\u8BDD\u8EAB\u4EFD\u4E0D\u5339\u914D\uFF0C\u672A\u6253\u5F00\u3002": "The file session does not match. Nothing was opened.",
  "\u6587\u4EF6\u4F20\u8F93": "File transfers",
  "\u6587\u4EF6\u540D\u6216\u5B8C\u6574\u8DEF\u5F84": "Filename or full path",
  "\u6587\u4EF6\u5939\u8DEF\u5F84": "Folder path",
  "\u6587\u4EF6\u8EAB\u4EFD\u5DF2\u6539\u53D8\uFF0C\u672A\u91C7\u7528\u8BE5\u5185\u5BB9\u3002": "File identity changed. The content was not adopted.",
  "\u65AD\u5F00\u4F1A\u7ED3\u675F\u6B64\u8FDE\u63A5\u7BA1\u7406\u7684\u7EC8\u7AEF\u548C\u8F6C\u53D1\uFF0C\u5E76\u4E2D\u65AD\u4F20\u8F93\u3002": "Disconnecting ends this connection\u2019s terminals and forwards, and interrupts transfers.",
  "\u65B0\u5EFA": "Create ",
  "\u65B0\u5EFA\u6587\u4EF6\u5939\u540D\u79F0": "New folder name",
  "\u65B0\u5EFA\u8F6C\u53D1": "New forward",
  "\u65B9\u5411\u952E\u9009\u62E9\uFF0CEnter \u9884\u89C8\uFF0CEscape \u53D6\u6D88\u9009\u62E9\u3002\u9ED8\u8BA4\u53EA\u8BFB\uFF1B\u7F16\u8F91\u4FDD\u7559\u8349\u7A3F\u4FDD\u62A4\u3002\u5305\u542B\u5FFD\u7565\u9879\u4EC5\u5F71\u54CD\u672C\u6B21\u641C\u7D22\uFF0C\u4E0D\u6539\u53D8 @ \u8865\u5168\u3002": "Use arrow keys to select, Enter to preview and Escape to clear selection. Preview is read-only; editing protects drafts. Including ignored files affects this search only, not @ completion.",
  "\u65E0\u6548\u8F6C\u53D1\u5730\u5740\u3002": "Invalid forwarded address.",
  "\u65E0\u6CD5\u8BBF\u95EE\u62D6\u62FD\u9879\u76EE\uFF0C\u8BF7\u7528\u9009\u62E9\u6587\u4EF6/\u76EE\u5F55\u3002": "Cannot access the dropped item. Use the file or folder picker.",
  "\u65E0\u6CD5\u8BFB\u53D6\u63D2\u4EF6\u7248\u672C\uFF1A{value1}": "Cannot read the plugin version: {value1}",
  "\u65E0\u6CD5\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001\uFF1A{value1}": "Cannot read connection status: {value1}",
  "\u65E7 SFTP \u540E\u7AEF\u5DF2\u79FB\u9664\u3002\u786E\u8BA4\u6539\u52A8\u540E\u8FC1\u5165 OpenSSH\uFF0C\u4FDD\u7559\u73B0\u6709\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\u3002": "The legacy SFTP backend was removed. Review and migrate to OpenSSH while preserving workspaces and sessions.",
  "\u6682\u4E0D\u66F4\u65B0": "Not now",
  "\u6682\u505C": "Pause",
  "\u6682\u5B58\u53CA\u4EFB\u52A1\u8BB0\u5F55\u5DF2\u6E05\u7406\uFF0C\u5DF2\u5B8C\u6210\u6587\u4EF6\u4FDD\u7559\u3002": "Staging and task records were cleaned. Completed files were retained.",
  "\u6682\u5B58\u6587\u4EF6\u5939\u542B\u672A\u77E5\u9879\uFF0C\u672A\u5220\u9664\u3002": "The staging folder contains unknown items and was not deleted.",
  "\u6682\u5B58\u6E05\u5355\u8EAB\u4EFD\u9519\u8BEF\uFF0C\u672A\u5220\u9664\u3002": "The staging manifest identity is invalid. Nothing was deleted.",
  "\u6682\u5B58\u76EE\u5F55\u4E0D\u5C5E\u4E8E\u6B64\u4EFB\u52A1\uFF0C\u672A\u8BFB\u53D6\u6216\u5220\u9664\u3002": "The staging directory does not belong to this task. Nothing was read or deleted.",
  "\u6682\u5B58\u76EE\u5F55\u542B\u672A\u77E5\u9879\uFF0C\u672A\u5220\u9664\u3002": "The staging directory contains unknown items and was not deleted.",
  "\u6682\u65E0": "None",
  "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u66F4\u65B0\u7ED3\u679C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u786E\u8BA4\u3002": "The update result cannot be confirmed yet. Recheck shortly.",
  "\u6682\u672A\u53D1\u73B0\u5339\u914D\u9879\uFF1B\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u76F4\u63A5\u9884\u89C8\u3002": "No matches found yet. Enter a full path to preview directly.",
  "\u66F4\u65B0 dsh-ssh-remote \u81F3 {value1}": "Update dsh-ssh-remote to {value1}",
  "\u66F4\u65B0\u4F1A\u91CD\u8F7D SSH \u63D2\u4EF6\uFF0C\u53EF\u80FD\u7ED3\u675F\u8FDC\u7A0B\u7EC8\u7AEF\u3001\u7AEF\u53E3\u8F6C\u53D1\u6216\u4E2D\u65AD\u4F20\u8F93\u3002\u8BF7\u5148\u4FDD\u5B58\u7F16\u8F91\u8349\u7A3F\u5E76\u6682\u505C\u4F20\u8F93\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u542F DSH\u3002": "Updating reloads the SSH plugin and may end remote terminals, port forwards or interrupt transfers. Save drafts and pause transfers first. DSH will not restart automatically.",
  "\u66F4\u65B0\u8BF4\u660E": "Release notes",
  "\u6700\u65B0\u7A33\u5B9A\u7248 {value1}": "Latest stable: {value1}",
  "\u6700\u65B0\u8FDC\u7AEF\u5185\u5BB9\uFF08\u53EA\u8BFB\uFF1B\u4E0A\u65B9\u4ECD\u662F\u4F60\u7684\u8349\u7A3F\uFF09": "Latest remote content (read-only; your draft remains above)",
  "\u6709\u53EF\u7528\u66F4\u65B0": "Update available",
  "\u672A\u5B8C\u6210\uFF1A": "Incomplete: ",
  "\u672A\u77E5": "Unknown",
  "\u672A\u786E\u8BA4\u7ED3\u675F\u7684\u547D\u4EE4": "Command completion unconfirmed",
  "\u672A\u8FDE\u63A5": "Disconnected",
  "\u672C\u5730\u540D\u79F0\u51B2\u7A81\uFF1A{value1} / {value2}": "Local name conflict: {value1} / {value2}",
  "\u672C\u5730\u6587\u4EF6": "local files",
  "\u672C\u5730\u6682\u5B58\u5185\u5BB9\u6821\u9A8C\u5931\u8D25\uFF0C\u62D2\u7EDD\u62FC\u63A5\u3002": "Local staging verification failed. Resume was refused.",
  "\u672C\u5730\u6682\u5B58\u5757\u5927\u5C0F\u9519\u8BEF\u3002": "Local staging chunk size is invalid.",
  "\u672C\u5730\u6E90\u5DF2\u9009\u62E9\uFF1B\u8BF7\u6838\u5BF9\u6E05\u5355\uFF0C\u7136\u540E\u5EFA\u7ACB\u8BA1\u5212\u6216\u7EE7\u7EED\u539F\u4EFB\u52A1\u3002": "Local sources selected. Review the manifest, then plan a transfer or resume the original task.",
  "\u672C\u5730\u76EE\u6807\u5DF2\u5B58\u5728\uFF0C\u8BF7\u660E\u786E\u52FE\u9009\u8986\u76D6\u3002": "The local destination exists. Explicitly allow replacement.",
  "\u672C\u5730\u76EE\u6807\u5DF2\u6539\u53D8\uFF0C\u4FDD\u7559\u6682\u5B58\u4E14\u4E0D\u8986\u76D6\u3002": "The local destination changed. Staging was kept and the file was not overwritten.",
  "\u672C\u5730\u76EE\u6807\u76EE\u5F55\u8D85\u8FC7\u5B89\u5168\u679A\u4E3E\u9884\u7B97\u3002": "The local destination exceeds the directory scan budget.",
  "\u672C\u5730\u7EED\u4F20\u6E05\u5355\u8EAB\u4EFD\u6216\u504F\u79FB\u4E0D\u5339\u914D\u3002": "Local resume manifest identity or offset mismatch.",
  "\u672C\u5730\u7EED\u4F20\u6E05\u5355\u8FC7\u5927\u3002": "The local resume manifest is too large.",
  "\u672C\u5730\u9009\u62E9\uFF1A": "Local selection: ",
  "\u672C\u5DE5\u4F5C\u533A\u7684\u7AEF\u53E3\u8F6C\u53D1": "Workspace port forwards",
  "\u672C\u673A": "Local",
  "\u672C\u673A\u6307 DSH \u5BBF\u4E3B": "Local means DSH Host ",
  "\u672C\u673A\u6587\u4EF6": "Local files",
  "\u672C\u673A\u6587\u4EF6\u5939\u521B\u5EFA": "Creating local folder",
  "\u672C\u673A\u6D4F\u89C8": "Local browsing",
  "\u672C\u673A\u6D4F\u89C8\u63A2\u6D4B\u5931\u8D25\uFF1A{value1}": "Local browsing check failed: {value1}",
  "\u672C\u673A\u76D1\u542C\u5DF2\u5EFA\u7ACB": "Local listener ready",
  "\u672C\u673A\u78C1\u76D8\u63A2\u6D4B": "Local drive discovery",
  "\u672C\u673A\u7AEF\u53E3": "Local port",
  "\u672C\u6B21\u6240\u9009\u9879\u5DF2\u5904\u7406\uFF1B\u5176\u4ED6\u672A\u5B8C\u6210\u9879\u4FDD\u7559\u3002": "The selected items were processed. Other unfinished items were retained.",
  "\u6765\u6E90\uFF1A": "Source: ",
  "\u67E5\u770B SSH \u7EC8\u7AEF\u72B6\u6001": "View SSH terminal status",
  "\u67E5\u770B\u66F4\u65B0": "View update",
  "\u67E5\u770B\u6E05\u5355": "View manifest",
  "\u67E5\u770B\u8FDC\u7AEF\u7248\u672C": "Compare remote version",
  "\u6821\u9A8C\u4E0A\u4F20\u6E90": "Verifying upload source",
  "\u6821\u9A8C\u7EED\u4F20\u524D\u7F00": "Verifying resume prefix",
  "\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C": "Verify save result",
  "\u6838\u5BF9\u5199\u5165\u5DEE\u5F02\uFF08\u4EC5\u914D\u7F6E\uFF0C\u4E0D\u8BFB\u53D6\u79C1\u94A5\uFF09": "Review changes (configuration only; private keys are not read)",
  "\u6838\u5BF9\u5931\u8D25\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002{value1}": "Verification failed. Your draft is retained. {value1}",
  "\u6838\u5BF9\u5E76\u56DE\u6EDA": "Verify and roll back",
  "\u68C0\u67E5\u65E7\u914D\u7F6E": "Inspect legacy configuration",
  "\u68C0\u67E5\u66F4\u65B0": "Check for updates",
  "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF1A{value1}": "Update check failed: {value1}",
  "\u68C0\u67E5\u8FDC\u7AEF\u7AEF\u53E3": "Check remote port",
  "\u68C0\u6D4B Windows \u76D8\u2026": "Detecting Windows drives\u2026",
  "\u6B63\u5728\u4FDD\u5B58\u2026": "Saving\u2026",
  "\u6B63\u5728\u505C\u6B62": "Stopping",
  "\u6B63\u5728\u505C\u6B62\u2026": "Stopping\u2026",
  "\u6B63\u5728\u5B89\u88C5": "Installing",
  "\u6B63\u5728\u5EFA\u7ACB\u6216\u7B49\u5F85\u786E\u8BA4\u3002": " is being created or awaits confirmation.",
  "\u6B63\u5728\u6253\u5F00\u8FDC\u7A0B\u5DE5\u4F5C\u53F0\u2026": "Opening remote workbench\u2026",
  "\u6B63\u5728\u641C\u7D22\u8FDC\u7A0B\u6587\u4EF6\u2026": "Searching remote files\u2026",
  "\u6B63\u5728\u66F4\u65B0\uFF0C\u4EE5\u4E0B\u4E3A\u65E7\u7ED3\u679C\uFF08\u53EF\u80FD\u8FC7\u671F\uFF09\u2026": "Updating; previous results below may be stale\u2026",
  "\u6B63\u5728\u6838\u5BF9\u4FDD\u5B58\u56DE\u6267\u4E0E\u8FDC\u7AEF\u5185\u5BB9\u2026": "Verifying the save receipt and remote content\u2026",
  "\u6B63\u5728\u6838\u5BF9\u5B89\u88C5\u6765\u6E90\u2026": "Checking installation source\u2026",
  "\u6B63\u5728\u68C0\u67E5\u2026": "Checking\u2026",
  "\u6B63\u5728\u68C0\u67E5\u672C\u673A\u76EE\u5F55\u6D4F\u89C8\u2026": "Checking local folder browsing\u2026",
  "\u6B63\u5728\u6DFB\u52A0\u2026": "Adding\u2026",
  "\u6B63\u5728\u786E\u8BA4\u4E0A\u6B21\u66F4\u65B0\u7ED3\u679C\u2026": "Checking the previous update result\u2026",
  "\u6B63\u5728\u8BFB\u53D6 SSH \u4E3B\u673A\u2026": "Reading SSH hosts\u2026",
  "\u6B63\u5728\u8BFB\u53D6\u2026": "Loading\u2026",
  "\u6B63\u5728\u8BFB\u53D6\u5B8C\u6574\u6587\u4EF6\u2026": "Reading the complete file\u2026",
  "\u6B63\u5728\u8BFB\u53D6\u5DE5\u4F5C\u533A\u2026": "Reading workspace\u2026",
  "\u6B63\u5728\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001": "Reading connection status",
  "\u6B63\u5728\u8FDE\u63A5": "Connecting",
  "\u6B63\u5728\u901A\u8FC7 DSH \u5B89\u88C5 {value1}\u2026": "Installing {value1} through DSH\u2026",
  "\u6B63\u5728\u91CD\u8FDE": "Reconnecting",
  "\u6B64\u4F1A\u8BDD\u5DF2\u6709\u6267\u884C\u4EFB\u52A1\uFF0C\u8BF7\u5148\u6682\u505C\u3002": "This session already has an active task. Pause it first.",
  "\u6B64\u5B89\u88C5\u6765\u6E90\u4E0D\u652F\u6301\u76F4\u63A5\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u5B98\u65B9\u63D2\u4EF6\u9875\u3002": "This installation source cannot update directly. Use the official plugin page.",
  "\u6B64\u5B89\u88C5\u6765\u6E90\u4E0D\u652F\u6301\u76F4\u63A5\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u5B98\u65B9\u63D2\u4EF6\u9875\u5B89\u88C5\u56FA\u5B9A\u7248\u672C\u3002": "This source cannot update directly. Install a pinned release through the official plugin page.",
  "\u6B64\u5DE5\u4F5C\u533A\u5C1A\u672A\u5EFA\u7ACB\u8F6C\u53D1\u3002": "No forwards in this workspace yet.",
  "\u6B64\u6D4F\u89C8\u5668\u7F3A\u5C11\u76EE\u5F55\u8BFB\u5199\u6388\u6743\u80FD\u529B\uFF1B\u8BF7\u4F7F\u7528\u652F\u6301 File System Access \u7684 Desktop/Chromium\uFF0C\u4E0D\u4F1A\u6539\u5B58\u5230 DSH \u5BBF\u4E3B\u3002": "This browser cannot authorize directory access. Use Desktop or Chromium with File System Access; files will not be redirected to the DSH Host.",
  "\u6B64\u76EE\u5F55\u6CA1\u6709\u539F\u6765\u7684\u4E0B\u8F7D\u68C0\u67E5\u70B9\uFF0C\u8BF7\u9009\u62E9\u539F\u6388\u6743\u76EE\u5F55\u3002": "This folder has no original download checkpoint. Choose the original authorized folder.",
  "\u6B64\u76EE\u5F55\u6CA1\u6709\u539F\u6765\u7684\u4E0B\u8F7D\u68C0\u67E5\u70B9\uFF1B\u8BF7\u9009\u62E9\u539F\u6388\u6743\u76EE\u5F55\uFF0C\u4E0D\u80FD\u62FC\u63A5\u5230\u65B0\u76EE\u5F55\u3002": "This folder has no original download checkpoint. Resume requires the original authorized folder, not a new one.",
  "\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002": "This folder has no subfolders.",
  "\u6B64\u8DEF\u5F84\u65E0\u6CD5\u5B89\u5168\u8868\u793A\u4E3A DSH \u5F15\u7528\u6216\u9884\u89C8\u5730\u5740\uFF0C\u8BF7\u4F7F\u7528\u8FDC\u7A0B\u7EC8\u7AEF\uFF1B\u4E0D\u6539\u5199\u6587\u4EF6\u540D\u3002": "This path cannot be represented safely as a DSH reference or preview address. Use the remote terminal; the filename will not be rewritten.",
  "\u6BCF\u6279\u6700\u591A 10,000 \u4E2A\u6587\u4EF6/\u76EE\u5F55\u9879\u3002": "Each batch supports at most 10,000 file/folder entries.",
  "\u6BCF\u884C\u4E00\u4E2A\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u7559\u7A7A\u4E3A\u5DE5\u4F5C\u533A": "One relative path per line; leave blank for the workspace",
  "\u6CA1\u6709\u539F\u4EFB\u52A1\u6682\u5B58\u6807\u8BB0\uFF0C\u4E0D\u80FD\u786E\u8BA4\u5DF2\u6E05\u7406\uFF1B\u8BF7\u91CD\u65B0\u9009\u62E9\u539F\u76EE\u5F55\u3002": "The original staging marker is missing. Cleanup cannot be confirmed; choose the original folder.",
  "\u6CA1\u6709\u53D1\u73B0\u5177\u4F53 SSH Host alias\u3002": "No concrete SSH Host aliases were found.",
  "\u6DFB\u52A0\u5DE5\u4F5C\u533A": "Add workspace",
  "\u6DFB\u52A0\u8FDC\u7A0B\u5DE5\u4F5C\u533A": "Add a remote workspace",
  "\u6E05\u5355\u4E0A\u4E00\u9875": "Previous manifest page",
  "\u6E05\u5355\u4E0B\u4E00\u9875": "Next manifest page",
  "\u6E05\u5355\u542B\u5927\u5C0F\u5199\u6216 Unicode \u51B2\u7A81\uFF0C\u672A\u9759\u9ED8\u6539\u540D\u3002": "The manifest has case or Unicode name conflicts. No files were silently renamed.",
  "\u6E05\u5355\u672A\u5B8C\u6210": "Manifest incomplete",
  "\u6E05\u5355\u7684\u7236\u76EE\u5F55\u5B58\u5728\u5927\u5C0F\u5199\u6216 Unicode \u51B2\u7A81\u3002": "Parent folders have case or Unicode name conflicts.",
  "\u6E05\u7406\u6682\u5B58\u53CA\u4EFB\u52A1\u8BB0\u5F55": "Clean staging and task record",
  "\u6E90\u6587\u4EF6\u5185\u5BB9\u5DF2\u6539\u53D8\uFF0C\u62D2\u7EDD\u7EED\u4F20\uFF1A": "Source content changed; resume refused: ",
  "\u6E90\u6587\u4EF6\u5206\u5757\u957F\u5EA6\u53D1\u751F\u53D8\u5316\u3002": "The source chunk length changed.",
  "\u6E90\u6587\u4EF6\u5927\u5C0F\u5DF2\u6539\u53D8\uFF1A": "Source size changed: ",
  "\u6E90\u7801\u94FE\u63A5\u4E0D\u81EA\u52A8\u66FF\u6362\uFF1B\u672C\u6B21\u6253\u5F00\u7684\u5E94\u7528\u4E0E\u5176\u4ED6 Web/Desktop profile \u5206\u522B\u7BA1\u7406\u3002": "Source links are not automatically replaced. This app and other Web/Desktop profiles are managed separately.",
  "\u6E90\u7801\u94FE\u63A5\u5B89\u88C5\u8BF7\u4F7F\u7528 Git \u540C\u6B65\uFF0C\u4E0D\u4F1A\u88AB\u5B89\u88C5\u5305\u8986\u76D6\u3002": "Update source-linked installations with Git. Packages will not overwrite them.",
  "\u7248\u672C\u66F4\u65B0": "Updates",
  "\u72B6\u6001\u5237\u65B0\u8D85\u65F6\uFF1B\u663E\u793A\u7684\u662F\u4E0A\u6B21\u72B6\u6001\uFF0C\u4E0D\u80FD\u636E\u6B64\u5224\u65AD\u8F6C\u53D1\u4ECD\u5728\u8FD0\u884C\u3002": "Status refresh timed out. The last known status is shown and does not prove the forward is still running.",
  "\u72B6\u6001\u611F\u77E5\u8BF4\u660E": "About terminal observation",
  "\u72B6\u6001\u672A\u77E5": "Status unknown",
  "\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF0C\u65E7\u7ED3\u679C\u5DF2\u6807\u8BB0\u8FC7\u671F\uFF1A": "Status read failed; previous results are marked stale: ",
  "\u7528\u5F53\u524D\u9009\u62E9\u5F00\u59CB / \u7EE7\u7EED": "Start / resume with selected files",
  "\u7528\u6237\u6682\u505C": "Paused by user",
  "\u76EE\u5F55": "Folder",
  "\u76EE\u5F55\u4E0D\u662F\u6587\u4EF6": "This entry is a folder, not a file",
  "\u76EE\u5F55\u5217\u8868\u5DF2\u622A\u65AD\uFF08\u6700\u591A 1000 \u9879\uFF09\uFF1B\u672A\u663E\u793A\u7684\u6587\u4EF6\u5939\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u524D\u5F80\u3002": "The folder list is truncated (maximum 1,000 entries). Enter a full path to reach unlisted folders.",
  "\u76EE\u5F55\u8D85\u8FC7 10,000 \u9879\u3002": "The directory exceeds 10,000 entries.",
  "\u76EE\u6807\u4E0D\u518D\u662F\u66F4\u65B0\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002": "The target is no longer a newer version. Check again.",
  "\u76EE\u6807\u521A\u88AB\u5176\u4ED6\u7A0B\u5E8F\u521B\u5EFA\uFF0C\u672A\u8986\u76D6\u3002": "Another program just created the destination. It was not overwritten.",
  "\u786E\u8BA4\u3001\u5907\u4EFD\u5E76\u8FC1\u79FB": "Confirm, back up and migrate",
  "\u786E\u8BA4\u66F4\u65B0": "Confirm update",
  "\u786E\u8BA4\u6D4F\u89C8\u5668\u4F4D\u4E8E DSH \u5BBF\u4E3B\u540E\u624D\u53EF\u6253\u5F00\u7F51\u9875\uFF1B\u5426\u5219\u8BF7\u590D\u5236\u5730\u5740\u5230\u5BBF\u4E3B\u6D4F\u89C8\u5668\u3002": "Confirm that your browser runs on the DSH Host before opening pages. Otherwise, copy the address to a browser on that host.",
  "\u7A0D\u540E": "Later",
  "\u7AEF\u53E3\u8F6C\u53D1": "Port forwards",
  "\u7B49\u5F85\u63E1\u624B": "Awaiting handshake",
  "\u7B49\u5F85\u786E\u8BA4\u5F00\u59CB": "Ready for confirmation",
  "\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668\u8D85\u8FC7 30 \u79D2\u672A\u8FD4\u56DE\uFF0C\u5DF2\u505C\u6B62\u7B49\u5F85\u3002\u82E5\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4ECD\u5728\u6216\u7F6E\u4E8E\u540E\u53F0\uFF0C\u8BF7\u5148\u5173\u95ED\u540E\u91CD\u8BD5\uFF1B\u82E5\u4ECD\u65E0\u5BF9\u8BDD\u6846\uFF0C\u8BF7\u91CD\u542F DSH \u540E\u518D\u8BD5\u3002": "The system folder picker did not return within 30 seconds. If a dialog is still open or hidden behind a window, close it and retry. If no dialog appears, restart DSH and try again.",
  "\u7EC8\u7AEF\u4E0A\u4E0B\u6587\u9884\u89C8": "Terminal context preview",
  "\u7EC8\u7AEF\u5DF2\u9000\u51FA": "Terminal exited",
  "\u7EC8\u7AEF\u72B6\u6001": "Terminal status",
  "\u7F16\u8F91": "Edit",
  "\u7F16\u8F91 \xB7 {value1}": "Edit \xB7 {value1}",
  "\u7F16\u8F91\u8FDC\u7A0B\u6587\u672C": "Edit remote text",
  "\u81EA\u52A8\u68C0\u67E5\u7A33\u5B9A\u7248\u66F4\u65B0\uFF08\u6BCF 6 \u5C0F\u65F6\uFF09": "Automatically check stable updates (every 6 hours)",
  "\u8349\u7A3F\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u4E2D\u4FDD\u7559\uFF1B\u9000\u51FA\u5E94\u7528\u4F1A\u4E22\u5931\u3002\u5173\u95ED\u9875\u7B7E\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002": "Drafts last only for this app run and are lost when quitting. Closing the tab does not undo a save already sent.",
  "\u8349\u7A3F\u5DF2\u6539\u53D8\u6216\u8F93\u5165\u6846\u4E0D\u53EF\u7528\uFF0C\u672A\u8986\u76D6\u4EFB\u4F55\u5185\u5BB9\u3002\u8BF7\u590D\u5236\u7247\u6BB5\uFF0C\u6216\u91CD\u65B0\u9884\u89C8\u540E\u518D\u63D2\u5165\u3002": "The draft changed or the input is unavailable. Nothing was overwritten. Copy the excerpt, or preview again before inserting.",
  "\u83B7\u5F97\u5199\u9501\u524D\u76EE\u6807\u5DF2\u6539\u53D8\uFF0C\u672A\u8986\u76D6\u3002": "The destination changed before the write lock was acquired. It was not overwritten.",
  "\u8BA1\u5212\u5DF2\u5EFA\u7ACB\uFF0C\u5C1A\u672A\u4F20\u8F93\u3002\u8BF7\u6838\u5BF9\u5B9E\u9645\u6E05\u5355\u53CA\u6392\u9664\u9879\uFF0C\u518D\u70B9\u51FB\u5F00\u59CB\u3002": "Plan created; no data has transferred yet. Review the manifest and exclusions, then start.",
  "\u8BCA\u65AD": "Diagnostics",
  "\u8BF7\u5148\u4FDD\u5B58\uFF0C\u6216\u786E\u8BA4\u653E\u5F03\u5F53\u524D\u8349\u7A3F\u3002": "Save first, or confirm discarding the current draft.",
  "\u8BF7\u5148\u6388\u6743\u539F\u4E0B\u8F7D\u76EE\u5F55\u4EE5\u6E05\u7406\u6682\u5B58\u3002": "Authorize the original download folder before cleaning staging.",
  "\u8BF7\u5148\u6682\u505C\u5F53\u524D\u4F20\u8F93\u3002": "Pause the current transfer first.",
  "\u8BF7\u5148\u9009\u62E9\u672C\u5730\u6587\u4EF6\u6216\u76EE\u5F55\u3002": "Choose local files or a folder first.",
  "\u8BF7\u521B\u5EFA\u8BE5\u6587\u4EF6\u5E76\u6DFB\u52A0\u5177\u4F53 Host \u540E\u5237\u65B0\u3002": "Create this file, add a concrete Host alias, then refresh.",
  "\u8BF7\u590D\u5236\uFF1A{value1}": "Copy manually: {value1}",
  "\u8BF7\u6C42": "Request ",
  "\u8BF7\u6C42\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5237\u65B0\u8BB0\u5F55\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u5EFA\u4EFB\u52A1\u3002": "The request result is unconfirmed. Refresh records; the task will not be recreated automatically.",
  "\u8BF7\u6C42\u8D85\u65F6\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002": "The request timed out. The save will not be resent automatically.",
  "\u8BF7\u9009\u62E9\u5E76\u6388\u6743\u539F\u4E0B\u8F7D\u76EE\u5F55\u3002": "Choose and authorize the original download folder.",
  "\u8BF7\u9009\u62E9\u6700\u521D\u6388\u6743\u7684\u4E0B\u8F7D\u76EE\u5F55\uFF1B\u6B64\u5904\u6CA1\u6709\u539F\u4EFB\u52A1\u7684\u76EE\u5F55\u7ED1\u5B9A\u3002": "Choose the originally authorized download folder. This folder has no binding for the original task.",
  "\u8BFB\u53D6\u6E05\u5355\u2026": "Reading manifest\u2026",
  "\u8F6C\u53D1\u5931\u8D25": "Forward failed",
  "\u8F6C\u53D1\u6253\u5F00\u534F\u8BAE": "Forward URL protocol",
  "\u8F6C\u53D1\u672C\u673A\u7AEF\u53E3": "Forward local port",
  "\u8F6C\u53D1\u8BF4\u660E": "Forwarding details",
  "\u8F6C\u53D1\u8FDC\u7AEF\u7AEF\u53E3": "Forward remote port",
  "\u8F93\u5165\u4E4B\u524D\u4FDD\u5B58\u7684\u8FC1\u79FB\u8BB0\u5F55 ID\u3002\u914D\u7F6E\u6709\u540E\u7EED\u4FEE\u6539\u65F6\u4F1A\u62D2\u7EDD\u56DE\u6EDA\uFF0C\u907F\u514D\u8986\u76D6\u4F60\u7684\u66F4\u6539\u3002": "Enter the saved migration record ID. Rollback refuses to overwrite configuration edited since migration.",
  "\u8F93\u5165\u505C\u987F\u540E\u81EA\u52A8\u524D\u5F80\uFF1BEnter \u53EF\u7ACB\u5373\u524D\u5F80\u3002": "Navigates after you pause typing. Press Enter to go immediately.",
  "\u8F93\u5165\u5B8C\u6574\u6587\u4EF6\u5939\u8DEF\u5F84": "Enter a full folder path",
  "\u8F93\u5165\u8FDC\u7A0B\u6587\u672C\u6587\u4EF6\u8DEF\u5F84\uFF1B\u4EC5\u652F\u6301\u5DE5\u4F5C\u533A\u5185\u5B8C\u6574 UTF-8 \u6587\u672C\u3002\u4E0D\u81EA\u52A8\u4FDD\u5B58\u3002": "Enter a remote text file path. Only complete UTF-8 files within the workspace are supported. Saving is manual.",
  "\u8FC1\u79FB\u65E7 SSH \u914D\u7F6E": "Migrate legacy SSH configuration",
  "\u8FC1\u79FB\u8BB0\u5F55 ID": "Migration record ID",
  "\u8FC1\u79FB\u8BB0\u5F55\uFF1A": "Migration record: ",
  "\u8FD0\u884C\u4E2D": "Running",
  "\u8FDC\u7A0B\u5DE5\u4F5C\u533A {value1}:{value2}": "Remote workspace {value1}:{value2}",
  "\u8FDC\u7A0B\u5DE5\u4F5C\u533A\u9A8C\u8BC1": "Verifying remote workspace",
  "\u8FDC\u7A0B\u5DE5\u4F5C\u53F0": "Remote workbench",
  "\u8FDC\u7A0B\u5DE5\u4F5C\u53F0\u5206\u533A": "Remote workbench sections",
  "\u8FDC\u7A0B\u5DE5\u5177 \xB7 {value1} \xB7 {value2}": "Remote tools \xB7 {value1} \xB7 {value2}",
  "\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00": "Remote quick open",
  "\u8FDC\u7A0B\u641C\u7D22\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u8FDC\u7AEF ripgrep": "Remote search is unavailable. Check remote ripgrep.",
  "\u8FDC\u7A0B\u641C\u7D22\uFF1A\u4E0D\u53EF\u7528\uFF1B\u8BF7\u5728\u8FDC\u7AEF\u5B89\u88C5 ripgrep\uFF0C\u786E\u4FDD rg \u5728\u767B\u5F55\u73AF\u5883 PATH \u4E2D\uFF0C\u7136\u540E\u70B9\u51FB\u8BCA\u65AD\u91CD\u65B0\u68C0\u67E5\u3002{value1}": "Remote search unavailable. Install ripgrep on the remote host and ensure rg is in the login-shell PATH, then use Diagnostics to check again. {value1}",
  "\u8FDC\u7A0B\u641C\u7D22\uFF1A\u53EF\u7528{value1}": "Remote search: available{value1}",
  "\u8FDC\u7A0B\u641C\u7D22\uFF1A\u672A\u68C0\u67E5\uFF08\u8FDE\u63A5\u540E\u68C0\u67E5 rg\uFF09": "Remote search: not checked (rg is checked after connecting)",
  "\u8FDC\u7A0B\u6587\u4EF6\u5185\u5BB9": "Remote file content",
  "\u8FDC\u7A0B\u6587\u4EF6\u5939\u521B\u5EFA": "Creating remote folder",
  "\u8FDC\u7A0B\u6587\u4EF6\u641C\u7D22\u7ED3\u679C": "Remote file search results",
  "\u8FDC\u7A0B\u6587\u4EF6\u8DEF\u5F84": "Remote file path",
  "\u8FDC\u7A0B\u6587\u672C\u7F16\u8F91\u5668": "Remote text editor",
  "\u8FDC\u7A0B\u76EE\u5F55\u6D4F\u89C8": "Remote folder browsing",
  "\u8FDC\u7A0B\u7F16\u8F91": "Remote editor",
  "\u8FDC\u7A0B\u7F16\u8F91\u5668\u5C1A\u672A\u52A0\u8F7D\u3002": "The remote editor has not loaded yet.",
  "\u8FDC\u7AEF helper \u80FD\u529B\u4E0D\u5B8C\u6574": "Remote helper capabilities are incomplete",
  "\u8FDC\u7AEF\u4E0E\u672C\u5730\u4E0B\u8F7D\u524D\u7F00\u4E0D\u4E00\u81F4\u3002": "Remote and local download prefixes do not match.",
  "\u8FDC\u7AEF\u53D6\u6D88\u5DF2\u786E\u8BA4\u3002\u4ECD\u9700\u91CD\u65B0\u6388\u6743\u539F\u672C\u5730\u76EE\u5F55\u4EE5\u6E05\u7406\u6682\u5B58\uFF1B\u5DF2\u5B8C\u6210\u6587\u4EF6\u4FDD\u7559\u3002": "Remote cancellation confirmed. Reauthorize the original local folder to clean staging; completed files are retained.",
  "\u8FDC\u7AEF\u6E05\u7406\u672A\u786E\u8BA4\u3002": "Remote cleanup is unconfirmed.",
  "\u8FDC\u7AEF\u7AEF\u53E3": "Remote port",
  "\u8FDC\u7AEF\u7AEF\u53E3\u68C0\u67E5\u6682\u4E0D\u53EF\u7528\u3002": "The remote port check is temporarily unavailable.",
  "\u8FDC\u7AEF\u8DEF\u5F84": "remote paths",
  "\u8FDE\u63A5": "Connect",
  "\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u5728 SSH \u8BBE\u7F6E\u4E2D\u67E5\u770B\u8BE6\u60C5": "Connection failed. See SSH settings for details.",
  "\u8FDE\u63A5\u72B6\u6001\u67E5\u8BE2\u8D85\u65F6": "Connection status query timed out",
  "\u8FDE\u63A5\u8BCA\u65AD": "Connection diagnostics",
  "\u8FDE\u63A5\u8BE6\u60C5": "Connection details",
  "\u9000\u51FA\u7801\uFF1A": "Exit code: ",
  "\u9009\u62E9\u4E0A\u4F20\u6587\u4EF6": "Choose files to upload",
  "\u9009\u62E9\u4E0A\u4F20\u76EE\u5F55": "Choose upload folder",
  "\u9009\u62E9\u5DE5\u4F5C\u53F0\u5206\u533A": "Choose workbench section",
  "\u9009\u62E9\u6587\u4EF6": "Choose files",
  "\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A": "Choose a local folder or SSH host",
  "\u9009\u62E9\u6E05\u5355\u4E0A\u4E00\u9875": "Previous selection page",
  "\u9009\u62E9\u6E05\u5355\u4E0B\u4E00\u9875": "Next selection page",
  "\u91CD\u65B0\u52A0\u8F7D": "Reload",
  "\u91CD\u65B0\u52A0\u8F7D\u6216\u5207\u6362\u6587\u4EF6\u4F1A\u653E\u5F03\u5F53\u524D\u672A\u4FDD\u5B58\u4FEE\u6539\uFF1B\u53EA\u6709\u5B8C\u6574\u8BFB\u53D6\u65B0\u6587\u4EF6\u6210\u529F\u540E\u624D\u66FF\u6362\u8349\u7A3F\u3002": "Reloading or switching files discards unsaved changes. The draft is replaced only after the new file is read completely.",
  "\u91CD\u65B0\u5EFA\u7ACB": "Recreate",
  "\u91CD\u65B0\u68C0\u67E5\u5DEE\u5F02": "Recheck changes",
  "\u91CD\u65B0\u786E\u8BA4\u7ED3\u679C": "Recheck result",
  "\u91CD\u65B0\u9009\u62E9\u7684\u6E90\u6587\u4EF6\u6E05\u5355\u4E0D\u5339\u914D\uFF1A": "The reselected source manifest does not match: ",
  "\u91CD\u8BD5": "Retry",
  "\u91CD\u8BD5\u6B64\u9879": "Retry this item",
  "\u9519\u8BEF": "Error",
  "\u9690\u85CF": "Hidden",
  "\u9879 /": " items / ",
  "\u9879\uFF08\u542B\u6392\u9664\u9879\uFF09": " items (including exclusions)",
  "\u9879\uFF09": " items)",
  "\u9884\u89C8\u4E0B\u8F7D\u6E05\u5355": "Preview download manifest",
  "\u9884\u89C8\u7EC8\u7AEF\u4E0A\u4E0B\u6587": "Preview terminal context",
  "\u9996\u6B21\u5B89\u88C5\u540E\u5982\u672A\u51FA\u73B0\u5165\u53E3\uFF0C\u8BF7\u4FDD\u5B58\u5DE5\u4F5C\u5E76\u91CD\u542F\u5F53\u524D DSH\u3002\u641C\u7D22\u9700\u8981\u8FDC\u7AEF ripgrep\uFF1B\u5B83\u4E0D\u662F\u5EFA\u7ACB\u8FDE\u63A5\u7684\u524D\u63D0\u3002": "If tools are missing after first installation, save your work and restart this DSH instance. Remote ripgrep enables search but is not required to connect.",
  "\u9996\u7248\u7AEF\u53E3\u8F6C\u53D1\u53EA\u652F\u6301 macOS / Linux DSH Host\u3002": "Port forwarding currently requires a macOS or Linux DSH Host.",
  "\uFF08\u4E0A\u6B21\u8BB0\u5F55\uFF1B\u5F53\u524D\u672A\u8FD0\u884C\uFF0C\u9700\u91CD\u65B0\u6388\u6743\u6062\u590D\uFF09": " (last record; not currently running, reauthorize to resume)",
  "\uFF08\u6587\u4EF6\u4E0D\u5B58\u5728\uFF09": "(file does not exist)",
  "\uFF08\u7D22\u5F15\u4E0D\u5B8C\u6574\uFF0C\u672A\u547D\u4E2D\u4E0D\u4EE3\u8868\u4E0D\u5B58\u5728\uFF09": " (index incomplete; missing results do not prove absence)",
  "\uFF08\u8FC7\u671F\uFF09": " (stale)",
  "\uFF08\u914D\u7F6E\u5DF2\u4FDD\u7559\uFF0C\u5DE5\u4F5C\u533A\u672A\u91CD\u6620\u5C04\uFF09": "(configuration retained; workspaces were not remapped)",
  "\uFF0C\u5F53\u524D": ", showing "
};
var zh = Object.fromEntries(Object.keys(en).map((key) => [key, key]));

// client/locale.tsx
var LOCALE_NAMESPACE = "sshRemote";
var source = (key, params) => key.replace(/\{(\w+)\}/gu, (placeholder, name2) => params?.[name2] === void 0 ? placeholder : String(params[name2]));
var idle = { translate: source, subscribe: (_listener) => () => {
}, snapshot: () => 0, language: () => "zh" };
var binding = idle;
var t = (key, params) => binding.translate(key, params);
var formatDateTime = (value) => new Intl.DateTimeFormat(binding.language(), {
  dateStyle: "medium",
  timeStyle: "short"
}).format(new Date(value));
function installLocale(locale) {
  const unregister = locale.register(LOCALE_NAMESPACE, { en, zh });
  const current = {
    translate: locale.bind(LOCALE_NAMESPACE),
    subscribe: (listener) => locale.subscribe(listener),
    snapshot: () => locale.getSnapshot().revision,
    language: () => locale.getSnapshot().active
  };
  binding = current;
  return () => {
    unregister();
    if (binding === current) binding = idle;
  };
}
function localized(Component) {
  return function Localized(props) {
    (0, import_react.useSyncExternalStore)(binding.subscribe, binding.snapshot, binding.snapshot);
    return (0, import_react.createElement)(Component, props);
  };
}

// client/workbench.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var sections = [
  { id: "files", get title() {
    return t("\u5FEB\u901F\u6253\u5F00");
  } },
  { id: "transfers", get title() {
    return t("\u6587\u4EF6\u4F20\u8F93");
  } },
  { id: "ports", get title() {
    return t("\u7AEF\u53E3\u8F6C\u53D1");
  } },
  { id: "terminals", get title() {
    return t("\u7EC8\u7AEF\u72B6\u6001");
  } }
];
var Workbench = class {
  constructor() {
    __publicField(this, "version", 0);
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "renderers", /* @__PURE__ */ new Map());
    __publicField(this, "last", /* @__PURE__ */ new Map());
    __publicField(this, "snapshot", () => this.version);
    __publicField(this, "subscribe", (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    });
  }
  changed() {
    this.version++;
    for (const listener of this.listeners)
      listener();
  }
  register(section, render) {
    this.renderers.set(section, render);
    this.changed();
    return () => {
      if (this.renderers.get(section) === render) {
        this.renderers.delete(section);
        this.changed();
      }
    };
  }
  selected(session) {
    return this.last.get(session) ?? "files";
  }
  select(session, section) {
    const previous = this.last.get(session);
    this.last.delete(session);
    this.last.set(session, section);
    if (this.last.size > 128)
      this.last.delete(this.last.keys().next().value);
    if (previous !== section)
      this.changed();
  }
  render(section, props) {
    return this.renderers.get(section)?.(props) ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: t("\u5DE5\u5177\u6B63\u5728\u52A0\u8F7D\u2026") });
  }
};
function mountWorkbenchSection(scope6, workbench, id2, kind, section, render) {
  const provider = workbench.register(section, render);
  const unregister = scope6.sidebarRightTabs.register({ id: id2, kind, title: () => sections.find((item) => item.id === section).title, guide: [] });
  const subscribe = (listener) => scope6.sidebarRightTabs.subscribe(listener);
  const availableSnapshot = () => !!scope6.sidebarRightTabs.get("ssh-tools");
  function Redirect({ sessionId, useTabInfo }) {
    const { tab } = useTabInfo();
    const available = (0, import_react2.useSyncExternalStore)(subscribe, availableSnapshot);
    (0, import_react2.useEffect)(() => {
      if (!available || !tab.visible)
        return;
      workbench.select(sessionId, section);
      scope6.sidebarRight.openTabIn(sessionId, "ssh-tools", { replaceTab: tab.id, params: { section } });
    }, [sessionId, tab.id, tab.visible, available]);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: t("\u6B63\u5728\u6253\u5F00\u8FDC\u7A0B\u5DE5\u4F5C\u53F0\u2026") });
  }
  const body = scope6.slots.inject("sidebar.right.pane.tab", () => scope6.slots.register({ name: "sidebar.right.pane.tab", key: id2 }, localized(Redirect)));
  return () => {
    body();
    unregister();
    provider();
  };
}
function openWorkbench(scope6, workbench, sessionId, section) {
  if (scope6.sidebarRight.mounted.getSnapshot() !== sessionId)
    throw new Error(t("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u3002"));
  workbench.select(sessionId, section);
  scope6.sidebarRight.openTabIn(sessionId, "ssh-tools", { params: { section } });
}
function usePageVisible(active = true) {
  const [visible, setVisible] = (0, import_react2.useState)(() => !document.hidden);
  (0, import_react2.useEffect)(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  return active && visible;
}

// client/connection-status.ts
function mountConnectionStatus(ctx) {
  const fiber = ctx.inject(["remote.sshRemote", "connection"], (scope6) => {
    const connection = scope6.connection;
    const store = new ConnectionStatusStore(() => scope6.remote.sshRemote.statuses(), connection.generation, (alias) => scope6.remote.sshRemote.refreshEnvironment(alias));
    const release = scope6.reflect.provide("sshConnectionStatus", store);
    return () => {
      release();
      store.dispose();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
var ownerAlias = (owner) => owner.slice(owner.lastIndexOf("\0") + 1);
var ConnectionStatusStore = class {
  constructor(load, generation, recheck, options = {}) {
    __publicField(this, "load", load);
    __publicField(this, "generation", generation);
    __publicField(this, "recheck", recheck);
    __publicField(this, "snapshot", { hosts: {}, unavailable: t("\u6B63\u5728\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001") });
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "owners", /* @__PURE__ */ new Map());
    __publicField(this, "rechecks", /* @__PURE__ */ new Map());
    __publicField(this, "nextRecheckAt", /* @__PURE__ */ new Map());
    __publicField(this, "wanted", /* @__PURE__ */ new Set());
    /** Visible lease count per host alias, so one host can withdraw its own retry. */
    __publicField(this, "visible", /* @__PURE__ */ new Map());
    __publicField(this, "retryTimer");
    __publicField(this, "recheckCooldownMs");
    __publicField(this, "epoch", 0);
    __publicField(this, "timer");
    __publicField(this, "deadline");
    __publicField(this, "disposed", false);
    /** RPCs have no abort parameter: never stack another read behind a timeout. */
    __publicField(this, "inFlight");
    __publicField(this, "refreshPending", false);
    __publicField(this, "stopGeneration");
    __publicField(this, "getSnapshot", () => this.snapshot);
    __publicField(this, "subscribe", (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    });
    this.recheckCooldownMs = options.recheckCooldownMs ?? 6e4;
    this.snapshot = { ...this.snapshot, generation: generation.getSnapshot()?.id };
    this.stopGeneration = generation.subscribe(() => this.restart());
  }
  hasOwner(key) {
    return this.owners.has(key);
  }
  /**
   * Republish the polled snapshot after out-of-band knowledge changed.
   *
   * The cached capability verdict is only refreshed by an explicit environment
   * probe; without this the badge keeps the connect-time verdict even after the
   * host reports a new one.
   */
  refresh() {
    if (this.disposed || this.generation.getSnapshot()?.id === void 0)
      return;
    const epoch = ++this.epoch;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    if (this.owners.size > 0)
      this.poll(epoch);
  }
  /**
   * Re-probe one host's login-shell environment, then republish.
   *
   * The badge and the workbench are separate components over one store, and the
   * five-second poll re-renders both of them, so the in-flight request, the
   * cooldown and the retry timer have to live here rather than in a per-surface
   * ref: one host identity means one probe. A negative verdict is never final
   * either — the tool may be installed after the helper connected, or after an
   * earlier probe failed — so a degraded host keeps a bounded, low-frequency
   * retry that the store drives on its own clock. That keeps the five-second
   * status poll from becoming an environment check, needs no reconnect or
   * Session switch, and stops as soon as the surface hides or the host recovers.
   */
  async recheckHost(alias) {
    if (this.disposed || this.recheck === void 0 || !this.isVisible(alias))
      return;
    const identity2 = this.identity(alias);
    this.wanted.add(identity2);
    const pending = this.rechecks.get(identity2);
    if (pending !== void 0)
      return pending;
    if (Date.now() < (this.nextRecheckAt.get(identity2) ?? 0)) {
      this.scheduleRetry();
      return;
    }
    const task = this.probe(identity2, alias);
    this.rechecks.set(identity2, task);
    await task;
  }
  identity(alias) {
    return `${alias}\0${this.generation.getSnapshot()?.id ?? ""}`;
  }
  isVisible(alias) {
    return (this.visible.get(alias) ?? 0) > 0;
  }
  async probe(identity2, alias) {
    try {
      await this.recheck?.(alias);
    } catch {
    } finally {
      this.rechecks.delete(identity2);
      if (this.disposed || !this.isCurrent(identity2))
        this.nextRecheckAt.delete(identity2);
      else
        this.nextRecheckAt.set(identity2, Date.now() + this.recheckCooldownMs);
    }
    if (this.disposed || !this.isCurrent(identity2))
      return;
    this.refresh();
    this.scheduleRetry();
  }
  /**
   * Arm one timer for the earliest visible host that is still degraded.
   *
   * A host with a probe in flight has no due time yet: arming on it would fire a
   * zero-delay timer that can only re-enter the same pending probe. Its own
   * completion arms the next round.
   */
  scheduleRetry() {
    if (this.disposed || this.retryTimer !== void 0)
      return;
    const now = Date.now();
    let due = Infinity;
    for (const identity2 of [...this.wanted]) {
      if (!this.isCurrent(identity2)) {
        this.wanted.delete(identity2);
        continue;
      }
      if (this.rechecks.has(identity2))
        continue;
      const alias = this.identityAlias(identity2);
      if (!this.isVisible(alias)) {
        this.wanted.delete(identity2);
        continue;
      }
      if (this.snapshot.hosts[alias]?.environment?.search.available !== false) {
        this.wanted.delete(identity2);
        continue;
      }
      due = Math.min(due, this.nextRecheckAt.get(identity2) ?? now);
    }
    if (due === Infinity)
      return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = void 0;
      void this.retryDue();
    }, Math.max(0, due - now));
  }
  async retryDue() {
    if (this.disposed)
      return;
    for (const identity2 of [...this.wanted]) {
      if (!this.isCurrent(identity2) || this.rechecks.has(identity2)) {
        this.wanted.delete(identity2);
        continue;
      }
      const alias = this.identityAlias(identity2);
      if (!this.isVisible(alias)) {
        this.wanted.delete(identity2);
        continue;
      }
      if (this.snapshot.hosts[alias]?.environment?.search.available !== false) {
        this.wanted.delete(identity2);
        continue;
      }
      await this.recheckHost(alias);
    }
    this.scheduleRetry();
  }
  identityAlias(identity2) {
    return identity2.slice(0, identity2.indexOf("\0"));
  }
  isCurrent(identity2) {
    return identity2.endsWith(`\0${this.generation.getSnapshot()?.id ?? ""}`);
  }
  /** Drop one host's retry demand once its last visible surface is gone. */
  forget(alias) {
    for (const identity2 of [...this.wanted])
      if (this.identityAlias(identity2) === alias)
        this.wanted.delete(identity2);
    if (this.wanted.size === 0) {
      clearTimeout(this.retryTimer);
      this.retryTimer = void 0;
    }
  }
  /** A key includes Session, cwd and verified alias; duplicate surfaces share a lease. */
  retain(key) {
    if (this.disposed)
      return () => {
      };
    const count = this.owners.get(key) ?? 0;
    this.owners.set(key, count + 1);
    if (count === 0) {
      this.holdAlias(ownerAlias(key));
      if (this.owners.size === 1)
        this.restart();
    }
    let released = false;
    return () => {
      if (released || this.disposed)
        return;
      released = true;
      const remaining = (this.owners.get(key) ?? 1) - 1;
      if (remaining > 0) {
        this.owners.set(key, remaining);
        return;
      }
      this.owners.delete(key);
      this.releaseAlias(ownerAlias(key));
      if (this.owners.size === 0)
        this.restart();
      else
        this.refresh();
    };
  }
  holdAlias(alias) {
    this.visible.set(alias, (this.visible.get(alias) ?? 0) + 1);
  }
  releaseAlias(alias) {
    const leases = (this.visible.get(alias) ?? 1) - 1;
    if (leases > 0) {
      this.visible.set(alias, leases);
      return;
    }
    this.visible.delete(alias);
    this.forget(alias);
  }
  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    this.epoch++;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    clearTimeout(this.retryTimer);
    this.retryTimer = void 0;
    this.wanted.clear();
    this.rechecks.clear();
    this.visible.clear();
    this.stopGeneration();
    this.owners.clear();
    this.listeners.clear();
  }
  publish(snapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners)
      listener();
  }
  restart() {
    if (this.disposed)
      return;
    const epoch = ++this.epoch;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    clearTimeout(this.retryTimer);
    this.retryTimer = void 0;
    const generation = this.generation.getSnapshot()?.id;
    for (const identity2 of [...this.nextRecheckAt.keys()]) {
      if (!identity2.endsWith(`\0${generation ?? ""}`))
        this.nextRecheckAt.delete(identity2);
    }
    for (const identity2 of [...this.wanted])
      if (!this.isCurrent(identity2))
        this.wanted.delete(identity2);
    const ready = generation !== void 0;
    this.publish({ hosts: {}, generation, unavailable: ready ? t("\u6B63\u5728\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001") : t("\u4E0E DSH \u7684\u8FDE\u63A5\u4E0D\u53EF\u7528") });
    if (ready && this.owners.size > 0)
      this.poll(epoch);
  }
  poll(epoch) {
    if (this.disposed || epoch !== this.epoch || this.owners.size === 0 || this.snapshot.generation === void 0)
      return;
    if (this.inFlight) {
      this.refreshPending = true;
      this.deadline = setTimeout(() => {
        if (epoch === this.epoch && !this.disposed)
          this.publish({
            hosts: {},
            generation: this.snapshot.generation,
            unavailable: t("\u8FDE\u63A5\u72B6\u6001\u67E5\u8BE2\u8D85\u65F6")
          });
      }, 1e4);
      return;
    }
    this.refreshPending = false;
    let settled = false;
    const finish = (snapshot) => {
      if (settled || epoch !== this.epoch || this.disposed)
        return;
      settled = true;
      clearTimeout(this.deadline);
      this.publish({ ...snapshot, generation: this.snapshot.generation });
    };
    this.deadline = setTimeout(() => finish({ hosts: {}, unavailable: t("\u8FDE\u63A5\u72B6\u6001\u67E5\u8BE2\u8D85\u65F6") }), 1e4);
    const operation = Promise.resolve().then(() => {
      if (epoch !== this.epoch || this.disposed)
        return;
      return this.load();
    }).then((result4) => {
      if (result4)
        finish(result4.ok ? { hosts: result4.value } : { hosts: {}, unavailable: t("\u65E0\u6CD5\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001\uFF1A{value1}", { value1: result4.error.message }) });
    }, (error) => finish({ hosts: {}, unavailable: t("\u65E0\u6CD5\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001\uFF1A{value1}", { value1: error instanceof Error ? error.message : String(error) }) }));
    this.inFlight = operation;
    void operation.finally(() => {
      if (this.inFlight !== operation)
        return;
      this.inFlight = void 0;
      clearTimeout(this.deadline);
      if (this.disposed || this.owners.size === 0 || this.snapshot.generation === void 0)
        return;
      if (this.refreshPending || epoch !== this.epoch)
        this.poll(this.epoch);
      else
        this.timer = setTimeout(() => this.poll(this.epoch), 5e3);
    });
  }
};

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
    parameters: parameters.map((name2) => ({
      name: name2,
      wire: name2,
      source: "json",
      codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#${name2}`, create: () => schemas[name2] ?? schemas.string }
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
var document2 = { parse(value) {
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
var parameter = (name2, schema = string) => ({
  name: name2,
  wire: name2,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#editor/${name2}`, create: () => schema }
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
  invocation("read", [parameter("path")], document2),
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
var parameter2 = (name2, schema) => ({
  name: name2,
  wire: name2,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#file-search/${name2}`, create: () => schema }
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
var parameter3 = (name2, schema) => ({
  name: name2,
  wire: name2,
  source: "json",
  codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#ports/${name2}`, create: () => schema }
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
function cleanRegex(source2) {
  const start = source2.startsWith("^") ? 1 : 0;
  const end = source2.endsWith("$") ? source2.length - 1 : source2.length;
  return source2.slice(start, end);
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
function mirrorShape(target, source2, keys, wrap) {
  const raw = sourceShape(source2);
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (!desc.enumerable)
      continue;
    if (desc.get) {
      deferProp(target, key, () => {
        const value = source2._zod.def.shape[key];
        return wrap ? wrap(value, key) : value;
      });
    } else
      putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
  }
}
function mirrorProps(target, source2) {
  for (const key of Reflect.ownKeys(source2)) {
    const desc = Object.getOwnPropertyDescriptor(source2, key);
    if (!desc.enumerable)
      continue;
    if (desc.get)
      deferProp(target, key, () => source2[key]);
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
function unwrapMessage(message2) {
  return typeof message2 === "string" ? message2 : message2?.message;
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
  const message2 = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message2;
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
function $constructor(name2, initializer2, proto, params) {
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
    } else if (inst._zod.traits.has(name2)) {
      return;
    }
    inst._zod.traits.add(name2);
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
  Object.defineProperty(Definition, "name", { value: name2 });
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
      return inst?._zod?.traits?.has(name2);
    }
  });
  Object.defineProperty(_, "name", { value: name2 });
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
  const t2 = _catchall.def.type;
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
      if (t2 === "never")
        unrecognized.push(key);
      continue;
    }
    if (t2 === "never") {
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
var parameter4 = (name2, schema) => ({ name: name2, wire: name2, source: "json", codec: { mode: "strict", typeSymbol: `dsh-ssh-remote#transfer/${name2}`, create: () => schema } });
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
  object3({ terminal: view2, text: str.check(_maxLength(65536)), truncated: boolean2(), output: optional(str.check(_maxLength(65536))) })
)];

// shared/update-schema.js
function updateInvocations(schemas) {
  return [["info", [], "UpdateInfo"], ["check", ["force"], "ReleaseCheck"]].map(([method, parameters, result4]) => ({
    id: `dsh-ssh-remote#sshRemoteUpdates/${method}`,
    service: "sshRemoteUpdates",
    namespace: "sshRemoteUpdates",
    method,
    invocation: { kind: "direct" },
    parameters: parameters.map((name2) => ({
      name: name2,
      wire: name2,
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

// client/native-panels.tsx
var import_react3 = require("react");

// client/connection-ui.ts
var MUTATION_DEADLINE_MS = 3e4;
var READ_DEADLINE_MS = 3e4;
async function asResult(run) {
  try {
    return { ok: true, value: await run() };
  } catch (reason) {
    return { ok: false, error: { message: messageOf(reason) } };
  }
}
function withMutationDeadline(operation, label) {
  return withDeadline(operation, t("{value1} \u8D85\u8FC7 {value2} \u79D2\uFF1B\u7ED3\u679C\u672A\u77E5\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u3002", { value1: label, value2: MUTATION_DEADLINE_MS / 1e3 }), MUTATION_DEADLINE_MS);
}
function withReadDeadline(operation, label) {
  return withDeadline(operation, t("{value1} \u8D85\u8FC7 {value2} \u79D2\uFF0C\u8BF7\u91CD\u8BD5\u3002", { value1: label, value2: READ_DEADLINE_MS / 1e3 }), READ_DEADLINE_MS);
}
function withDeadline(operation, message2, milliseconds, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (run) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    const timer = setTimeout(() => {
      finish(() => {
        onTimeout?.();
        reject(new Error(message2));
      });
    }, milliseconds);
    operation.then((value) => finish(() => resolve(value)), (reason) => finish(() => reject(reason)));
  });
}
function messageOf(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}
var subtleText = { color: "var(--dsw-alias-label-secondary)", fontSize: 12 };
var dimmedText = { color: "var(--dsw-alias-label-dimmed)", fontSize: 11 };
function helperStateLabel(state) {
  return {
    disconnected: t("\u672A\u8FDE\u63A5"),
    installing: t("\u6B63\u5728\u5B89\u88C5"),
    connecting: t("\u6B63\u5728\u8FDE\u63A5"),
    connected: t("\u5DF2\u8FDE\u63A5"),
    degraded: t("\u5DF2\u8FDE\u63A5\uFF08\u80FD\u529B\u53D7\u9650\uFF09"),
    reconnecting: t("\u6B63\u5728\u91CD\u8FDE"),
    error: t("\u9519\u8BEF")
  }[state];
}
function helperCapabilitySummary(capabilities) {
  const names = Object.entries(capabilities).filter(([, value]) => value !== false && value !== null).map(([name2]) => name2);
  return names.length === 0 ? t("\u7B49\u5F85\u63E1\u624B") : names.join(" \xB7 ");
}
function searchSummary(helper) {
  const search = helper.environment?.search;
  if (search === void 0)
    return t("\u8FDC\u7A0B\u641C\u7D22\uFF1A\u672A\u68C0\u67E5\uFF08\u8FDE\u63A5\u540E\u68C0\u67E5 rg\uFF09");
  return search.available ? t("\u8FDC\u7A0B\u641C\u7D22\uFF1A\u53EF\u7528{value1}", { value1: search.version ? ` \xB7 ${search.version}` : "" }) : t("\u8FDC\u7A0B\u641C\u7D22\uFF1A\u4E0D\u53EF\u7528\uFF1B\u8BF7\u5728\u8FDC\u7AEF\u5B89\u88C5 ripgrep\uFF0C\u786E\u4FDD rg \u5728\u767B\u5F55\u73AF\u5883 PATH \u4E2D\uFF0C\u7136\u540E\u70B9\u51FB\u8BCA\u65AD\u91CD\u65B0\u68C0\u67E5\u3002{value1}", { value1: search.error ? ` ${search.error}` : "" });
}

// client/native-panels.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime2 = require("react/jsx-runtime");
var TOOLS_ID = "dsh-ssh-remote.tools";
var tools = [
  { kind: "ssh-quick-open", bit: 2 },
  { kind: "ssh-transfers", bit: 4 },
  { kind: "ssh-ports", bit: 8 }
];
function mountNativePanels(ctx, workbench) {
  const fiber = ctx.inject(["remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs", "sessions", "sshConnectionStatus"], (scope6) => {
    const ssh = scope6.remote.sshRemote;
    if (typeof ssh.workspaceInfo !== "function")
      return () => {
      };
    const workspaceInfo = (path2) => ssh.workspaceInfo(path2);
    const connectionStatus = scope6.sshConnectionStatus;
    const inject2 = (sessionId) => ({
      workspaceInfo,
      workbench,
      connectionStatus,
      openPanel: (kind) => {
        if (scope6.sidebarRight.mounted.getSnapshot() !== sessionId) {
          throw new Error(t("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u91CD\u65B0\u6253\u5F00\u3002"));
        }
        if (scope6.sidebarRightTabs.get(kind) === void 0) {
          throw new Error(t("\u5DE5\u5177\u5C1A\u672A\u52A0\u8F7D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002"));
        }
        scope6.sidebarRight.openTab(kind);
      },
      availablePanels: () => tools.reduce((bits, tool) => bits | (scope6.sidebarRightTabs.get(tool.kind) ? tool.bit : 0), scope6.sidebarRightTabs.get("ssh-tools") ? 1 : 0),
      subscribePanels: (listener) => scope6.sidebarRightTabs.subscribe(listener)
    });
    let identity2 = "";
    let generation = 0;
    let unregister;
    let timeout;
    const updateGuide = () => {
      const sessionId = scope6.sidebarRight.mounted.getSnapshot();
      const cwd = sessionId ? scope6.sessions.list.getSnapshot().byId[sessionId]?.cwd : void 0;
      const next = `${sessionId ?? ""}\0${cwd ?? ""}`;
      if (next === identity2)
        return;
      identity2 = next;
      const revision = ++generation;
      clearTimeout(timeout);
      unregister?.();
      unregister = void 0;
      if (!sessionId || !cwd)
        return;
      timeout = setTimeout(() => {
        if (revision === generation)
          generation++;
      }, 1e4);
      void Promise.resolve().then(() => workspaceInfo(cwd)).then((result4) => {
        if (revision !== generation)
          return;
        clearTimeout(timeout);
        if (result4.ok && result4.value) {
          unregister = scope6.sidebarRightTabs.register({
            id: TOOLS_ID,
            kind: "ssh-tools",
            keepMounted: true,
            title: () => t("\u8FDC\u7A0B\u5DE5\u4F5C\u53F0"),
            guide: [{ id: TOOLS_ID, order: 40, title: () => t("\u8FDC\u7A0B\u5DE5\u4F5C\u53F0"), icon: import_dsh_client_ui_primitives.IconGlobeOutlineRegular }]
          });
        }
      }, () => {
        if (revision === generation)
          clearTimeout(timeout);
      });
    };
    const stopMounted = scope6.sidebarRight.mounted.subscribe(updateGuide);
    const stopSessions = scope6.sessions.list.subscribe(updateGuide);
    updateGuide();
    const body = scope6.slots.inject("sidebar.right.pane.tab", () => scope6.slots.register({
      name: "sidebar.right.pane.tab",
      key: TOOLS_ID,
      inject: inject2
    }, localized(RemoteToolsPane)));
    const header = scope6.slots.inject("conversation.session.header.utilities", () => scope6.slots.register({
      name: "conversation.session.header.utilities",
      id: "dsh-ssh-remote.native-panels",
      order: 40,
      inject: inject2
    }, localized(NativePanelActions)));
    const blank = scope6.slots.inject("conversation.input.dock", () => scope6.slots.register({
      name: "conversation.input.dock",
      id: "dsh-ssh-remote.native-panels.blank",
      order: 40,
      inject: inject2
    }, localized(BlankNativePanelActions)));
    return () => {
      generation++;
      clearTimeout(timeout);
      stopSessions();
      stopMounted();
      blank();
      header();
      body();
      unregister?.();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
function BlankNativePanelActions(props) {
  const activeTarget = props.useConversation((snapshot) => snapshot.activeTargets.size > 0);
  if (!props.session.blank || props.session.running || props.session.promptAttempted || activeTarget)
    return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NativePanelActions, { ...props, presentation: "dock" });
}
function useRemoteWorkspace({ sessionId, useSessions, workspaceInfo, connectionStatus }, visible) {
  const { generation } = (0, import_react3.useSyncExternalStore)(connectionStatus.subscribe, connectionStatus.getSnapshot, connectionStatus.getSnapshot);
  const cwd = useSessions((snapshot) => snapshot.byId[sessionId]?.cwd);
  const key = `${sessionId}\0${cwd ?? ""}`;
  const [resolved, setResolved] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    let active = true;
    if (!visible || cwd === void 0 || cwd === "" || generation === void 0)
      return;
    const timeout = setTimeout(() => {
      active = false;
      setResolved({ key, generation, info: null });
    }, 1e4);
    void Promise.resolve().then(() => workspaceInfo(cwd)).then((result4) => {
      if (active)
        setResolved({ key, generation, info: result4.ok ? result4.value : null });
    }, () => {
      if (active)
        setResolved({ key, generation, info: null });
    }).finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [key, cwd, generation, workspaceInfo, visible]);
  const current = resolved?.key === key && (generation === void 0 || generation === resolved.generation);
  return { key, info: current ? resolved.info : null, pending: Boolean(cwd) && !current };
}
function connectionPresentation(status2, unavailable) {
  const state = status2?.status;
  const label = state ? helperStateLabel(state) : t("\u72B6\u6001\u672A\u77E5");
  const limited = state === "degraded" && status2?.environment?.search.available === false ? status2.environment.search.error || t("\u8FDC\u7A0B\u641C\u7D22\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u8FDC\u7AEF ripgrep") : "";
  const detail = state === "error" || state === "degraded" ? [status2?.error, status2?.hint, limited].filter(Boolean).join("\uFF1B") || (state === "degraded" ? t("\u8FDC\u7AEF helper \u80FD\u529B\u4E0D\u5B8C\u6574") : t("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u5728 SSH \u8BBE\u7F6E\u4E2D\u67E5\u770B\u8BE6\u60C5")) : state === void 0 ? unavailable || t("\u5C1A\u672A\u83B7\u5F97\u8BE5\u4E3B\u673A\u7684\u8FDE\u63A5\u72B6\u6001") : "";
  const tone = state === "connected" ? "success" : state === "error" ? "error" : state && state !== "disconnected" ? "warn" : "neutral";
  return { label, detail, tone, state: state ?? "unknown" };
}
function useConnectionStatus(store, key, alias, visible) {
  const snapshot = (0, import_react3.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
  const owner = `${key}\0${alias ?? ""}`;
  (0, import_react3.useEffect)(() => {
    if (visible && alias)
      return store.retain(owner);
  }, [store, owner, alias, visible]);
  const host = visible && store.hasOwner(owner) && alias ? snapshot.hosts[alias] : void 0;
  (0, import_react3.useEffect)(() => {
    if (!visible || alias === void 0 || host?.environment?.search.available !== false)
      return;
    void store.recheckHost(alias);
  }, [store, alias, visible, host]);
  return connectionPresentation(host, snapshot.unavailable);
}
function StatusDot({ status: status2 }) {
  const color = status2.tone === "neutral" ? "var(--dsw-alias-label-secondary)" : `var(--dsw-alias-state-${status2.tone}-primary)`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", "data-ssh-status": status2.state, style: {
    display: "inline-block",
    width: 6,
    height: 6,
    flex: "0 0 6px",
    boxSizing: "border-box",
    borderRadius: "50%",
    border: `1px solid ${color}`,
    background: status2.tone === "neutral" ? "transparent" : color
  } });
}
function statusTooltip(info, status2) {
  return `${info.alias}:${info.remotePath}
${status2.label}${status2.detail ? `\uFF1A${status2.detail}` : ""}`;
}
function NativePanelActions(props) {
  const { openPanel, availablePanels, subscribePanels, presentation = "header" } = props;
  const visible = usePageVisible();
  const { key, info } = useRemoteWorkspace(props, visible);
  const status2 = useConnectionStatus(props.connectionStatus, key, info?.alias, visible);
  const [failure2, setFailure] = (0, import_react3.useState)(null);
  const panels = (0, import_react3.useSyncExternalStore)(subscribePanels, availablePanels, availablePanels);
  if (!info)
    return null;
  const open = (kind) => {
    setFailure(null);
    try {
      openPanel(kind);
    } catch (error) {
      setFailure({ key, message: error instanceof Error ? error.message : String(error) });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { "aria-label": t("\u8FDC\u7A0B\u5DE5\u4F5C\u533A {value1}:{value2}", { value1: info.alias, value2: info.remotePath }), style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0, ...presentation === "dock" ? { justifyContent: "flex-end", marginBottom: 8 } : {} }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: statusTooltip(info, status2), side: "bottom", align: "end", portal: true, maxWidth: 360, delayMs: 300, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "ghost", disabled: (panels & 1) === 0, "aria-label": t("\u8FDC\u7A0B\u5DE5\u5177 \xB7 {value1} \xB7 {value2}", { value1: info.alias, value2: status2.label }), style: { display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: 160, color: "var(--dsw-alias-label-secondary)" }, onClick: () => open("ssh-tools"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
        "SSH \xB7 ",
        info.alias
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(StatusDot, { status: status2 })
    ] }) }),
    failure2?.key === key && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 11 }, children: failure2.message })
  ] });
}
function RemoteToolsPane(props) {
  const { tab } = props.useTabInfo();
  const visible = usePageVisible(tab.visible);
  const { key, info, pending } = useRemoteWorkspace(props, visible);
  (0, import_react3.useSyncExternalStore)(props.workbench.subscribe, props.workbench.snapshot, props.workbench.snapshot);
  const selected = props.workbench.selected(props.sessionId);
  const navigation = tab.navigation;
  const requested = navigation?.params && "section" in navigation.params ? navigation.params.section : void 0;
  (0, import_react3.useEffect)(() => {
    if (requested && sections.some((section) => section.id === requested))
      props.workbench.select(props.sessionId, requested);
  }, [props.workbench, props.sessionId, tab.id, navigation?.revision, requested]);
  const [menu, setMenu] = (0, import_react3.useState)(false), [width, setWidth] = (0, import_react3.useState)(0);
  const status2 = useConnectionStatus(props.connectionStatus, key, info?.alias, visible);
  const container = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined")
      return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const choose = (section) => {
    props.workbench.select(props.sessionId, section);
    setMenu(false);
  };
  const tabs = sections.map((section) => ({ value: section.id, label: section.title, id: `${tab.id}-tab-${section.id}`, panelId: `${tab.id}-panel-${section.id}` }));
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { ref: container, "aria-label": t("\u8FDC\u7A0B\u5DE5\u4F5C\u53F0"), className: "dsh-ssh-workbench", style: { display: "flex", flexDirection: "column", height: "100%", minWidth: 0, overflow: "hidden", color: "var(--dsw-alias-label-primary)", fontSize: 13 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: `.dsh-ssh-workbench *{box-sizing:border-box}.dsh-ssh-workbench textarea,.dsh-ssh-workbench select{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;max-width:100%;min-width:0}.dsh-ssh-workbench textarea,.dsh-ssh-workbench select{padding:8px}.dsh-ssh-workbench small,.dsh-ssh-workbench summary{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-ssh-workbench summary{cursor:pointer}.dsh-ssh-workbench [role=alert]{color:var(--dsw-alias-label-error);overflow-wrap:anywhere}.dsh-ssh-workbench progress{width:100%;height:5px;accent-color:var(--dsw-alias-brand-primary,#4d7fff)}` }),
    info ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { style: { padding: "16px 16px 12px", display: "grid", gap: 8, borderBottom: "1px solid var(--dsw-alias-border-l2)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.IconGlobeOutlineRegular, { size: 16 }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { title: info.alias, style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }, children: [
            "SSH \xB7 ",
            info.alias
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: statusTooltip(info, status2), side: "bottom", align: "end", portal: true, maxWidth: 360, delayMs: 300, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { role: "status", tabIndex: 0, style: { flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(StatusDot, { status: status2 }),
            status2.label
          ] }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.PathLabel, { path: info.remotePath, style: { color: "var(--dsw-alias-label-secondary)", fontSize: 12 } }),
        width >= 520 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.SegmentedTabs, { label: t("\u8FDC\u7A0B\u5DE5\u4F5C\u53F0\u5206\u533A"), items: tabs, value: selected, onChange: choose }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Menu, { open: menu, onClose: () => setMenu(false), selectedId: selected, items: sections.map((section) => ({ id: section.id, label: section.title })), onSelect: (id2) => choose(id2), anchor: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", "aria-label": t("\u9009\u62E9\u5DE5\u4F5C\u53F0\u5206\u533A"), "aria-haspopup": "menu", "aria-expanded": menu, onClick: () => setMenu(!menu), children: [
          sections.find((section) => section.id === selected).title,
          " \u25BE"
        ] }) })
      ] }),
      sections.map((section) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { id: `${tab.id}-panel-${section.id}`, role: "tabpanel", "aria-label": section.title, "aria-labelledby": width >= 520 ? `${tab.id}-tab-${section.id}` : void 0, hidden: selected !== section.id, style: { flex: 1, minHeight: 0, overflow: "auto", display: selected === section.id ? "block" : "none" }, children: props.workbench.render(section.id, { ...props, active: visible && selected === section.id }) }, section.id))
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", style: { padding: 16 }, children: pending ? t("\u6B63\u5728\u8BFB\u53D6\u5DE5\u4F5C\u533A\u2026") : t("\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u53EF\u7528\u7684 SSH \u5DE5\u4F5C\u533A\u3002") })
  ] });
}

// client/markdown-preview.tsx
var import_react4 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ":");
}
function encodePath(path2) {
  return path2.split("/").map(encodeSegment).join("/");
}
function isDriveSegment(segment) {
  return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
}
function sessionFileAddress(sessionId, path2) {
  const normalized = path2.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
}
function parseFileAddress(address) {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
    const end = address.search(/[?#]/);
    const [scope6, ...rest] = address.slice(20, end === -1 ? void 0 : end).split("/");
    if (scope6 === "session") {
      const [id2, ...segments] = rest;
      if (id2 === void 0 || id2 === "" || segments.length === 0) return void 0;
      return {
        scope: scope6,
        sessionId: decodeURIComponent(id2),
        path: segments.map(decodeURIComponent).join("/")
      };
    }
    if (scope6 === "absolute") {
      const unc = rest[0] === "" && rest.length > 1;
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
      if (segments.length === 0 || segments[0] === "") return void 0;
      if (unc) return {
        scope: scope6,
        path: `//${segments.join("/")}`
      };
      return {
        scope: scope6,
        path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
      };
    }
    return;
  } catch {
    return;
  }
}

// client/markdown-images.ts
var DEFAULT_LIMITS = { entries: 64, imageBytes: 4 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, concurrent: 4, readTimeoutMs: 1e4 };
function imageFilePath(destination) {
  const suffix = destination.search(/[?#]/u);
  let path2;
  try {
    path2 = decodeURIComponent(suffix < 0 ? destination : destination.slice(0, suffix));
  } catch {
    return void 0;
  }
  if (!path2 || path2.includes("\0") || path2.startsWith("//") || path2.startsWith("\\\\")) return void 0;
  if (!/^[a-z]:[/\\]/iu.test(path2) && /^[a-z][a-z\d+.-]*:/iu.test(path2)) return void 0;
  return path2;
}
var SessionImageCache = class {
  constructor(resourceAddress, read2, changed, dependency = () => {
  }, limits = {}, urls = { create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) }) {
    __publicField(this, "read", read2);
    __publicField(this, "changed", changed);
    __publicField(this, "dependency", dependency);
    __publicField(this, "urls", urls);
    __publicField(this, "file");
    __publicField(this, "entries", /* @__PURE__ */ new Map());
    __publicField(this, "lifetime", new AbortController());
    __publicField(this, "running", 0);
    __publicField(this, "bytes", 0);
    __publicField(this, "limited", false);
    __publicField(this, "disposed", false);
    __publicField(this, "stalled", false);
    __publicField(this, "limits");
    const parsed = parseFileAddress(resourceAddress);
    this.file = parsed?.scope === "session" ? parsed : void 0;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const value of Object.values(this.limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid Markdown image cache limit");
  }
  get(destination) {
    const path2 = imageFilePath(destination);
    return path2 === void 0 ? void 0 : this.entries.get(path2)?.url;
  }
  get failed() {
    return this.limited || [...this.entries.values()].some((entry2) => entry2.state === "failed");
  }
  /** Called after React commits, never from the Markdown resolver's render pass. */
  request(destinations) {
    if (this.disposed || this.stalled || this.file === void 0) return;
    let newlyLimited = false;
    for (const destination of destinations) {
      const path2 = imageFilePath(destination);
      if (path2 === void 0 || this.entries.has(path2)) continue;
      if (this.entries.size >= this.limits.entries) {
        newlyLimited || (newlyLimited = !this.limited);
        this.limited = true;
        continue;
      }
      this.entries.set(path2, { path: path2, state: "queued" });
    }
    this.pump();
    if (newlyLimited) this.changed();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort(new Error("Markdown image document changed or closed"));
    for (const entry2 of this.entries.values()) if (entry2.url !== void 0) this.urls.revoke(entry2.url);
    this.entries.clear();
    this.bytes = 0;
  }
  pump() {
    if (this.disposed || this.stalled) return;
    for (const entry2 of this.entries.values()) {
      if (this.running >= this.limits.concurrent) return;
      if (entry2.state !== "queued") continue;
      entry2.state = "loading";
      this.running += 1;
      void this.load(entry2).then(() => {
        entry2.state = "loaded";
      }, () => {
        entry2.state = "failed";
      }).finally(() => {
        this.running -= 1;
        if (!this.disposed) {
          this.changed();
          this.pump();
        }
      });
    }
  }
  async load(entry2) {
    const file2 = this.file;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error("Markdown image read timed out")), this.limits.readTimeoutMs);
    const signal = AbortSignal.any([this.lifetime.signal, timeout.signal]);
    const chunks = [];
    let offset = 0;
    let version2;
    let absolutePath;
    try {
      for (; ; ) {
        signal.throwIfAborted();
        const result4 = await abortable(this.read(file2.sessionId, entry2.path, {
          baseFile: file2.path,
          range: { offset, length: Math.min(64 * 1024, this.limits.imageBytes - offset + 1) }
        }, signal), signal);
        if (!result4.ok) throw new Error(result4.error.message);
        const part = result4.value;
        if (!(part.data instanceof Uint8Array) || part.offset !== offset || part.bytes !== void 0 && part.bytes > this.limits.imageBytes || offset + part.data.byteLength > this.limits.imageBytes || version2 !== void 0 && (version2 !== part.version || absolutePath !== part.absolutePath)) {
          throw new Error("Markdown image is too large or changed during reading");
        }
        version2 = part.version;
        absolutePath = part.absolutePath;
        chunks.push(part.data);
        offset += part.data.byteLength;
        if (part.eof) break;
        if (part.data.byteLength === 0) throw new Error("Markdown image read made no progress");
      }
      signal.throwIfAborted();
      if (this.bytes + offset > this.limits.totalBytes) throw new Error("Markdown image cache is full");
      const data = new Uint8Array(offset);
      let start = 0;
      for (const chunk of chunks) {
        data.set(chunk, start);
        start += chunk.byteLength;
      }
      const mime = imageMime(data);
      if (mime === void 0) throw new Error("Markdown image format is unsupported");
      const url = this.urls.create(new Blob([data], { type: mime }));
      if (this.disposed) {
        this.urls.revoke(url);
        return;
      }
      entry2.url = url;
      this.bytes += offset;
      this.dependency(sessionFileAddress(file2.sessionId, absolutePath));
    } catch (error) {
      if (timeout.signal.aborted) {
        this.stalled = true;
        for (const queued of this.entries.values()) if (queued.state === "queued") queued.state = "failed";
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
};
function imageMime(data) {
  const signature = [...data.subarray(0, 12)].map((value) => String.fromCharCode(value)).join("");
  if (signature.startsWith("\x89PNG\r\n\n")) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/u.test(signature)) return "image/gif";
  if (signature.startsWith("RIFF") && signature.slice(8) === "WEBP") return "image/webp";
  if (signature.startsWith("BM")) return "image/bmp";
  if (signature.slice(4, 8) === "ftyp" && ["avif", "avis"].includes(signature.slice(8))) return "image/avif";
  const text = new TextDecoder().decode(data.subarray(0, 4096)).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/u.test(text)) return "image/svg+xml";
  return void 0;
}
function abortable(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then((value) => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

// client/markdown-preview.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var MARKDOWN_BODY = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown";
var en2 = { copy: "Copy", copied: "Copied", code: "Code", wrap: "Wrap", unwrap: "Unwrap", footnotes: "Footnotes", failed: "Some images could not be loaded in this session." };
var zh2 = { copy: "\u590D\u5236", copied: "\u5DF2\u590D\u5236", code: "\u4EE3\u7801", wrap: "\u81EA\u52A8\u6362\u884C", unwrap: "\u53D6\u6D88\u81EA\u52A8\u6362\u884C", footnotes: "\u811A\u6CE8", failed: "\u90E8\u5206\u56FE\u7247\u65E0\u6CD5\u5728\u6B64\u4F1A\u8BDD\u4E2D\u52A0\u8F7D\u3002" };
function mountSessionMarkdownImages(ctx) {
  const fiber = ctx.inject(["slots", "locale", "remote.workspaceFiles"], (scope6) => {
    if (typeof scope6.remote.workspaceFiles?.readBytes !== "function") return () => {
    };
    const readImageBytes = (sessionId, path2, options, signal) => scope6.remote.workspaceFiles.readBytes(sessionId, path2, options, signal);
    const dictionary = scope6.locale.register("sshRemoteMarkdown", { en: en2, zh: zh2 });
    try {
      const slot = scope6.slots.inject("sidebar.right.tab.document", () => scope6.slots.register({
        name: "sidebar.right.tab.document",
        key: MARKDOWN_BODY,
        priority: -100,
        locale: "sshRemoteMarkdown",
        inject: () => ({ readImageBytes })
      }, SessionMarkdownPreview));
      return () => {
        slot();
        dictionary();
      };
    } catch (error) {
      dictionary();
      throw error;
    }
  });
  return async () => {
    await fiber.dispose();
  };
}
function SessionMarkdownPreview(props) {
  const metadata = props.useResource(props.resourceAddress);
  const [source2, setSource] = (0, import_react4.useState)({ address: props.resourceAddress, version: metadata.value?.version, content: props.content, revision: 0 });
  let current = source2;
  if (source2.address !== props.resourceAddress || source2.version !== metadata.value?.version || source2.content !== props.content) {
    const append2 = source2.content.kind === "text" && props.content.kind === "text" && !source2.content.eof && props.content.text.startsWith(source2.content.text);
    current = {
      address: props.resourceAddress,
      version: metadata.value?.version,
      content: props.content,
      revision: source2.revision + (source2.address === props.resourceAddress && source2.version === metadata.value?.version && append2 ? 0 : 1)
    };
    setSource(current);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MarkdownImageBody, { ...props }, current.revision);
}
function MarkdownImageBody({ content, resourceAddress, readImageBytes, setResources, t: t2 }) {
  const [, render] = (0, import_react4.useReducer)((value) => value + 1, 0);
  const [cache, setCache] = (0, import_react4.useState)();
  (0, import_react4.useEffect)(() => {
    const dependencies = /* @__PURE__ */ new Set();
    setResources([]);
    const current = new SessionImageCache(resourceAddress, readImageBytes, render, (address) => {
      dependencies.add(address);
      setResources([...dependencies]);
    });
    setCache(current);
    return () => {
      current.dispose();
      setResources([]);
    };
  }, [resourceAddress, readImageBytes, setResources]);
  const requested = /* @__PURE__ */ new Map();
  const pathImages = { resolve: (value) => {
    const path2 = imageFilePath(value);
    if (path2 !== void 0 && requested.size < (cache?.limits.entries ?? 64) + 1) requested.set(path2, value);
    return cache?.get(value);
  } };
  (0, import_react4.useEffect)(() => {
    cache?.request(requested.values());
  });
  const labels4 = (0, import_react4.useMemo)(() => ({ code: {
    copyLabel: t2("copy"),
    copiedLabel: t2("copied"),
    toolbarLabels: { codeLabel: t2("code"), wrapLabel: t2("wrap"), unwrapLabel: t2("unwrap") }
  }, footnotes: t2("footnotes") }), [t2]);
  if (content.kind !== "text") return null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-document-markdown": true, style: { minWidth: 0, fontFamily: "var(--dsw-font,inherit)", whiteSpace: "normal", padding: "10px 12px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.MarkdownText, { text: content.text, streaming: !content.eof, labels: labels4, pathImages }),
    cache?.failed && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { role: "status", children: t2("failed") })
  ] });
}

// client/editor.tsx
var import_react5 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/presentation.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var panelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 16,
  height: "100%",
  overflow: "auto",
  minWidth: 0,
  fontSize: 13
};
var rowStyle = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0 };
var cardStyle = {
  display: "grid",
  gap: 10,
  padding: 12,
  minWidth: 0,
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: 10
};
var mutedStyle = { color: "var(--dsw-alias-label-secondary)", fontSize: 12, overflowWrap: "anywhere" };
function PanelHeader({ title, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("header", { style: { ...rowStyle, justifyContent: "space-between" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { style: { fontWeight: 600 }, children: title }),
    children && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: rowStyle, children })
  ] });
}

// client/editor-model.ts
var EditorModel = class {
  constructor(sessionId, remote, timeoutMs = 9e4) {
    __publicField(this, "sessionId", sessionId);
    __publicField(this, "remote", remote);
    __publicField(this, "timeoutMs", timeoutMs);
    __publicField(this, "state", { draft: "", message: "", reading: false, saving: false });
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "generation", 0);
    __publicField(this, "reader");
    __publicField(this, "attempt");
    __publicField(this, "confirmedAction");
    __publicField(this, "snapshot", () => this.state);
    __publicField(this, "subscribe", (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    });
  }
  get dirty() {
    return this.state.document !== void 0 && this.state.draft !== this.state.document.text;
  }
  get unsettled() {
    return this.state.saving || this.state.outcome === "pending" || this.state.outcome === "unknown";
  }
  get needsProtection() {
    return this.dirty || this.unsettled;
  }
  edit(text) {
    this.update({ draft: text, ...this.state.outcome === "saved" ? { message: text === this.state.document?.text ? t("\u5DF2\u4FDD\u5B58\u3002") : t("\u5C1A\u672A\u4FDD\u5B58\u3002") } : {} });
  }
  notice(message2) {
    this.update({ message: message2 });
  }
  requestOpen(path2) {
    if (this.unsettled) {
      this.notice(t("\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u5207\u6362\u6587\u4EF6\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002"));
      return;
    }
    if (this.dirty)
      this.ask("discard", () => {
        void this.open(path2, true);
      });
    else
      void this.open(path2);
  }
  requestClose(close) {
    if (!this.needsProtection)
      return true;
    this.ask("close", close);
    return false;
  }
  confirm(accept) {
    const action = this.confirmedAction;
    this.confirmedAction = void 0;
    this.update({ confirmation: void 0 });
    if (accept)
      action?.();
  }
  ask(confirmation, action) {
    this.confirmedAction = action;
    this.update({ confirmation });
  }
  async open(path2, discard = false) {
    if (this.unsettled) {
      this.notice(t("\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u5207\u6362\u6587\u4EF6\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002"));
      return;
    }
    if (this.dirty && !discard) {
      this.notice(t("\u8BF7\u5148\u4FDD\u5B58\uFF0C\u6216\u786E\u8BA4\u653E\u5F03\u5F53\u524D\u8349\u7A3F\u3002"));
      return;
    }
    this.reader?.abort();
    const reader = this.reader = new AbortController();
    const generation = ++this.generation;
    this.update({ reading: true, message: t("\u6B63\u5728\u8BFB\u53D6\u5B8C\u6574\u6587\u4EF6\u2026") });
    try {
      const result4 = await bounded2(this.remote.read(this.sessionId, path2, reader.signal), this.timeoutMs, () => reader.abort());
      if (reader.signal.aborted || generation !== this.generation)
        return;
      if (!result4.ok)
        throw new Error(result4.error.message);
      if (result4.value.sessionId !== this.sessionId)
        throw new Error(t("\u6587\u4EF6\u4F1A\u8BDD\u8EAB\u4EFD\u4E0D\u5339\u914D\uFF0C\u672A\u6253\u5F00\u3002"));
      this.attempt = void 0;
      this.update({
        document: result4.value,
        draft: result4.value.text,
        outcome: void 0,
        remoteText: void 0,
        message: t("\u624B\u52A8\u4FDD\u5B58\uFF1B\u8349\u7A3F\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u4E2D\u4FDD\u7559\u3002")
      });
    } catch (error) {
      if (generation === this.generation)
        this.notice(message(error));
    } finally {
      if (generation === this.generation)
        this.update({ reading: false });
    }
  }
  async save() {
    const document3 = this.state.document;
    if (!document3 || this.state.reading || this.unsettled || !this.dirty)
      return;
    const encoded = (document3.bom ? "\uFEFF" : "") + (document3.newline === "crlf" ? this.state.draft.replace(/\n/gu, "\r\n") : this.state.draft);
    if (new TextEncoder().encode(encoded).byteLength > document3.maxBytes) {
      this.update({ outcome: "failed", message: t("\u5185\u5BB9\u8D85\u8FC7 {value1} KiB\uFF0C\u672A\u53D1\u9001\u4FDD\u5B58\uFF1B\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002", { value1: document3.maxBytes / 1024 }) });
      return;
    }
    const attempt = this.attempt = { id: operationId(), text: this.state.draft, document: document3 };
    this.update({ saving: true, outcome: "pending", message: t("\u6B63\u5728\u4FDD\u5B58\u2026") });
    try {
      const result4 = await bounded2(this.remote.save(this.sessionId, {
        ...document3,
        text: attempt.text,
        operationId: attempt.id
      }), this.timeoutMs);
      if (!result4.ok) {
        const code = result4.error.code;
        if (code === "ssh-editor/refused" || code === "gateway/bad-request") {
          this.accept({ state: "failed", message: result4.error.message }, attempt);
          return;
        }
        throw new Error(result4.error.message);
      }
      this.accept(result4.value, attempt);
    } catch (error) {
      this.update({ outcome: "unknown", message: t("\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002{value1}", { value1: message(error) }) });
    } finally {
      this.update({ saving: false });
    }
  }
  async verify() {
    if (!this.attempt || this.state.saving)
      return;
    const attempt = this.attempt;
    const controller = new AbortController();
    this.update({ saving: true, message: t("\u6B63\u5728\u6838\u5BF9\u4FDD\u5B58\u56DE\u6267\u4E0E\u8FDC\u7AEF\u5185\u5BB9\u2026") });
    try {
      const result4 = await bounded2(this.remote.status(this.sessionId, attempt.id, controller.signal), this.timeoutMs, () => controller.abort());
      if (!result4.ok)
        throw new Error(result4.error.message);
      this.accept(result4.value, attempt);
    } catch (error) {
      this.notice(t("\u6838\u5BF9\u5931\u8D25\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002{value1}", { value1: message(error) }));
    } finally {
      this.update({ saving: false });
    }
  }
  async compare() {
    const document3 = this.state.document;
    if (!document3 || this.state.reading)
      return;
    const generation = this.generation;
    const controller = new AbortController();
    this.update({ reading: true });
    try {
      const result4 = await bounded2(this.remote.read(this.sessionId, document3.path, controller.signal), this.timeoutMs, () => controller.abort());
      if (generation !== this.generation)
        return;
      if (!result4.ok)
        throw new Error(result4.error.message);
      if (result4.value.rootUri !== document3.rootUri || result4.value.path !== document3.path || result4.value.sessionId !== this.sessionId) {
        throw new Error(t("\u6587\u4EF6\u8EAB\u4EFD\u5DF2\u6539\u53D8\uFF0C\u672A\u91C7\u7528\u8BE5\u5185\u5BB9\u3002"));
      }
      this.update({ remoteText: result4.value.text, message: t("\u4E0B\u65B9\u4E3A\u6700\u65B0\u8FDC\u7AEF\u5185\u5BB9\uFF1B\u4F60\u7684\u8349\u7A3F\u548C\u4FDD\u5B58\u57FA\u7EBF\u5C1A\u672A\u6539\u53D8\u3002") });
    } catch (error) {
      if (generation === this.generation)
        this.notice(message(error));
    } finally {
      if (generation === this.generation)
        this.update({ reading: false });
    }
  }
  dispose() {
    this.generation++;
    this.reader?.abort();
    this.listeners.clear();
  }
  accept(result4, attempt) {
    if (this.attempt !== attempt)
      return;
    if (result4.state === "saved" && result4.version) {
      this.update({
        document: { ...attempt.document, text: attempt.text, version: result4.version },
        outcome: "saved",
        remoteText: void 0,
        message: result4.message ?? t("\u5DF2\u4FDD\u5B58\u3002")
      });
    } else
      this.update({ outcome: result4.state, message: result4.message ?? (result4.state === "pending" ? t("\u4FDD\u5B58\u4ECD\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u6838\u5BF9\u3002") : t("\u4FDD\u5B58\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002")) });
  }
  update(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners)
      listener();
  }
};
function operationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function bounded2(promise, timeout, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(t("\u8BF7\u6C42\u8D85\u65F6\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002")));
    }, timeout);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// client/editor.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var KIND = "ssh-editor";
var ID = "dsh-ssh-remote.editor";
function mountRemoteEditor(ctx, bridge) {
  const fiber = ctx.inject(["remote.sshRemoteEditor", "remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope6) => {
    if (!scope6.sidebarRightTabs || !scope6.sidebarRight || typeof scope6.remote.sshRemoteEditor?.read !== "function")
      return () => {
      };
    const buffers = /* @__PURE__ */ new Map();
    const model = (sessionId) => {
      let buffer = buffers.get(sessionId);
      if (!buffer) {
        for (const [id2, existing] of buffers) {
          if (!existing.needsProtection && !existing.snapshot().reading && !scope6.sidebarRight.tabsIn(id2).some((tab) => tab.kind === KIND)) {
            existing.dispose();
            buffers.delete(id2);
          }
        }
        if (buffers.size >= 32)
          throw new Error(t("\u5DF2\u8FBE\u5230 32 \u4E2A\u4F1A\u8BDD\u7F16\u8F91\u7F13\u51B2\u4E0A\u9650\uFF1B\u8BF7\u5148\u4FDD\u5B58\u8349\u7A3F\u540E\u91CD\u542F\u3002"));
        buffer = new EditorModel(sessionId, scope6.remote.sshRemoteEditor);
        buffers.set(sessionId, buffer);
      }
      return buffer;
    };
    const unregister = scope6.sidebarRightTabs.register({
      id: ID,
      kind: KIND,
      keepMounted: true,
      title: () => t("\u8FDC\u7A0B\u7F16\u8F91"),
      guide: []
    });
    const openEditor = (sessionId, path2) => {
      if (scope6.sidebarRight.mounted.getSnapshot() !== sessionId)
        throw new Error(t("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u3002"));
      const buffer = model(sessionId);
      scope6.sidebarRight.openTab(KIND);
      buffer.requestOpen(path2);
    };
    if (bridge)
      bridge.open = openEditor;
    const confirmedClosures = /* @__PURE__ */ new Set();
    const close = scope6.sidebarRight.registerCloseHandler(KIND, (sessionId, tab) => {
      const key = `${sessionId}\0${tab.id}`;
      if (confirmedClosures.has(key))
        return;
      const buffer = buffers.get(sessionId);
      if (buffer && !buffer.requestClose(() => {
        confirmedClosures.add(key);
        try {
          scope6.sidebarRight.closeIn(sessionId, tab.id);
        } finally {
          confirmedClosures.delete(key);
        }
      })) {
        throw new Error(t("\u5DF2\u4FDD\u7559\u8349\u7A3F\uFF0C\u8BF7\u5728\u7F16\u8F91\u5668\u5185\u786E\u8BA4\u662F\u5426\u5173\u95ED\u3002"));
      }
    });
    const body = scope6.slots.inject("sidebar.right.pane.tab", () => scope6.slots.register({
      name: "sidebar.right.pane.tab",
      key: ID,
      inject: (sessionId) => ({ model: model(sessionId) })
    }, localized(RemoteEditorPane)));
    const title = scope6.slots.inject("sidebar.right.pane.tab.title", () => scope6.slots.register({
      name: "sidebar.right.pane.tab.title",
      key: ID,
      inject: (sessionId) => ({ model: model(sessionId) })
    }, localized(RemoteEditorTitle)));
    const menu = scope6.slots.inject("sidebar.right.tab.menu.item", () => scope6.slots.register({
      name: "sidebar.right.tab.menu.item",
      id: `${ID}.open`,
      inject: (sessionId) => ({
        workspaceInfo: scope6.remote.sshRemote.workspaceInfo,
        openEditor: (path2) => {
          openEditor(sessionId, path2);
        }
      })
    }, localized(RemoteEditMenu)));
    const protectUnload = (event) => {
      if (![...buffers.values()].some((buffer) => buffer.needsProtection))
        return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => {
      if (bridge?.open === openEditor)
        bridge.open = void 0;
      window.removeEventListener("beforeunload", protectUnload);
      menu();
      title();
      body();
      close();
      unregister();
      for (const buffer of buffers.values())
        buffer.dispose();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
function RemoteEditorPane({ model }) {
  const state = (0, import_react5.useSyncExternalStore)(model.subscribe, model.snapshot, model.snapshot);
  const [path2, setPath] = (0, import_react5.useState)("");
  (0, import_react5.useEffect)(() => {
    if (state.document)
      setPath(state.document.path);
  }, [state.document?.path]);
  const open = (target) => model.requestOpen(target);
  const document3 = state.document;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { "aria-label": t("\u8FDC\u7A0B\u6587\u672C\u7F16\u8F91\u5668"), style: panelStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Modal, { open: state.confirmation !== void 0, onClose: () => model.confirm(false), title: state.confirmation === "close" ? t("\u5173\u95ED\u8FDC\u7A0B\u7F16\u8F91\u9875\u7B7E\uFF1F") : t("\u653E\u5F03\u5F53\u524D\u8349\u7A3F\uFF1F"), closeLabel: t("\u53D6\u6D88"), description: state.confirmation === "close" ? t("\u8349\u7A3F\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u4E2D\u4FDD\u7559\uFF1B\u9000\u51FA\u5E94\u7528\u4F1A\u4E22\u5931\u3002\u5173\u95ED\u9875\u7B7E\u4E0D\u4F1A\u64A4\u9500\u5DF2\u53D1\u51FA\u7684\u4FDD\u5B58\u3002") : t("\u91CD\u65B0\u52A0\u8F7D\u6216\u5207\u6362\u6587\u4EF6\u4F1A\u653E\u5F03\u5F53\u524D\u672A\u4FDD\u5B58\u4FEE\u6539\uFF1B\u53EA\u6709\u5B8C\u6574\u8BFB\u53D6\u65B0\u6587\u4EF6\u6210\u529F\u540E\u624D\u66FF\u6362\u8349\u7A3F\u3002"), footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => model.confirm(false), children: t("\u4FDD\u7559\u8349\u7A3F") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => model.confirm(true), children: state.confirmation === "close" ? t("\u5173\u95ED\u9875\u7B7E") : t("\u653E\u5F03\u5E76\u6253\u5F00") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("form", { style: { display: "flex", gap: 6 }, onSubmit: (event) => {
      event.preventDefault();
      open(path2);
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Input, { "aria-label": t("\u8FDC\u7A0B\u6587\u4EF6\u8DEF\u5F84"), placeholder: t("\u5DE5\u4F5C\u533A\u5185\u7684\u6587\u4EF6\u8DEF\u5F84\uFF08\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\uFF09"), value: path2, style: { flex: 1, minWidth: 0 }, onChange: (event) => setPath(event.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { type: "submit", disabled: !path2 || state.reading || model.unsettled, children: t("\u6253\u5F00") })
    ] }),
    document3 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...rowStyle, fontSize: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "SSH \xB7 ",
          document3.alias
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.PathLabel, { path: document3.path, style: { flex: 1, minWidth: 0 } }),
        model.dirty && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "status", children: t("\u25CF \u672A\u4FDD\u5B58") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "primary", disabled: !model.dirty || state.reading || model.unsettled, onClick: () => void model.save(), children: t("\u4FDD\u5B58") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "ghost", disabled: state.reading || model.unsettled, onClick: () => open(document3.path), children: t("\u91CD\u65B0\u52A0\u8F7D") }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "ghost", disabled: state.reading || state.saving, onClick: () => void model.compare(), children: t("\u67E5\u770B\u8FDC\u7AEF\u7248\u672C") }),
        model.unsettled && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: state.saving, onClick: () => void model.verify(), children: t("\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("small", { children: [
        "UTF-8",
        document3.bom ? " BOM" : "",
        " \xB7 ",
        document3.newline.toUpperCase(),
        t("\xB7 \u6700\u5927"),
        document3.maxBytes / 1024,
        " KiB"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { "aria-label": t("\u8FDC\u7A0B\u6587\u4EF6\u5185\u5BB9"), spellCheck: false, value: state.draft, disabled: state.reading || state.saving, onChange: (event) => model.edit(event.target.value), onKeyDown: (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void model.save();
        }
      }, style: {
        flex: 1,
        minHeight: 180,
        resize: "none",
        padding: 10,
        tabSize: 4,
        whiteSpace: "pre",
        overflow: "auto",
        fontFamily: "ui-monospace,monospace",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--dsw-alias-label-primary)",
        background: "var(--dsw-alias-bg-layer-1)",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: 8
      } })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { role: ["conflict", "unknown", "failed"].includes(state.outcome ?? "") ? "alert" : "status", style: { fontSize: 12, overflowWrap: "anywhere" }, children: state.message || t("\u8F93\u5165\u8FDC\u7A0B\u6587\u672C\u6587\u4EF6\u8DEF\u5F84\uFF1B\u4EC5\u652F\u6301\u5DE5\u4F5C\u533A\u5185\u5B8C\u6574 UTF-8 \u6587\u672C\u3002\u4E0D\u81EA\u52A8\u4FDD\u5B58\u3002") }),
    state.remoteText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: t("\u6700\u65B0\u8FDC\u7AEF\u5185\u5BB9\uFF08\u53EA\u8BFB\uFF1B\u4E0A\u65B9\u4ECD\u662F\u4F60\u7684\u8349\u7A3F\uFF09") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { style: { maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }, children: state.remoteText })
    ] })
  ] });
}
function RemoteEditorTitle({ model }) {
  const state = (0, import_react5.useSyncExternalStore)(model.subscribe, model.snapshot, model.snapshot);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
    model.dirty ? "\u25CF " : "",
    state.document ? t("\u7F16\u8F91 \xB7 {value1}", { value1: state.document.path.split("/").pop() }) : t("\u8FDC\u7A0B\u7F16\u8F91")
  ] });
}
function RemoteEditMenu(props) {
  const file2 = parseFileAddress(props.tab.contentId);
  const cwd = props.useSessions((snapshot) => snapshot.byId[props.sessionId]?.cwd);
  const [remote, setRemote] = (0, import_react5.useState)();
  (0, import_react5.useEffect)(() => {
    let active = true;
    if (cwd)
      void props.workspaceInfo(cwd).then((result4) => {
        if (active)
          setRemote(result4.ok && result4.value ? cwd : void 0);
      }, () => {
      });
    return () => {
      active = false;
    };
  }, [cwd, props.workspaceInfo]);
  if (file2?.scope !== "session" || file2.sessionId !== props.sessionId || remote !== cwd || !cwd)
    return null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => {
    props.dismiss();
    props.openEditor(file2.path);
  }, children: t("\u7F16\u8F91\u8FDC\u7A0B\u6587\u672C") });
}

// client/quick-open.tsx
var import_react6 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime6 = require("react/jsx-runtime");
var KIND2 = "ssh-quick-open";
var ID2 = "dsh-ssh-remote.quick-open";
function safePreviewPath(path2) {
  if (!path2 || path2.length > 4096 || /[\\"\u0000-\u001f\u007f-\u009f]/u.test(path2) || path2.split("/").includes("..") || /^[a-z][a-z\d+.-]*:/iu.test(path2)) {
    throw new Error(t("\u6B64\u8DEF\u5F84\u65E0\u6CD5\u5B89\u5168\u8868\u793A\u4E3A DSH \u5F15\u7528\u6216\u9884\u89C8\u5730\u5740\uFF0C\u8BF7\u4F7F\u7528\u8FDC\u7A0B\u7EC8\u7AEF\uFF1B\u4E0D\u6539\u5199\u6587\u4EF6\u540D\u3002"));
  }
  return path2;
}
function mountQuickOpen(ctx, editor, workbench) {
  const fiber = ctx.inject(["remote.sshRemoteFiles", "remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope6) => {
    if (!scope6.sidebarRightTabs || typeof scope6.remote.sshRemoteFiles?.query !== "function")
      return () => {
      };
    const remote = scope6.remote.sshRemoteFiles;
    const pendingPreviews = /* @__PURE__ */ new Map();
    const open = async (sessionId, path2, editing, signal) => {
      signal.throwIfAborted();
      if (scope6.sidebarRight.mounted.getSnapshot() !== sessionId)
        throw new Error(t("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u3002"));
      safePreviewPath(path2);
      if (editing) {
        if (!editor.open)
          throw new Error(t("\u8FDC\u7A0B\u7F16\u8F91\u5668\u5C1A\u672A\u52A0\u8F7D\u3002"));
        editor.open(sessionId, path2);
      } else {
        pendingPreviews.get(sessionId)?.abort();
        const controller = new AbortController();
        pendingPreviews.set(sessionId, controller);
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        try {
          const result4 = await remote.preview(sessionId, path2, controller.signal);
          if (controller.signal.aborted)
            return;
          if (!result4.ok)
            throw new Error(result4.error.message);
          if (result4.value.sessionId !== sessionId || scope6.sidebarRight.mounted.getSnapshot() !== sessionId)
            throw new Error(t("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u672A\u6253\u5F00\u9884\u89C8\u3002"));
          safePreviewPath(result4.value.path);
          scope6.sidebarRight.openResourceIn(sessionId, sessionFileAddress(sessionId, result4.value.path));
        } finally {
          signal.removeEventListener("abort", abort);
          if (pendingPreviews.get(sessionId) === controller)
            pendingPreviews.delete(sessionId);
        }
      }
    };
    const body = mountWorkbenchSection(scope6, workbench, ID2, KIND2, "files", (props) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(QuickOpenPane, { ...props, remote, open: (path2, editing, signal) => open(props.sessionId, path2, editing, signal) }));
    const shortcuts = scope6.inject(["shortcuts"], (child) => child.shortcuts.register({
      id: "dsh-ssh-remote.quick-open",
      label: () => t("\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00"),
      aliases: ["SSH", "remote", "file"],
      defaults: {},
      regions: ["page", "editable"],
      modals: [],
      resolve: () => {
        const sessionId = scope6.sidebarRight.mounted.getSnapshot();
        if (!sessionId)
          return { status: "pass" };
        return { status: "handled", run: () => {
          if (scope6.sidebarRight.mounted.getSnapshot() === sessionId)
            openWorkbench(scope6, workbench, sessionId, "files");
        } };
      }
    }));
    return async () => {
      for (const controller of pendingPreviews.values())
        controller.abort();
      await shortcuts.dispose();
      body();
    };
  });
  const statusFiber = ctx.inject(["remote.sshRemoteFiles", "remote.sshRemote", "slots", "sessions", "inputTriggers"], (scope6) => {
    if (typeof scope6.remote.sshRemoteFiles?.status !== "function")
      return () => {
      };
    return scope6.slots.inject("conversation.input.dock", () => scope6.slots.register({
      name: "conversation.input.dock",
      id: `${ID2}.index-status`,
      order: 45,
      inject: (sessionId) => ({
        remote: scope6.remote.sshRemoteFiles,
        workspaceInfo: scope6.remote.sshRemote.workspaceInfo,
        controller: () => {
          const actx = scope6.sessions.scope(sessionId);
          return actx ? scope6.inputTriggers.sessionOf(actx) : void 0;
        }
      })
    }, localized(ReferenceIndexStatus)));
  });
  return async () => {
    await statusFiber.dispose();
    await fiber.dispose();
  };
}
function QuickOpenPane({ sessionId, remote, open, active = true }) {
  const visible = usePageVisible(active);
  const composing = (0, import_react6.useRef)(false);
  const listId = (0, import_react6.useId)();
  const [selected, setSelected] = (0, import_react6.useState)(-1);
  const list2 = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    list2.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const [query, setQuery] = (0, import_react6.useState)("");
  const [ignored, setIgnored] = (0, import_react6.useState)(false);
  const [revision, setRevision] = (0, import_react6.useState)(0);
  const [result4, setResult] = (0, import_react6.useState)();
  const [status2, setStatus] = (0, import_react6.useState)();
  const [pending, setPending] = (0, import_react6.useState)(false);
  const [error, setError] = (0, import_react6.useState)("");
  const queryKey = JSON.stringify([sessionId, query, ignored]);
  const lifetime = (0, import_react6.useRef)(new AbortController());
  (0, import_react6.useEffect)(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [sessionId]);
  (0, import_react6.useEffect)(() => {
    setQuery("");
    setIgnored(false);
    setResult(void 0);
    setStatus(void 0);
    setError("");
  }, [sessionId]);
  (0, import_react6.useEffect)(() => {
    if (!visible)
      return;
    const controller = new AbortController();
    let live = true;
    setPending(true);
    setError("");
    const timer = setTimeout(() => {
      void remote.query(sessionId, query, ignored, controller.signal).then((response) => {
        if (!live)
          return;
        if (!response.ok) {
          setError(response.error.message);
          return;
        }
        if (response.value.sessionId !== sessionId) {
          setError(t("\u4F1A\u8BDD\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u62D2\u7EDD\u663E\u793A\u7ED3\u679C\u3002"));
          return;
        }
        setResult({ key: queryKey, value: response.value });
        setStatus(response.value);
        setSelected(-1);
      }, (error2) => {
        if (live)
          setError(String(error2));
      }).finally(() => {
        if (live)
          setPending(false);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [sessionId, query, ignored, queryKey, revision, remote, visible]);
  (0, import_react6.useEffect)(() => {
    if (!pending || !visible)
      return;
    const controller = new AbortController();
    let live = true;
    let timer;
    const poll = async () => {
      try {
        const response = await remote.status(sessionId, ignored, controller.signal);
        if (live && response.ok)
          setStatus(response.value);
      } catch {
      }
      if (live)
        timer = setTimeout(poll, 750);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [pending, sessionId, ignored, remote, visible]);
  const refreshController = (0, import_react6.useRef)();
  (0, import_react6.useEffect)(() => () => refreshController.current?.abort(), [sessionId, ignored]);
  const refresh = async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const response = await remote.refresh(sessionId, ignored, controller.signal);
      if (controller.signal.aborted)
        return;
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setStatus(response.value);
      setRevision((n) => n + 1);
    } catch (error2) {
      if (!controller.signal.aborted)
        setError(String(error2));
    }
  };
  const choose = (path2, editing = false) => {
    try {
      safePreviewPath(path2);
      const signal = lifetime.current.signal;
      void Promise.resolve(open(path2, editing, signal)).catch((error2) => {
        if (!signal.aborted)
          setError(error2 instanceof Error ? error2.message : String(error2));
      });
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    }
  };
  const current = result4?.key === queryKey && result4.value.sessionId === sessionId ? result4.value : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { "aria-label": t("\u8FDC\u7A0B\u5FEB\u901F\u6253\u5F00"), style: panelStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("form", { onSubmit: (event) => {
      event.preventDefault();
      if (!composing.current) choose(query);
    }, style: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, minWidth: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        import_dsh_client_ui_primitives4.Input,
        {
          "aria-label": t("\u641C\u7D22\u8FDC\u7A0B\u6587\u4EF6"),
          role: "combobox",
          "aria-autocomplete": "list",
          "aria-expanded": Boolean(current?.candidates.length),
          "aria-controls": listId,
          "aria-activedescendant": selected >= 0 ? `${listId}-${selected}` : void 0,
          value: query,
          placeholder: t("\u6587\u4EF6\u540D\u6216\u5B8C\u6574\u8DEF\u5F84"),
          onCompositionStart: () => {
            composing.current = true;
          },
          onCompositionEnd: () => {
            composing.current = false;
          },
          onChange: (event) => {
            setQuery(event.target.value);
            setSelected(-1);
          },
          onKeyDown: (event) => {
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)
              return;
            const candidates = current?.candidates ?? [];
            if (event.key === "Escape") {
              event.preventDefault();
              setSelected(-1);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((index) => candidates.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length : -1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (!current)
                return;
              if (candidates.length) {
                const candidate = candidates[selected < 0 ? 0 : selected];
                if (candidate.kind === "directory")
                  setQuery(`${candidate.path}/`);
                else
                  choose(candidate.path);
              } else if (!pending && query)
                choose(query);
            }
          },
          style: { width: "100%", minWidth: 0 }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { type: "submit", disabled: !query, children: t("\u6309\u8DEF\u5F84\u9884\u89C8") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", gap: 10, alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Checkbox, { checked: ignored, onChange: setIgnored, label: t("\u5305\u542B\u5FFD\u7565\u9879") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { size: "sm", variant: "ghost", onClick: () => void refresh(), children: t("\u5237\u65B0\u7D22\u5F15") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { children: t("\u641C\u7D22\u5E2E\u52A9") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: t("\u65B9\u5411\u952E\u9009\u62E9\uFF0CEnter \u9884\u89C8\uFF0CEscape \u53D6\u6D88\u9009\u62E9\u3002\u9ED8\u8BA4\u53EA\u8BFB\uFF1B\u7F16\u8F91\u4FDD\u7559\u8349\u7A3F\u4FDD\u62A4\u3002\u5305\u542B\u5FFD\u7565\u9879\u4EC5\u5F71\u54CD\u672C\u6B21\u641C\u7D22\uFF0C\u4E0D\u6539\u53D8 @ \u8865\u5168\u3002") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { role: "status", style: { fontSize: 12, overflowWrap: "anywhere" }, children: [
      pending ? current ? t("\u6B63\u5728\u66F4\u65B0\uFF0C\u4EE5\u4E0B\u4E3A\u65E7\u7ED3\u679C\uFF08\u53EF\u80FD\u8FC7\u671F\uFF09\u2026") : t("\u6B63\u5728\u641C\u7D22\u8FDC\u7A0B\u6587\u4EF6\u2026") : status2?.state === "error" ? t("\u7D22\u5F15\u6682\u4E0D\u53EF\u7528") : "",
      !pending && status2?.stale && t(" \u7ED3\u679C\u5DF2\u8FC7\u671F\u3002"),
      !pending && status2 && t(" \u5DF2\u7D22\u5F15 {value1} \u9879{value2}", { value1: status2.count, value2: status2.complete ? "" : t("\uFF08\u7D22\u5F15\u4E0D\u5B8C\u6574\uFF0C\u672A\u547D\u4E2D\u4E0D\u4EE3\u8868\u4E0D\u5B58\u5728\uFF09") }),
      !pending && status2?.unsupported && !status2.message ? t(" \xB7 {value1} \u4E2A\u6587\u4EF6\u540D\u4E0D\u80FD\u5B89\u5168\u5F15\u7528\u6216\u9884\u89C8", { value1: status2.unsupported }) : ""
    ] }),
    !pending && status2?.message && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { children: t("\u7D22\u5F15\u8BE6\u60C5") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: status2.message })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)", overflowWrap: "anywhere" }, children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { ref: list2, id: listId, role: "listbox", "aria-label": t("\u8FDC\u7A0B\u6587\u4EF6\u641C\u7D22\u7ED3\u679C"), style: { flex: 1, minHeight: 100, overflow: "auto" }, children: current?.candidates.map((candidate, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { role: "option", id: `${listId}-${index}`, "aria-selected": selected === index, title: candidate.path, onClick: () => {
      setSelected(index);
      candidate.kind === "directory" ? setQuery(`${candidate.path}/`) : choose(candidate.path);
    }, style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer",
      padding: "10px 8px",
      borderRadius: 8,
      background: selected === index ? "var(--dsw-alias-bg-hover,rgba(128,128,128,.12))" : void 0
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { flexShrink: 0, display: "flex" }, children: candidate.kind === "directory" ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.FileTypeIcon, { kind: "folder", size: 18 }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.FileTypeIcon, { path: candidate.path, size: 18 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.PathLabel, { path: candidate.path, style: { flex: 1, minWidth: 0 } })
    ] }, candidate.path)) }),
    !pending && current?.candidates.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: status2?.complete ? t("\u5F53\u524D\u641C\u7D22\u6CA1\u6709\u5339\u914D\u9879\u3002") : t("\u6682\u672A\u53D1\u73B0\u5339\u914D\u9879\uFF1B\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u76F4\u63A5\u9884\u89C8\u3002") }),
    selected >= 0 && current?.candidates[selected]?.kind === "file" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.Button, { size: "sm", variant: "outline", onClick: () => choose(current.candidates[selected].path, true), children: t("\u7F16\u8F91") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives4.PathLabel, { path: current.candidates[selected].path, style: { fontSize: 12, flex: 1 } })
    ] })
  ] });
}
var IndexMenuRefresh = class {
  constructor() {
    __publicField(this, "generation", 0);
    __publicField(this, "stale", false);
  }
  update(status2, controller) {
    const changed = status2.generation !== this.generation || status2.stale && !this.stale;
    this.generation = status2.generation;
    this.stale = status2.stale;
    const menu = controller?.menu.getSnapshot();
    if (changed && menu?.open && menu.hit?.trigger === "@")
      controller?.refreshOpenMenu();
  }
};
function ReferenceIndexStatus(props) {
  const cwd = props.useSessions((s) => s.byId[props.sessionId]?.cwd);
  const trigger = props.controller();
  const menuOpen = (0, import_react6.useSyncExternalStore)((listener) => trigger?.menu.subscribe(listener) ?? (() => {
  }), () => {
    const menu = trigger?.menu.getSnapshot();
    return !!menu?.open && menu.hit?.trigger === "@";
  });
  const visible = usePageVisible(menuOpen);
  const [status2, setStatus] = (0, import_react6.useState)();
  const key = `${props.sessionId}\0${cwd ?? ""}`;
  const latest = (0, import_react6.useRef)(props);
  latest.current = props;
  (0, import_react6.useEffect)(() => {
    if (!cwd || !visible)
      return;
    let active = true;
    let timer;
    const controller = new AbortController(), refresh = new IndexMenuRefresh();
    const poll = async () => {
      try {
        const response = await latest.current.remote.status(props.sessionId, false, controller.signal);
        if (!active)
          return;
        if (response.ok) {
          setStatus({ key, value: response.value });
          refresh.update(response.value, trigger);
        }
      } catch {
      }
      if (active)
        timer = setTimeout(poll, 750);
    };
    void latest.current.workspaceInfo(cwd).then((response) => {
      if (active && response.ok && response.value)
        void poll();
    }, () => {
    });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, cwd, visible, trigger]);
  if (!visible || status2?.key !== key || !["building", "error", "partial"].includes(status2.value.state))
    return null;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { role: "status", style: { display: "block", overflowWrap: "anywhere", padding: "4px 0", color: "var(--dsw-alias-label-secondary)" }, children: status2.value.message });
}

// client/port-forwards.tsx
var import_react7 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/port-forward-model.ts
var PortForwardModel = class {
  constructor(sessionId, remote) {
    __publicField(this, "sessionId", sessionId);
    __publicField(this, "remote", remote);
    __publicField(this, "state", { error: "", listError: "", busy: /* @__PURE__ */ new Set() });
    __publicField(this, "stoppedRequests", /* @__PURE__ */ new Set());
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "reader");
    __publicField(this, "timer");
    __publicField(this, "disposed", false);
    __publicField(this, "visible", true);
    __publicField(this, "revision", 0);
    __publicField(this, "snapshot", () => this.state);
    __publicField(this, "subscribe", (fn) => {
      this.listeners.add(fn);
      return () => {
        this.listeners.delete(fn);
      };
    });
  }
  update(patch) {
    if (this.disposed)
      return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners)
      fn();
  }
  setVisible(visible) {
    this.visible = visible;
    if (visible)
      void this.refresh();
    else {
      clearTimeout(this.timer);
      this.reader?.abort();
    }
  }
  async refresh() {
    if (this.disposed || !this.visible)
      return;
    clearTimeout(this.timer);
    this.reader?.abort();
    const reader = this.reader = new AbortController(), revision = this.revision;
    try {
      const result4 = await deadline(this.remote.list(this.sessionId, reader.signal), 8e3);
      if (reader.signal.aborted || this.reader !== reader || revision !== this.revision)
        return;
      if (!result4.ok) {
        this.update({ listError: result4.error.message });
        return;
      }
      const found = this.state.pending && result4.value.items.some((row) => row.id === this.state.pending.id);
      this.update({ list: result4.value, listError: "", ...found ? { pending: void 0, error: "" } : {} });
    } catch (error) {
      if (!reader.signal.aborted && this.reader === reader && revision === this.revision) {
        this.update({ listError: error instanceof Error && error.message === "timeout" ? t("\u72B6\u6001\u5237\u65B0\u8D85\u65F6\uFF1B\u663E\u793A\u7684\u662F\u4E0A\u6B21\u72B6\u6001\uFF0C\u4E0D\u80FD\u636E\u6B64\u5224\u65AD\u8F6C\u53D1\u4ECD\u5728\u8FD0\u884C\u3002") : String(error) });
      }
    } finally {
      reader.abort();
      if (!this.disposed && this.visible && this.reader === reader)
        this.timer = setTimeout(() => void this.refresh(), 1500);
    }
  }
  async create(input2) {
    if (this.state.pending)
      return;
    const request2 = { ...input2, id: crypto.randomUUID() };
    this.revision++;
    this.update({ pending: request2, error: "" });
    try {
      const result4 = await deadline(this.remote.create(this.sessionId, request2), 8e3);
      if (this.stoppedRequests.has(request2.id))
        return;
      if (!result4.ok) {
        this.update({ error: result4.error.message, ...result4.error.code === "ssh-ports/refused" ? { pending: void 0 } : {} });
        return;
      }
      this.put(result4.value);
      this.update({ pending: void 0 });
    } catch {
      if (!this.stoppedRequests.has(request2.id))
        this.update({ error: t("\u521B\u5EFA\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1B\u5C06\u4ECE\u5217\u8868\u6838\u5BF9\u3002\u53EF\u505C\u6B62\u6B64\u8BF7\u6C42\uFF0C\u4E0D\u8981\u91CD\u590D\u521B\u5EFA\u3002") });
    } finally {
      this.revision++;
      void this.refresh();
    }
  }
  async stop(id2) {
    if (this.state.busy.has(id2))
      return;
    this.stoppedRequests.add(id2);
    this.revision++;
    this.update({ error: "", busy: /* @__PURE__ */ new Set([...this.state.busy, id2]) });
    try {
      const result4 = await deadline(this.remote.stop(this.sessionId, id2), 15e3);
      if (!result4.ok) {
        this.update({ error: result4.error.message });
        return;
      }
      this.put(result4.value);
      if (this.state.pending?.id === id2 && result4.value.state === "stopped")
        this.update({ pending: void 0 });
    } catch {
      this.update({ error: t("\u505C\u6B62\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8FDE\uFF0C\u8BF7\u5237\u65B0\u72B6\u6001\u6216\u518D\u6B21\u505C\u6B62\u3002") });
    } finally {
      this.revision++;
      const busy = new Set(this.state.busy);
      busy.delete(id2);
      this.update({ busy });
      void this.refresh();
    }
  }
  async probe(id2) {
    this.revision++;
    try {
      const result4 = await deadline(this.remote.probe(this.sessionId, id2), 8e3);
      if (result4.ok)
        this.put(result4.value);
      else
        this.update({ error: result4.error.message });
    } catch {
      this.update({ error: t("\u8FDC\u7AEF\u7AEF\u53E3\u68C0\u67E5\u6682\u4E0D\u53EF\u7528\u3002") });
    } finally {
      this.revision++;
      void this.refresh();
    }
  }
  put(row) {
    if (!this.state.list || !row.localPort)
      return;
    if (this.stoppedRequests.has(row.id) && !["stopped", "stopping"].includes(row.state))
      return;
    this.update({ list: { ...this.state.list, items: [row, ...this.state.list.items.filter((item) => item.id !== row.id)] } });
  }
  dispose() {
    this.disposed = true;
    this.reader?.abort();
    clearTimeout(this.timer);
    this.listeners.clear();
  }
};
async function deadline(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
function browserIsOnHost(location) {
  return location.protocol === "dsh-app:";
}
function forwardUrl(row) {
  if (!["http", "https"].includes(row.protocol) || !Number.isInteger(row.localPort) || row.localPort < 1024 || row.localPort > 65535)
    throw new Error(t("\u65E0\u6548\u8F6C\u53D1\u5730\u5740\u3002"));
  return `${row.protocol}://127.0.0.1:${row.localPort}/`;
}

// client/port-forwards.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var ID3 = "dsh-ssh-remote.ports";
function mountPortForwards(ctx, workbench) {
  const fiber = ctx.inject(["remote.sshRemotePorts", "slots", "sidebarRight", "sidebarRightTabs"], (scope6) => {
    if (!scope6.sidebarRightTabs || typeof scope6.remote.sshRemotePorts?.list !== "function")
      return () => {
      };
    const remote = scope6.remote.sshRemotePorts;
    return mountWorkbenchSection(scope6, workbench, ID3, "ssh-ports", "ports", (props) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PortForwardPane, { ...props, remote }));
  });
  return async () => {
    await fiber.dispose();
  };
}
var labels = () => ({ starting: t("\u6B63\u5728\u8FDE\u63A5"), listening: t("\u672C\u673A\u76D1\u542C\u5DF2\u5EFA\u7ACB"), stopping: t("\u6B63\u5728\u505C\u6B62"), stopped: t("\u5DF2\u505C\u6B62"), error: t("\u8F6C\u53D1\u5931\u8D25") });
function PortForwardPane({ sessionId, remote, active = true }) {
  const visible = usePageVisible(active);
  const model = (0, import_react7.useMemo)(() => new PortForwardModel(sessionId, remote), [sessionId, remote]);
  const state = (0, import_react7.useSyncExternalStore)(model.subscribe, model.snapshot, model.snapshot);
  const [creating, setCreating] = (0, import_react7.useState)(false);
  const [local, setLocal] = (0, import_react7.useState)("16006"), [target, setTarget] = (0, import_react7.useState)("6006");
  const [protocol, setProtocol] = (0, import_react7.useState)("http");
  const [notice, setNotice] = (0, import_react7.useState)("");
  const [confirmedHost, setConfirmedHost] = (0, import_react7.useState)("");
  (0, import_react7.useEffect)(() => () => model.dispose(), [model]);
  (0, import_react7.useEffect)(() => {
    model.setVisible(visible);
  }, [model, visible]);
  const nativeHost = browserIsOnHost(window.location);
  const sameHost = nativeHost || !!state.list?.host && confirmedHost === state.list.host;
  const needsBrowser = state.list?.items.some((row) => row.state === "listening");
  const valid = /^\d+$/u.test(local) && /^\d+$/u.test(target) && Number(local) >= 1024 && Number(local) <= 65535 && Number(target) >= 1 && Number(target) <= 65535;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { "aria-label": t("SSH \u7AEF\u53E3\u8F6C\u53D1"), style: panelStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(PanelHeader, { title: t("\u7AEF\u53E3\u8F6C\u53D1"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "ghost", onClick: () => void model.refresh(), children: t("\u5237\u65B0\u8F6C\u53D1\u72B6\u6001") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "primary", "aria-expanded": creating, onClick: () => setCreating(!creating), children: creating ? t("\u6536\u8D77") : t("\u65B0\u5EFA\u8F6C\u53D1") })
    ] }),
    creating && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("form", { onSubmit: (event) => {
      event.preventDefault();
      if (valid)
        void model.create({ localPort: Number(local), remotePort: Number(target), protocol });
    }, style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, alignItems: "end" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { display: "grid", gap: 4, minWidth: 0 }, children: [
        t("\u672C\u673A\u7AEF\u53E3"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Input, { style: { width: "100%", minWidth: 0 }, "aria-label": t("\u8F6C\u53D1\u672C\u673A\u7AEF\u53E3"), inputMode: "numeric", value: local, onChange: (e) => setLocal(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { display: "grid", gap: 4, minWidth: 0 }, children: [
        t("\u8FDC\u7AEF\u7AEF\u53E3"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Input, { style: { width: "100%", minWidth: 0 }, "aria-label": t("\u8F6C\u53D1\u8FDC\u7AEF\u7AEF\u53E3"), inputMode: "numeric", value: target, onChange: (e) => setTarget(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { style: { display: "grid", gap: 4 }, children: [
        t("\u6253\u5F00\u534F\u8BAE"),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { style: { minHeight: 32 }, "aria-label": t("\u8F6C\u53D1\u6253\u5F00\u534F\u8BAE"), value: protocol, onChange: (e) => setProtocol(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "http", children: "HTTP" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "https", children: "HTTPS" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "primary", type: "submit", disabled: !valid || !state.list?.supported || !!state.pending, children: t("\u5EFA\u7ACB\u8F6C\u53D1") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("summary", { children: t("\u8F6C\u53D1\u8BF4\u660E") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("small", { children: [
        t("\u672C\u673A\u6307 DSH \u5BBF\u4E3B"),
        state.list?.host ?? "",
        t("\u3002\u4EC5\u76D1\u542C\u5BBF\u4E3B 127.0.0.1\uFF0C\u76EE\u6807\u4E5F\u662F\u8BE5 SSH \u4E3B\u673A\u7684 127.0.0.1\uFF1B\u4E0D\u81EA\u52A8\u542F\u52A8\u8FDC\u7AEF\u670D\u52A1\u3002\u5173\u95ED\u9762\u677F\u4E0D\u505C\u6B62\u8F6C\u53D1\uFF1B\u624B\u52A8\u505C\u6B62\u3001\u63D2\u4EF6\u5378\u8F7D\u6216\u9000\u51FA\u65F6\u91CA\u653E\u3002\u65AD\u7EBF\u4E0D\u81EA\u52A8\u91CD\u8FDE\u3002")
      ] })
    ] }),
    !nativeHost && state.list && needsBrowser && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Checkbox, { checked: sameHost, onChange: (checked) => setConfirmedHost(checked ? state.list.host : ""), label: t("\u6211\u786E\u8BA4\u6D4F\u89C8\u5668\u5C31\u5728 DSH \u5BBF\u4E3B {value1} \u4E0A\uFF08\u4EC5\u542F\u7528\u6253\u5F00\u7F51\u9875\uFF0C\u4E0D\u6539\u53D8\u76D1\u542C\u8303\u56F4\uFF09", { value1: state.list.host }) }),
    !sameHost && needsBrowser && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { role: "note", children: t("\u786E\u8BA4\u6D4F\u89C8\u5668\u4F4D\u4E8E DSH \u5BBF\u4E3B\u540E\u624D\u53EF\u6253\u5F00\u7F51\u9875\uFF1B\u5426\u5219\u8BF7\u590D\u5236\u5730\u5740\u5230\u5BBF\u4E3B\u6D4F\u89C8\u5668\u3002") }),
    state.list && !state.list.supported && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "alert", children: t("\u9996\u7248\u7AEF\u53E3\u8F6C\u53D1\u53EA\u652F\u6301 macOS / Linux DSH Host\u3002") }),
    [state.error, state.listError].filter(Boolean).map((message2) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "alert", style: { overflowWrap: "anywhere" }, children: message2 }, message2)),
    notice && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "status", children: notice }),
    state.pending && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "status", children: [
      t("\u8BF7\u6C42"),
      state.pending.localPort,
      " \u2192 ",
      state.pending.remotePort,
      t("\u6B63\u5728\u5EFA\u7ACB\u6216\u7B49\u5F85\u786E\u8BA4\u3002"),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { onClick: () => void model.stop(state.pending.id), children: t("\u505C\u6B62\u6B64\u8BF7\u6C42") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "list", "aria-label": t("\u672C\u5DE5\u4F5C\u533A\u7684\u7AEF\u53E3\u8F6C\u53D1"), style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
      state.list?.items.map((row) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("article", { role: "listitem", style: { ...cardStyle, overflowWrap: "anywhere" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("strong", { children: [
            "127.0.0.1:",
            row.localPort,
            " \u2192 :",
            row.remotePort
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { role: "status", children: labels()[row.state] })
        ] }),
        row.state === "listening" && row.probe.state !== "reachable" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: row.probe.state === "unreachable" ? t("\u8FDC\u7AEF\u7AEF\u53E3\u6682\u4E0D\u53EF\u8FBE\uFF0C\u8BF7\u786E\u8BA4\u670D\u52A1\u5DF2\u542F\u52A8\u3002") : t("\u8FDC\u7AEF\u7AEF\u53E3\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\u3002") }),
          row.probe.message && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("summary", { children: t("\u68C0\u67E5\u8BE6\u60C5") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: row.probe.message })
          ] })
        ] }),
        row.error && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "alert", children: row.error }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }, children: [
          row.state === "listening" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            sameHost ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("a", { href: forwardUrl(row), target: "_blank", rel: "noopener noreferrer", "aria-label": t("\u6253\u5F00\u8F6C\u53D1\u7F51\u9875 {value1}", { value1: row.localPort }), children: t("\u6253\u5F00\u7F51\u9875") }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { disabled: true, children: t("\u6253\u5F00\u7F51\u9875") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "ghost", onClick: () => void (0, import_dsh_client_ui_primitives5.writeClipboard)(forwardUrl(row)).then((ok) => setNotice(ok ? t("\u5DF2\u590D\u5236 DSH \u5BBF\u4E3B\u7684\u56DE\u73AF\u5730\u5740\u3002") : t("\u8BF7\u590D\u5236\uFF1A{value1}", { value1: forwardUrl(row) }))), children: t("\u590D\u5236\u5730\u5740") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", variant: "ghost", onClick: () => void model.probe(row.id), children: t("\u68C0\u67E5\u8FDC\u7AEF\u7AEF\u53E3") })
          ] }),
          row.state !== "stopped" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", disabled: state.busy.has(row.id), onClick: () => void model.stop(row.id), children: t("\u505C\u6B62") }),
          row.canRetry && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives5.Button, { size: "sm", disabled: !!state.pending, onClick: () => void model.create({ localPort: row.localPort, remotePort: row.remotePort, protocol: row.protocol }), children: t("\u91CD\u65B0\u5EFA\u7ACB") })
        ] })
      ] }, row.id)),
      state.list?.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t("\u6B64\u5DE5\u4F5C\u533A\u5C1A\u672A\u5EFA\u7ACB\u8F6C\u53D1\u3002") })
    ] })
  ] });
}

// client/transfers.tsx
var import_react8 = require("react");
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");

// node_modules/@noble/hashes/_u64.js
var fromNumH = (n) => n / 2 ** 32 | 0;
var fromNumL = (n) => n >>> 0;
function setU64FromNum(view3, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view3.setUint32(byteOffset, isLE ? l : h, isLE);
  view3.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}

// node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes2 = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes2 ? `length=${value.length}` : `type=${typeof value}`;
  const message2 = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes2)
    throw new TypeError(message2);
  throw new RangeError(message2);
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes2) {
  abytes(bytes2);
  if (hasHexBuiltin)
    return bytes2.toHex();
  let hex = "";
  for (let i = 0; i < bytes2.length; i++) {
    hex += hexes[bytes2[i]];
  }
  return hex;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  constructor(blockLen, outputLen, padOffset, isLE) {
    __publicField(this, "blockLen");
    __publicField(this, "outputLen");
    __publicField(this, "canXOF", false);
    __publicField(this, "padOffset");
    __publicField(this, "isLE");
    // For partial updates less than block size
    __publicField(this, "buffer");
    __publicField(this, "view");
    __publicField(this, "finished", false);
    __publicField(this, "length", 0);
    __publicField(this, "pos", 0);
    __publicField(this, "destroyed", false);
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view: view3, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view3, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view: view3, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view3, 0);
      buffer.fill(0);
    }
    setU64FromNum(view3, blockLen - 8, this.length * 8, isLE);
    this.process(view3, 0);
    this.roundClean();
    const oview = out === buffer ? view3 : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and makes sha256 3x slower (measured).
    __publicField(this, "A", 0);
    __publicField(this, "B", 0);
    __publicField(this, "C", 0);
    __publicField(this, "D", 0);
    __publicField(this, "E", 0);
    __publicField(this, "F", 0);
    __publicField(this, "G", 0);
    __publicField(this, "H", 0);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to || (to = new this.constructor())).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view3, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view3.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// client/transfer-local.ts
var BYTE_LIMIT = 2 ** 40;
var CHUNK_BYTES = 256 * 1024;
var BLOCK_BYTES = 4 * 1024 * 1024;
var absent = (error) => error?.name === "NotFoundError";
var excludes = /* @__PURE__ */ new Set([".git", ".ssh", ".aws", ".azure", ".gnupg", ".venv", "venv", "node_modules", "__pycache__", "build", "dist"]);
var excludedPath = (path2) => path2.split("/").some((name2) => excludes.has(name2) || name2.startsWith(".env") || ["id_rsa", "id_ed25519"].includes(name2) || /\.(pem|key)$/u.test(name2) || name2.startsWith(".dsh-transfer-"));
var hexHash = (bytes2) => bytesToHex(sha256(bytes2));
async function readLocalChunk(file2, offset, signal) {
  if (!Number.isSafeInteger(file2.size) || file2.size < 0 || file2.size > BYTE_LIMIT || !Number.isSafeInteger(offset) || offset < 0 || offset > file2.size)
    throw new Error(t("\u5206\u5757\u504F\u79FB\u8D85\u51FA 1 TiB / \u6574\u6570\u8FB9\u754C\u3002"));
  signal.throwIfAborted();
  const bytes2 = new Uint8Array(await file2.slice(offset, Math.min(file2.size, offset + CHUNK_BYTES)).arrayBuffer());
  signal.throwIfAborted();
  if (bytes2.length !== Math.min(CHUNK_BYTES, file2.size - offset))
    throw new Error(t("\u6E90\u6587\u4EF6\u5206\u5757\u957F\u5EA6\u53D1\u751F\u53D8\u5316\u3002"));
  return bytes2;
}
function localPath(path2) {
  const parts = path2.split("/");
  if (!path2 || path2.length > 4096 || /[\x00-\x1f\x7f\\]/u.test(path2) || parts.some((p) => !p || p === "." || p === ".." || new TextEncoder().encode(p).length > 255))
    throw new Error(t("\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u540D\u6216\u76F8\u5BF9\u8DEF\u5F84\u3002"));
  return parts;
}
async function hashFile(file2, signal, progress = () => {
}) {
  if (!Number.isSafeInteger(file2.size) || file2.size > BYTE_LIMIT)
    throw new Error(t("\u5355\u6587\u4EF6\u8D85\u8FC7 1 TiB\u3002"));
  const hash = sha256.create();
  for (let offset = 0; offset < file2.size; offset += CHUNK_BYTES) {
    signal.throwIfAborted();
    hash.update(await readLocalChunk(file2, offset, signal));
    progress(Math.min(file2.size, offset + CHUNK_BYTES));
  }
  signal.throwIfAborted();
  return bytesToHex(hash.digest());
}
function validateLocalManifest(files) {
  if (files.length > 1e4)
    throw new Error(t("\u6BCF\u6279\u6700\u591A 10,000 \u4E2A\u6587\u4EF6/\u76EE\u5F55\u9879\u3002"));
  let total = 0, paths = 0;
  const seen = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Map();
  for (const { entry: entry2 } of files) {
    localPath(entry2.path);
    const key = entry2.path.normalize("NFC").toUpperCase().toLowerCase();
    if (seen.has(key))
      throw new Error(t("\u6E05\u5355\u542B\u5927\u5C0F\u5199\u6216 Unicode \u51B2\u7A81\uFF0C\u672A\u9759\u9ED8\u6539\u540D\u3002"));
    seen.add(key);
    const components = entry2.path.split("/");
    for (let i = 1; i <= components.length; i++) {
      const path2 = components.slice(0, i).join("/"), nameKey = path2.normalize("NFC").toUpperCase().toLowerCase();
      if (names.has(nameKey) && names.get(nameKey) !== path2)
        throw new Error(t("\u6E05\u5355\u7684\u7236\u76EE\u5F55\u5B58\u5728\u5927\u5C0F\u5199\u6216 Unicode \u51B2\u7A81\u3002"));
      names.set(nameKey, path2);
    }
    paths += new TextEncoder().encode(entry2.path).length;
    if (entry2.kind === "file") {
      if (!Number.isSafeInteger(entry2.size) || entry2.size < 0 || entry2.size > BYTE_LIMIT)
        throw new Error(t("\u5355\u6587\u4EF6\u8D85\u8FC7 1 TiB\u3002"));
      total += entry2.size;
    }
  }
  if (total > BYTE_LIMIT || paths > 8 * 1024 * 1024)
    throw new Error(t("\u5355\u6279\u8D85\u8FC7 1 TiB \u6216\u8DEF\u5F84\u6E05\u5355\u8D85\u8FC7 8 MiB\u3002"));
}
function selectedFiles(files) {
  const result4 = [...files].map((file2) => {
    const path2 = file2.webkitRelativePath || file2.name;
    return { entry: excludedPath(path2) ? { path: path2, kind: "excluded", reason: t("\u51ED\u636E\u6216\u6784\u5EFA\u7F13\u5B58\uFF0C\u9ED8\u8BA4\u6392\u9664") } : { path: path2, kind: "file", size: file2.size }, getFile: async () => file2 };
  });
  validateLocalManifest(result4);
  return result4;
}
async function directoryFiles(root) {
  const result4 = [];
  const add = (value) => {
    result4.push(value);
    if (result4.length > 1e4)
      throw new Error(t("\u76EE\u5F55\u8D85\u8FC7 10,000 \u9879\u3002"));
  };
  async function walk(directory, prefix) {
    for await (const [name2, handle] of directory.entries()) {
      const path2 = `${prefix}/${name2}`;
      localPath(path2);
      if (excludedPath(path2)) {
        add({ entry: { path: path2, kind: "excluded", reason: t("\u51ED\u636E\u6216\u6784\u5EFA\u7F13\u5B58\uFF0C\u9ED8\u8BA4\u6392\u9664") }, getFile: async () => {
          throw new Error(t("\u6392\u9664\u9879"));
        } });
        continue;
      }
      if (handle.kind === "directory") {
        add({ entry: { path: path2, kind: "directory" }, getFile: async () => {
          throw new Error(t("\u76EE\u5F55\u4E0D\u662F\u6587\u4EF6"));
        } });
        await walk(handle, path2);
      } else {
        const file2 = await handle.getFile();
        add({ entry: { path: path2, kind: "file", size: file2.size }, getFile: () => handle.getFile() });
      }
    }
  }
  add({ entry: { path: root.name, kind: "directory" }, getFile: async () => {
    throw new Error(t("\u76EE\u5F55\u4E0D\u662F\u6587\u4EF6"));
  } });
  await walk(root, root.name);
  validateLocalManifest(result4);
  return result4;
}
function canPickLocalDirectory() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}
async function pickLocalDirectory(mode) {
  const pick2 = window.showDirectoryPicker;
  if (!pick2)
    throw new Error(t("\u6B64\u6D4F\u89C8\u5668\u7F3A\u5C11\u76EE\u5F55\u8BFB\u5199\u6388\u6743\u80FD\u529B\uFF1B\u8BF7\u4F7F\u7528\u652F\u6301 File System Access \u7684 Desktop/Chromium\uFF0C\u4E0D\u4F1A\u6539\u5B58\u5230 DSH \u5BBF\u4E3B\u3002"));
  return pick2.call(window, { mode });
}
async function exactName(directory, name2) {
  let count = 0;
  for await (const [existing] of directory.entries()) {
    if (++count > 1e4)
      throw new Error(t("\u672C\u5730\u76EE\u6807\u76EE\u5F55\u8D85\u8FC7\u5B89\u5168\u679A\u4E3E\u9884\u7B97\u3002"));
    if (existing !== name2 && existing.normalize("NFC").toUpperCase().toLowerCase() === name2.normalize("NFC").toUpperCase().toLowerCase())
      throw new Error(t("\u672C\u5730\u540D\u79F0\u51B2\u7A81\uFF1A{value1} / {value2}", { value1: existing, value2: name2 }));
  }
}
async function localDirectory(root, path2, create = true) {
  let directory = root;
  for (const name2 of path2 ? localPath(path2) : []) {
    await exactName(directory, name2);
    directory = await directory.getDirectoryHandle(name2, { create });
  }
  return directory;
}
async function jsonFile(dir, name2) {
  const file2 = await (await dir.getFileHandle(name2)).getFile();
  if (file2.size > 32768)
    throw new Error(t("\u672C\u5730\u7EED\u4F20\u6E05\u5355\u8FC7\u5927\u3002"));
  return JSON.parse(await file2.text());
}
async function putJson(dir, name2, value) {
  const stream = await (await dir.getFileHandle(name2, { create: true })).createWritable({ mode: "exclusive" });
  try {
    await stream.write(JSON.stringify(value));
    await stream.close();
  } catch (error) {
    await stream.abort().catch(() => {
    });
    throw error;
  }
}
async function ownedStaging(root, job2, create) {
  const name2 = ".dsh-transfer-" + job2.id;
  let directory;
  try {
    directory = await root.getDirectoryHandle(name2);
  } catch (error) {
    if (!absent(error) || !create)
      throw error;
    directory = await root.getDirectoryHandle(name2, { create: true });
    await putJson(directory, "owner.json", { schema: 1, id: job2.id, nonce: job2.nonce, destination: crypto.randomUUID() });
  }
  const owner = await jsonFile(directory, "owner.json");
  if (owner.schema !== 1 || owner.id !== job2.id || owner.nonce !== job2.nonce || job2.destination && owner.destination !== job2.destination)
    throw new Error(t("\u6682\u5B58\u76EE\u5F55\u4E0D\u5C5E\u4E8E\u6B64\u4EFB\u52A1\uFF0C\u672A\u8BFB\u53D6\u6216\u5220\u9664\u3002"));
  return directory;
}
async function bindDownloadDirectory(root, job2) {
  let directory;
  try {
    directory = await ownedStaging(root, job2, !job2.destination && job2.state === "ready");
  } catch (error) {
    if (absent(error))
      throw new Error(t("\u8BF7\u9009\u62E9\u6700\u521D\u6388\u6743\u7684\u4E0B\u8F7D\u76EE\u5F55\uFF1B\u6B64\u5904\u6CA1\u6709\u539F\u4EFB\u52A1\u7684\u76EE\u5F55\u7ED1\u5B9A\u3002"));
    throw error;
  }
  const owner = await jsonFile(directory, "owner.json");
  if (!owner.destination) {
    owner.destination = crypto.randomUUID();
    await putJson(directory, "owner.json", owner);
  }
  if (!/^[a-zA-Z0-9-]{16,80}$/u.test(owner.destination))
    throw new Error(t("\u4E0B\u8F7D\u76EE\u5F55\u7ED1\u5B9A\u65E0\u6548\u3002"));
  return owner.destination;
}
function downloadPath(job2, file2) {
  const parent = job2.sources ? "" : job2.target.includes("/") ? job2.target.slice(0, job2.target.lastIndexOf("/") + 1) : "";
  const result4 = file2.path.startsWith(parent) ? file2.path.slice(parent.length) : file2.path;
  localPath(result4);
  return result4;
}
var DownloadStaging = class _DownloadStaging {
  constructor(directory, state, destination, name2) {
    __publicField(this, "directory", directory);
    __publicField(this, "state", state);
    __publicField(this, "destination", destination);
    __publicField(this, "name", name2);
    __publicField(this, "hash", sha256.create());
    __publicField(this, "pending", []);
    __publicField(this, "pendingBytes", 0);
  }
  static async open(root, job2, file2, replace, signal) {
    let directory;
    try {
      const stage = await ownedStaging(root, job2, !job2.destination && file2.offset === 0);
      directory = await stage.getDirectoryHandle("file-" + file2.index, { create: file2.offset === 0 });
    } catch (error) {
      if (absent(error))
        throw new Error(t("\u6B64\u76EE\u5F55\u6CA1\u6709\u539F\u6765\u7684\u4E0B\u8F7D\u68C0\u67E5\u70B9\uFF0C\u8BF7\u9009\u62E9\u539F\u6388\u6743\u76EE\u5F55\u3002"));
      throw error;
    }
    const parts = localPath(downloadPath(job2, file2)), name2 = parts.pop(), destination = await localDirectory(root, parts.join("/"));
    await exactName(destination, name2);
    let state;
    try {
      state = await jsonFile(directory, "state.json");
    } catch (error) {
      if (!absent(error))
        throw error;
      if (file2.offset > 0)
        throw new Error(t("\u6B64\u76EE\u5F55\u6CA1\u6709\u539F\u6765\u7684\u4E0B\u8F7D\u68C0\u67E5\u70B9\uFF1B\u8BF7\u9009\u62E9\u539F\u6388\u6743\u76EE\u5F55\uFF0C\u4E0D\u80FD\u62FC\u63A5\u5230\u65B0\u76EE\u5F55\u3002"));
      const target = await targetVersion(destination, name2, signal);
      if (target.exists && !replace)
        throw new Error(t("\u672C\u5730\u76EE\u6807\u5DF2\u5B58\u5728\uFF0C\u8BF7\u660E\u786E\u52FE\u9009\u8986\u76D6\u3002"));
      state = {
        schema: 1,
        id: file2.id,
        size: file2.size,
        version: file2.version,
        offset: 0,
        blocks: 0,
        prefix: hexHash(new Uint8Array()),
        target,
        phase: "partial"
      };
      await putJson(directory, "state.json", state);
    }
    if (state.schema !== 1 || state.id !== file2.id || state.size !== file2.size || state.version !== file2.version || !Number.isSafeInteger(state.offset) || state.offset < 0 || state.offset > file2.size || !Number.isSafeInteger(state.blocks) || state.blocks < 0 || state.blocks > Math.ceil(file2.size / CHUNK_BYTES) + 1 || !["partial", "publishing", "published"].includes(state.phase) || !/^[a-f0-9]{64}$/u.test(state.prefix))
      throw new Error(t("\u672C\u5730\u7EED\u4F20\u6E05\u5355\u8EAB\u4EFD\u6216\u504F\u79FB\u4E0D\u5339\u914D\u3002"));
    const result4 = new _DownloadStaging(directory, state, destination, name2);
    let bytes2 = 0;
    for (let index = 0; index < state.blocks; index++) {
      signal.throwIfAborted();
      const blob = await (await directory.getFileHandle(`block-${index}.bin`)).getFile();
      if (blob.size > BLOCK_BYTES || blob.size === 0)
        throw new Error(t("\u672C\u5730\u6682\u5B58\u5757\u5927\u5C0F\u9519\u8BEF\u3002"));
      for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
        signal.throwIfAborted();
        result4.hash.update(new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
      }
      bytes2 += blob.size;
    }
    if (bytes2 !== state.offset || result4.digest !== state.prefix)
      throw new Error(t("\u672C\u5730\u6682\u5B58\u5185\u5BB9\u6821\u9A8C\u5931\u8D25\uFF0C\u62D2\u7EDD\u62FC\u63A5\u3002"));
    return result4;
  }
  get offset() {
    return this.state.offset + this.pendingBytes;
  }
  get digest() {
    return bytesToHex(this.hash.clone().digest());
  }
  async append(bytes2) {
    if (this.offset + bytes2.length > this.state.size || bytes2.length > CHUNK_BYTES)
      throw new Error(t("\u4E0B\u8F7D\u5206\u5757\u8D8A\u754C\u3002"));
    this.hash.update(bytes2);
    this.pending.push(bytes2);
    this.pendingBytes += bytes2.length;
    if (this.pendingBytes >= BLOCK_BYTES)
      await this.checkpoint();
  }
  async checkpoint() {
    if (!this.pendingBytes)
      return;
    const stream = await (await this.directory.getFileHandle(`block-${this.state.blocks}.bin`, { create: true })).createWritable({ mode: "exclusive" });
    try {
      for (const bytes2 of this.pending)
        await stream.write(bytes2);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {
      });
      throw error;
    }
    const next = { ...this.state, offset: this.offset, blocks: this.state.blocks + 1, prefix: this.digest };
    await putJson(this.directory, "state.json", next);
    Object.assign(this.state, next);
    this.pending = [];
    this.pendingBytes = 0;
  }
  async publish(signal) {
    await this.checkpoint();
    signal.throwIfAborted();
    if (this.offset !== this.state.size)
      throw new Error(t("\u4E0B\u8F7D\u5C1A\u672A\u5B8C\u6574\uFF0C\u4E0D\u80FD\u53D1\u5E03\u3002"));
    const current = await targetVersion(this.destination, this.name, signal);
    if (this.state.phase !== "partial" && current.exists && current.sha256 === this.digest && current.size === this.state.size) {
      this.state.phase = "published";
      await putJson(this.directory, "state.json", this.state);
      return;
    }
    if (JSON.stringify(current) !== JSON.stringify(this.state.target))
      throw new Error(t("\u672C\u5730\u76EE\u6807\u5DF2\u6539\u53D8\uFF0C\u4FDD\u7559\u6682\u5B58\u4E14\u4E0D\u8986\u76D6\u3002"));
    this.state.phase = "publishing";
    await putJson(this.directory, "state.json", this.state);
    const handle = await this.destination.getFileHandle(this.name, { create: true });
    if (!current.exists && (await handle.getFile()).size !== 0)
      throw new Error(t("\u76EE\u6807\u521A\u88AB\u5176\u4ED6\u7A0B\u5E8F\u521B\u5EFA\uFF0C\u672A\u8986\u76D6\u3002"));
    if (!current.exists) {
      this.state.target = await targetVersion(this.destination, this.name, signal);
      await putJson(this.directory, "state.json", this.state);
    }
    const stream = await handle.createWritable({ mode: "exclusive" });
    try {
      if (JSON.stringify(await targetVersion(this.destination, this.name, signal)) !== JSON.stringify(this.state.target))
        throw new Error(t("\u83B7\u5F97\u5199\u9501\u524D\u76EE\u6807\u5DF2\u6539\u53D8\uFF0C\u672A\u8986\u76D6\u3002"));
      const hash = sha256.create();
      for (let i = 0; i < this.state.blocks; i++) {
        const block = await (await this.directory.getFileHandle(`block-${i}.bin`)).getFile();
        for (let offset = 0; offset < block.size; offset += CHUNK_BYTES) {
          signal.throwIfAborted();
          const bytes2 = new Uint8Array(await block.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
          hash.update(bytes2);
          await stream.write(bytes2);
        }
      }
      if (bytesToHex(hash.digest()) !== this.digest)
        throw new Error(t("\u5408\u6210\u65F6\u6682\u5B58\u6570\u636E\u53D1\u751F\u53D8\u5316\u3002"));
      signal.throwIfAborted();
      await stream.close();
      this.state.phase = "published";
      await putJson(this.directory, "state.json", this.state);
    } catch (error) {
      await stream.abort().catch(() => {
      });
      throw error;
    }
  }
};
async function targetVersion(directory, name2, signal) {
  let file2;
  try {
    file2 = await (await directory.getFileHandle(name2)).getFile();
  } catch (error) {
    if (absent(error))
      return { exists: false };
    throw error;
  }
  return { exists: true, size: file2.size, modified: file2.lastModified, sha256: await hashFile(file2, signal) };
}
async function cleanupLocalStaging(root, job2, allowMissing = false) {
  let staging;
  try {
    staging = await ownedStaging(root, job2, false);
  } catch (error) {
    if (absent(error) && allowMissing && !job2.destination)
      return;
    if (absent(error))
      throw new Error(t("\u6CA1\u6709\u539F\u4EFB\u52A1\u6682\u5B58\u6807\u8BB0\uFF0C\u4E0D\u80FD\u786E\u8BA4\u5DF2\u6E05\u7406\uFF1B\u8BF7\u91CD\u65B0\u9009\u62E9\u539F\u76EE\u5F55\u3002"));
    throw error;
  }
  const files = [];
  for await (const [name2, entry2] of staging.entries()) {
    if (name2 === "owner.json" && entry2.kind === "file")
      continue;
    const index = /^file-(\d+)$/u.exec(name2);
    if (!index || Number(index[1]) >= job2.count || entry2.kind !== "directory")
      throw new Error(t("\u6682\u5B58\u76EE\u5F55\u542B\u672A\u77E5\u9879\uFF0C\u672A\u5220\u9664\u3002"));
    files.push([name2, entry2]);
  }
  for (const [, directory] of files) {
    const state = await jsonFile(directory, "state.json");
    if (state.schema !== 1 || !state.id.startsWith(job2.id + "-") || !Number.isSafeInteger(state.blocks) || state.blocks < 0)
      throw new Error(t("\u6682\u5B58\u6E05\u5355\u8EAB\u4EFD\u9519\u8BEF\uFF0C\u672A\u5220\u9664\u3002"));
    for await (const [name2, entry2] of directory.entries()) {
      const block = /^block-(\d+)\.bin$/u.exec(name2);
      if (entry2.kind !== "file" || name2 !== "state.json" && (!block || Number(block[1]) > state.blocks))
        throw new Error(t("\u6682\u5B58\u6587\u4EF6\u5939\u542B\u672A\u77E5\u9879\uFF0C\u672A\u5220\u9664\u3002"));
    }
  }
  for (const [name2, directory] of files) {
    for await (const [entry2] of directory.entries())
      await directory.removeEntry(entry2);
    await staging.removeEntry(name2);
  }
}
async function removeCleanupReceipt(root, job2) {
  let staging;
  try {
    staging = await ownedStaging(root, job2, false);
  } catch (error) {
    if (absent(error) && !job2.destination)
      return;
    throw error;
  }
  for await (const [name2] of staging.entries())
    if (name2 !== "owner.json")
      throw new Error(t("\u4ECD\u6709\u6682\u5B58\u9879\uFF0C\u4FDD\u7559\u6E05\u7406\u56DE\u6267\u3002"));
  await staging.removeEntry("owner.json");
  await root.removeEntry(".dsh-transfer-" + job2.id);
}

// client/transfer-model.ts
async function transferResult(promise) {
  let timeout;
  try {
    const result4 = await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(t("\u8BF7\u6C42\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5237\u65B0\u8BB0\u5F55\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u5EFA\u4EFB\u52A1\u3002"))), 4e4);
    })]);
    if (!result4.ok)
      throw new Error(result4.error.message);
    return result4.value;
  } finally {
    clearTimeout(timeout);
  }
}
var TransferModel = class {
  constructor(sessionId, remote, fetcher = (...args) => fetch(...args)) {
    __publicField(this, "sessionId", sessionId);
    __publicField(this, "remote", remote);
    __publicField(this, "fetcher", fetcher);
    __publicField(this, "state", { jobs: [], selected: [], error: "", listError: "", notice: "", busy: false });
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "executor");
    __publicField(this, "disposed", false);
    __publicField(this, "readers", /* @__PURE__ */ new Set());
    __publicField(this, "views", /* @__PURE__ */ new Set());
    __publicField(this, "progressTimer");
    __publicField(this, "pendingProgress");
    __publicField(this, "revision", 0);
    __publicField(this, "errorRevision", 0);
    __publicField(this, "folders", /* @__PURE__ */ new Map());
    __publicField(this, "executionIds", /* @__PURE__ */ new Map());
    __publicField(this, "beforeUnload", (event) => {
      if (this.executor) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    __publicField(this, "snapshot", () => this.state);
    __publicField(this, "subscribe", (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    });
    if (typeof window !== "undefined")
      window.addEventListener("beforeunload", this.beforeUnload);
  }
  update(patch) {
    if (this.disposed)
      return;
    clearTimeout(this.progressTimer);
    this.progressTimer = void 0;
    this.state = { ...this.state, ...this.pendingProgress, ...patch };
    this.pendingProgress = void 0;
    for (const fn of this.listeners)
      fn();
  }
  report(error) {
    this.errorRevision++;
    this.update({ error: error instanceof Error ? error.message : String(error) });
  }
  select(files) {
    if (this.executor)
      throw new Error(t("\u8BF7\u5148\u6682\u505C\u5F53\u524D\u4F20\u8F93\u3002"));
    validateLocalManifest(files);
    this.update({ selected: files, error: "", notice: t("\u672C\u5730\u6E90\u5DF2\u9009\u62E9\uFF1B\u8BF7\u6838\u5BF9\u6E05\u5355\uFF0C\u7136\u540E\u5EFA\u7ACB\u8BA1\u5212\u6216\u7EE7\u7EED\u539F\u4EFB\u52A1\u3002") });
  }
  put(page2) {
    this.update({ jobs: [page2.job, ...this.state.jobs.filter((job2) => job2.id !== page2.job.id)], page: page2 });
  }
  cancelReads() {
    for (const reader of this.readers)
      reader.abort();
    this.readers.clear();
  }
  observeView(visible) {
    if (!visible)
      return () => {
      };
    const token = /* @__PURE__ */ Symbol();
    this.views.add(token);
    if (this.views.size === 1)
      void this.refresh();
    return () => {
      this.views.delete(token);
      if (!this.views.size)
        this.cancelReads();
    };
  }
  async refresh() {
    const reader = new AbortController();
    this.readers.add(reader);
    const revision = this.revision;
    try {
      const jobs = await transferResult(this.remote.list(this.sessionId, reader.signal));
      if (!reader.signal.aborted && revision === this.revision)
        this.update({ jobs, listError: "" });
    } catch (error) {
      if (!reader.signal.aborted && revision === this.revision)
        this.update({ listError: String(error) });
    } finally {
      this.readers.delete(reader);
    }
  }
  async page(id2, cursor2 = 0) {
    const reader = new AbortController();
    this.readers.add(reader);
    const revision = ++this.revision;
    try {
      const page2 = await transferResult(this.remote.page(this.sessionId, id2, cursor2, reader.signal));
      if (!reader.signal.aborted && revision === this.revision)
        this.put(page2);
    } catch (error) {
      if (!reader.signal.aborted && revision === this.revision)
        this.report(error);
    } finally {
      this.readers.delete(reader);
    }
  }
  async plan(direction, target) {
    if (this.state.busy || this.executor)
      return;
    const files = [...this.state.selected];
    this.revision++;
    this.update({ busy: true, error: "" });
    try {
      if (direction === "upload" && !files.length)
        throw new Error(t("\u8BF7\u5148\u9009\u62E9\u672C\u5730\u6587\u4EF6\u6216\u76EE\u5F55\u3002"));
      const id2 = crypto.randomUUID(), count = files.length, totalBytes = files.reduce((n, f) => n + (f.entry.size ?? 0), 0);
      const paths = direction === "download" ? target.split("\n").filter((path2) => path2 !== "") : [];
      if (direction === "upload" && target.includes("\n"))
        throw new Error(t("\u4E0A\u4F20\u76EE\u6807\u53EA\u80FD\u662F\u4E00\u4E2A\u76EE\u5F55\u3002"));
      let page2 = await transferResult(this.remote.plan(this.sessionId, {
        id: id2,
        direction,
        target: paths.length > 1 ? "" : target,
        ...paths.length > 1 ? { sources: paths } : {},
        ...direction === "upload" ? { count, totalBytes } : {}
      }));
      this.put(page2);
      for (let after = 0; direction === "upload" && after < files.length; after += 200) {
        page2 = await transferResult(this.remote.append(this.sessionId, { id: id2, after, entries: files.slice(after, after + 200).map((f) => f.entry) }));
      }
      this.put(await transferResult(this.remote.page(this.sessionId, id2, 0, new AbortController().signal)));
      this.update({ notice: t("\u8BA1\u5212\u5DF2\u5EFA\u7ACB\uFF0C\u5C1A\u672A\u4F20\u8F93\u3002\u8BF7\u6838\u5BF9\u5B9E\u9645\u6E05\u5355\u53CA\u6392\u9664\u9879\uFF0C\u518D\u70B9\u51FB\u5F00\u59CB\u3002") });
    } catch (error) {
      this.report(error);
    } finally {
      this.update({ busy: false });
      await this.refresh();
    }
  }
  async manifest(id2, signal) {
    const first = await transferResult(this.remote.page(this.sessionId, id2, 0, signal)), entries = [...first.entries];
    let page2 = first;
    while (!page2.done) {
      signal.throwIfAborted();
      const next = await transferResult(this.remote.page(this.sessionId, id2, page2.next, signal));
      if (next.next <= page2.next || entries.length + next.entries.length > 1e4)
        throw new Error(t("\u4F20\u8F93\u6E05\u5355\u5206\u9875\u65E0\u6548\u3002"));
      entries.push(...next.entries);
      page2 = next;
    }
    return { ...first, entries };
  }
  async start(job2, replace, folder, onlyIndex) {
    if (this.executor || this.state.busy)
      throw new Error(t("\u6B64\u4F1A\u8BDD\u5DF2\u6709\u6267\u884C\u4EFB\u52A1\uFF0C\u8BF7\u5148\u6682\u505C\u3002"));
    if (job2.direction === "download" && !folder)
      throw new Error(t("\u8BF7\u9009\u62E9\u5E76\u6388\u6743\u539F\u4E0B\u8F7D\u76EE\u5F55\u3002"));
    if (folder)
      this.folders.set(job2.id, folder);
    const stop = new AbortController(), run = crypto.randomUUID();
    const execution = { id: job2.id, run, stop, promise: Promise.resolve() };
    this.executor = execution;
    this.revision++;
    this.update({ active: job2.id, error: "", notice: "", progress: [], failures: [], transferredBytes: 0, totalBytes: job2.totalBytes });
    execution.promise = this.execute(execution, job2, replace, folder, onlyIndex);
    return execution.promise;
  }
  async execute(execution, job2, replace, folder, onlyIndex) {
    const { id: id2, run, stop } = execution, signal = stop.signal;
    let claimed = false, heartbeat, heartbeatPending = false;
    const send = (action, index, extra = {}) => transferResult(this.remote.file(this.sessionId, { id: id2, run, index, action, ...extra }));
    const progress = /* @__PURE__ */ new Map(), offsets = /* @__PURE__ */ new Map();
    let transferredBytes = 0;
    try {
      const manifest = await this.manifest(id2, signal), source2 = new Map(this.state.selected.map((file2) => [file2.entry.path, file2]));
      job2 = manifest.job;
      for (const file2 of manifest.entries)
        if (file2.kind === "file") {
          const offset = file2.state === "complete" ? file2.size : file2.offset;
          offsets.set(file2.index, offset);
          transferredBytes += offset;
        }
      const pending = manifest.entries.filter((file2) => !["complete", "skipped"].includes(file2.state) && (onlyIndex === void 0 || file2.index === onlyIndex || file2.kind === "directory"));
      if (job2.direction === "upload")
        for (const file2 of pending) {
          const local = source2.get(file2.path);
          if (!local || local.entry.kind !== file2.kind || local.entry.size !== file2.size)
            throw new Error(t("\u91CD\u65B0\u9009\u62E9\u7684\u6E90\u6587\u4EF6\u6E05\u5355\u4E0D\u5339\u914D\uFF1A") + file2.path);
        }
      signal.throwIfAborted();
      const destination = folder ? await bindDownloadDirectory(folder, job2) : void 0;
      this.executionIds.set(id2, run);
      claimed = true;
      const resumed = await transferResult(this.remote.control(this.sessionId, { id: id2, run, action: "resume", ...destination ? { destination } : {} }));
      job2 = resumed.job;
      this.put(resumed);
      heartbeat = setInterval(() => {
        if (heartbeatPending || signal.aborted)
          return;
        heartbeatPending = true;
        void transferResult(this.remote.control(this.sessionId, { id: id2, run, action: "heartbeat" })).catch((error) => {
          if (!signal.aborted) {
            this.report(error);
            stop.abort(error);
          }
        }).finally(() => {
          heartbeatPending = false;
        });
      }, 1e4);
      for (const file2 of pending.filter((f) => f.kind === "directory").sort((a, b) => a.path.split("/").length - b.path.split("/").length)) {
        signal.throwIfAborted();
        if (folder)
          await localDirectory(folder, downloadPath(job2, file2));
        await send("begin", file2.index);
      }
      const files = pending.filter((file2) => file2.kind === "file");
      let cursor2 = 0;
      const worker = async (slot) => {
        const notify = (file2, bytes2, phase) => {
          progress.set(slot, { path: file2.path, bytes: bytes2, size: file2.size ?? 0, phase });
          if (phase === t("\u4F20\u8F93") || phase === t("\u5B8C\u6210")) {
            transferredBytes += bytes2 - (offsets.get(file2.index) ?? 0);
            offsets.set(file2.index, bytes2);
          }
          this.pendingProgress = { progress: [...progress.values()], transferredBytes, totalBytes: job2.totalBytes };
          if (phase === t("\u5B8C\u6210"))
            this.update({});
          else
            this.progressTimer ?? (this.progressTimer = setTimeout(() => this.update({}), 100));
        };
        while (cursor2 < files.length) {
          signal.throwIfAborted();
          const file2 = files[cursor2++];
          let staging;
          try {
            let result4, data, sha2;
            if (job2.direction === "upload") {
              data = await source2.get(file2.path).getFile();
              if (data.size !== file2.size)
                throw new Error(t("\u6E90\u6587\u4EF6\u5927\u5C0F\u5DF2\u6539\u53D8\uFF1A") + file2.path);
              sha2 = await hashFile(data, signal, (bytes2) => notify(file2, bytes2, t("\u6821\u9A8C\u4E0A\u4F20\u6E90")));
              if (file2.sha256 && file2.sha256 !== sha2)
                throw new Error(t("\u6E90\u6587\u4EF6\u5185\u5BB9\u5DF2\u6539\u53D8\uFF0C\u62D2\u7EDD\u7EED\u4F20\uFF1A") + file2.path);
              result4 = await send("begin", file2.index, { sha256: sha2, replace });
            } else {
              staging = await DownloadStaging.open(folder, job2, file2, replace, signal);
              result4 = await send("begin", file2.index, { offset: staging.offset });
            }
            while (result4.state === "verifying") {
              signal.throwIfAborted();
              notify(file2, result4.verifyOffset ?? 0, t("\u6821\u9A8C\u7EED\u4F20\u524D\u7F00"));
              result4 = await send("verify", file2.index);
            }
            if (result4.file.state === "complete") {
              notify(file2, file2.size, t("\u5B8C\u6210"));
              continue;
            }
            if (staging && (result4.file.offset !== staging.offset || result4.prefix !== staging.digest))
              throw new Error(t("\u8FDC\u7AEF\u4E0E\u672C\u5730\u4E0B\u8F7D\u524D\u7F00\u4E0D\u4E00\u81F4\u3002"));
            let offset = result4.file.offset;
            while (offset < file2.size) {
              signal.throwIfAborted();
              notify(file2, offset, t("\u4F20\u8F93"));
              if (data) {
                const bytes2 = await readLocalChunk(data, offset, signal);
                const response = await this.chunk(execution, "upload", file2.index, offset, bytes2);
                const receipt = await response.json();
                if (receipt.id !== file2.id || receipt.offset !== offset + bytes2.length)
                  throw new Error(t("\u4E0A\u4F20\u786E\u8BA4\u504F\u79FB\u4E0D\u5339\u914D\u3002"));
                offset = receipt.offset;
              } else {
                const response = await this.chunk(execution, "download", file2.index, offset);
                const bytes2 = await boundedResponse(response, signal);
                if (!bytes2.length || bytes2.length > file2.size - offset || hexHash(bytes2) !== response.headers.get("x-content-sha256"))
                  throw new Error(t("\u4E0B\u8F7D\u5206\u5757\u957F\u5EA6\u6216\u6821\u9A8C\u5931\u8D25\u3002"));
                await staging.append(bytes2);
                offset += bytes2.length;
              }
            }
            signal.throwIfAborted();
            if (staging) {
              notify(file2, offset, t("\u53D1\u5E03\u5230\u672C\u5730\u6587\u4EF6\u5939"));
              await staging.publish(signal);
              sha2 = staging.digest;
            }
            await send("finish", file2.index, { sha256: sha2 });
            notify(file2, file2.size, t("\u5B8C\u6210"));
          } catch (error) {
            if (staging)
              await staging.checkpoint().catch((checkpointError) => this.report(checkpointError));
            if (error?.name !== "AbortError")
              this.update({ failures: [
                ...(this.state.failures ?? []).filter((row) => row.path !== file2.path),
                { path: file2.path, message: String(error) }
              ] });
            stop.abort(error);
            throw error;
          }
        }
      };
      const outcomes = await Promise.allSettled([worker(0), worker(1)]);
      const failure2 = outcomes.find((outcome) => outcome.status === "rejected");
      if (failure2?.status === "rejected")
        throw failure2.reason;
      this.update({ notice: onlyIndex === void 0 ? t("\u6240\u9009\u4EFB\u52A1\u5DF2\u4F20\u8F93\u5E76\u5B8C\u6210 SHA-256 \u6821\u9A8C\u3002") : t("\u672C\u6B21\u6240\u9009\u9879\u5DF2\u5904\u7406\uFF1B\u5176\u4ED6\u672A\u5B8C\u6210\u9879\u4FDD\u7559\u3002") });
    } catch (error) {
      if (error?.name !== "AbortError")
        this.report(error);
    } finally {
      clearInterval(heartbeat);
      if (claimed) {
        try {
          const page2 = await transferResult(this.remote.page(this.sessionId, id2, 0, new AbortController().signal));
          if (page2.job.live)
            this.put(await transferResult(this.remote.control(this.sessionId, { id: id2, run, action: "pause" })));
          else {
            this.put(page2);
            this.executionIds.delete(id2);
          }
        } catch (error) {
          this.report(t("\u505C\u6B62\u7ED3\u679C\u5F85\u786E\u8BA4\uFF1A") + String(error));
        }
      }
      if (this.executor === execution)
        this.executor = void 0;
      this.update({ active: void 0, progress: void 0 });
      this.revision++;
      await this.refresh();
    }
  }
  async chunk(execution, direction, index, offset, bytes2) {
    const query = new URLSearchParams({ sessionId: this.sessionId, id: execution.id, index: String(index), offset: String(offset) });
    for (let attempt = 0; ; attempt++) {
      execution.stop.signal.throwIfAborted();
      try {
        const response = await this.fetcher(`/api/ssh-transfers/${direction}?${query}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "x-dsh-transfer-run": execution.run, ...bytes2 ? { "x-content-sha256": hexHash(bytes2), "content-type": "application/octet-stream" } : {} },
          body: bytes2,
          signal: execution.stop.signal
        });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error ?? t("\u4F20\u8F93\u88AB\u62D2\u7EDD\u3002"));
        }
        return response;
      } catch (error) {
        if (!(error instanceof TypeError) || attempt >= 2 || execution.stop.signal.aborted)
          throw error;
        await new Promise((resolve, reject) => {
          const aborted2 = () => {
            clearTimeout(timer);
            reject(execution.stop.signal.reason);
          };
          const timer = setTimeout(() => {
            execution.stop.signal.removeEventListener("abort", aborted2);
            resolve();
          }, 500 * 2 ** attempt);
          execution.stop.signal.addEventListener("abort", aborted2, { once: true });
        });
      }
    }
  }
  async pause() {
    const execution = this.executor;
    if (!execution)
      return;
    execution.stop.abort(new DOMException(t("\u7528\u6237\u6682\u505C"), "AbortError"));
    await execution.promise;
  }
  async cancel(job2, folder) {
    const errorRevision = this.errorRevision;
    this.revision++;
    if (this.executor?.id === job2.id)
      await this.pause();
    const page2 = await transferResult(this.remote.control(this.sessionId, { id: job2.id, run: this.executionIds.get(job2.id) ?? crypto.randomUUID(), action: "cancel" }));
    this.put(page2);
    if (page2.job.state !== "cancelled")
      throw new Error(page2.job.error ?? t("\u8FDC\u7AEF\u6E05\u7406\u672A\u786E\u8BA4\u3002"));
    this.executionIds.delete(job2.id);
    const target = folder ?? this.folders.get(job2.id);
    if (job2.direction === "download" && target) {
      await cleanupLocalStaging(target, page2.job, !page2.job.destination);
      this.folders.delete(job2.id);
    }
    this.update({ ...errorRevision === this.errorRevision ? { error: "" } : {}, notice: job2.direction === "download" && !target ? t("\u8FDC\u7AEF\u53D6\u6D88\u5DF2\u786E\u8BA4\u3002\u4ECD\u9700\u91CD\u65B0\u6388\u6743\u539F\u672C\u5730\u76EE\u5F55\u4EE5\u6E05\u7406\u6682\u5B58\uFF1B\u5DF2\u5B8C\u6210\u6587\u4EF6\u4FDD\u7559\u3002") : t("\u5DF2\u53D6\u6D88\u5E76\u6E05\u7406\u5DF2\u6388\u6743\u7684\u672A\u5B8C\u6210\u6682\u5B58\uFF0C\u5DF2\u5B8C\u6210\u6587\u4EF6\u4FDD\u7559\u3002") });
  }
  async forget(job2, folder) {
    const errorRevision = this.errorRevision;
    this.revision++;
    if (job2.direction === "download") {
      if (!folder)
        throw new Error(t("\u8BF7\u5148\u6388\u6743\u539F\u4E0B\u8F7D\u76EE\u5F55\u4EE5\u6E05\u7406\u6682\u5B58\u3002"));
      await cleanupLocalStaging(folder, job2, ["cancelled", "expired"].includes(job2.state) && !job2.destination);
    }
    await transferResult(this.remote.control(this.sessionId, { id: job2.id, run: crypto.randomUUID(), action: "forget" }));
    if (folder)
      await removeCleanupReceipt(folder, job2);
    this.folders.delete(job2.id);
    this.executionIds.delete(job2.id);
    this.update({
      jobs: this.state.jobs.filter((row) => row.id !== job2.id),
      page: void 0,
      ...errorRevision === this.errorRevision ? { error: "" } : {},
      notice: t("\u6682\u5B58\u53CA\u4EFB\u52A1\u8BB0\u5F55\u5DF2\u6E05\u7406\uFF0C\u5DF2\u5B8C\u6210\u6587\u4EF6\u4FDD\u7559\u3002")
    });
  }
  async dispose() {
    this.cancelReads();
    await this.pause();
    clearTimeout(this.progressTimer);
    this.disposed = true;
    if (typeof window !== "undefined")
      window.removeEventListener("beforeunload", this.beforeUnload);
    this.listeners.clear();
    this.folders.clear();
  }
};
async function boundedResponse(response, signal) {
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error(t("\u4E0B\u8F7D\u54CD\u5E94\u6CA1\u6709\u6570\u636E\u6D41\u3002"));
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done)
        break;
      total += part.value.length;
      if (total > CHUNK_BYTES)
        throw new Error(t("\u4E0B\u8F7D\u5206\u5757\u8D85\u8FC7\u4E0A\u9650\u3002"));
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
  const result4 = new Uint8Array(total);
  let offset = 0;
  for (const bytes2 of chunks) {
    result4.set(bytes2, offset);
    offset += bytes2.length;
  }
  return result4;
}

// client/transfers.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var ID4 = "dsh-ssh-remote.transfers";
function mountTransfers(ctx, workbench) {
  const fiber = ctx.inject(["remote.sshRemoteTransfers", "slots", "sidebarRight", "sidebarRightTabs"], (scope6) => {
    if (!scope6.sidebarRightTabs || typeof scope6.remote.sshRemoteTransfers?.list !== "function")
      return () => {
      };
    const models = /* @__PURE__ */ new Map();
    const getModel = (sessionId) => {
      let model = models.get(sessionId);
      if (!model) {
        if (models.size >= 8) {
          const idle2 = [...models].find(([, value]) => !value.snapshot().active);
          if (!idle2)
            throw new Error(t("\u5DF2\u6709\u516B\u4E2A\u4F1A\u8BDD\u4F20\u8F93\u6A21\u578B\uFF0C\u8BF7\u5148\u505C\u6B62\u5176\u4E2D\u4E00\u4E2A\u3002"));
          void idle2[1].dispose();
          models.delete(idle2[0]);
        }
        model = new TransferModel(sessionId, scope6.remote.sshRemoteTransfers);
        models.set(sessionId, model);
      }
      return model;
    };
    const body = mountWorkbenchSection(scope6, workbench, ID4, "ssh-transfers", "transfers", (props) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(TransferPane, { ...props, getModel }));
    return async () => {
      body();
      await Promise.all([...models.values()].map((model) => model.dispose()));
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
var transferSize = (n) => n >= 2 ** 40 ? `${(n / 2 ** 40).toFixed(2)} TiB` : n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(2)} GiB` : n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(2)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`;
var labels2 = () => ({ preparing: t("\u6E05\u5355\u672A\u5B8C\u6210"), ready: t("\u7B49\u5F85\u786E\u8BA4\u5F00\u59CB"), running: t("\u4F20\u8F93\u4E2D"), paused: t("\u5DF2\u6682\u505C"), complete: t("\u5DF2\u5B8C\u6210"), cancelled: t("\u5DF2\u53D6\u6D88"), "cleanup-pending": t("\u505C\u6B62/\u6E05\u7406\u5F85\u786E\u8BA4"), expired: t("\u5DF2\u5230\u671F") });
var fileLabels = () => ({
  queued: t("\u6392\u961F\u4E2D"),
  verifying: t("\u6821\u9A8C\u4E2D"),
  transferring: t("\u4F20\u8F93\u4E2D"),
  complete: t("\u5DF2\u5B8C\u6210"),
  paused: t("\u5DF2\u6682\u505C"),
  failed: t("\u5931\u8D25"),
  unknown: t("\u672A\u77E5"),
  skipped: t("\u5DF2\u8DF3\u8FC7")
});
function TransferPane({ sessionId, getModel, active = true }) {
  const visible = usePageVisible(active);
  const model = getModel(sessionId), state = (0, import_react8.useSyncExternalStore)(model.subscribe, model.snapshot, model.snapshot);
  const [direction, setDirection] = (0, import_react8.useState)("upload");
  const [uploadTarget, setUploadTarget] = (0, import_react8.useState)(""), [downloadTarget, setDownloadTarget] = (0, import_react8.useState)("");
  const target = direction === "upload" ? uploadTarget : downloadTarget;
  const setTarget = direction === "upload" ? setUploadTarget : setDownloadTarget;
  const [replace, setReplace] = (0, import_react8.useState)(false), [selectionPage, setSelectionPage] = (0, import_react8.useState)(0);
  const input2 = (0, import_react8.useRef)(null);
  (0, import_react8.useEffect)(() => model.observeView(visible), [model, visible]);
  const run = (operation) => {
    void operation().catch((error) => model.report(error));
  };
  const chooseFolder = () => run(async () => {
    const folder = await pickLocalDirectory("read");
    model.select(await directoryFiles(folder));
    setSelectionPage(0);
  });
  const start = (job2, index) => run(async () => {
    const folder = job2.direction === "download" ? await pickLocalDirectory("readwrite") : void 0;
    await model.start(job2, replace, folder, index);
  });
  const done = (job2) => ["complete", "cancelled", "expired"].includes(job2.state);
  const page2 = state.page, selected = state.selected.slice(selectionPage, selectionPage + 100);
  const directoriesAvailable = canPickLocalDirectory();
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { "aria-label": t("SSH \u6587\u4EF6\u4F20\u8F93"), style: panelStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PanelHeader, { title: t("\u6587\u4EF6\u4F20\u8F93"), children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: "ghost", onClick: () => void model.refresh(), children: t("\u5237\u65B0\u4EFB\u52A1") }) }),
    !directoriesAvailable && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("small", { role: "note", children: t("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u76EE\u5F55\u6388\u6743\u3002\u53EF\u4EE5\u4E0A\u4F20\u6587\u4EF6\uFF1B\u76EE\u5F55\u4E0A\u4F20\u548C\u4E0B\u8F7D\u8BF7\u4F7F\u7528\u652F\u6301 File System Access \u7684 Desktop / Chromium \u5B89\u5168\u9875\u9762\u3002") }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: "group", "aria-label": t("\u4F20\u8F93\u65B9\u5411"), style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: direction === "upload" ? "primary" : "outline", "aria-pressed": direction === "upload", onClick: () => setDirection("upload"), children: t("\u4E0A\u4F20") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: direction === "download" ? "primary" : "outline", "aria-pressed": direction === "download", onClick: () => setDirection("download"), children: t("\u4E0B\u8F7D") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("small", { children: [
      t("\u2460 \u9009\u62E9"),
      direction === "upload" ? t("\u672C\u5730\u6587\u4EF6") : t("\u8FDC\u7AEF\u8DEF\u5F84"),
      t("\u2461 \u6838\u5BF9\u6E05\u5355 \u2462 \u786E\u8BA4\u5F00\u59CB")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "grid", gap: 6 }, children: [
      direction === "upload" ? t("\u4E0A\u4F20\u5230\u8FDC\u7AEF\u76EE\u5F55") : t("\u4E0B\u8F7D\u8FDC\u7AEF\u6587\u4EF6\u6216\u76EE\u5F55"),
      direction === "upload" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Input, { "aria-label": t("\u4F20\u8F93\u8FDC\u7AEF\u76F8\u5BF9\u8DEF\u5F84"), value: target, onChange: (event) => setTarget(event.target.value), placeholder: t("\u5DE5\u4F5C\u533A\u5185\u76EE\u5F55\uFF0C\u7559\u7A7A\u4E3A\u6839\u76EE\u5F55") }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("textarea", { "aria-label": t("\u4F20\u8F93\u8FDC\u7AEF\u76F8\u5BF9\u8DEF\u5F84"), value: target, onChange: (event) => setTarget(event.target.value), placeholder: t("\u6BCF\u884C\u4E00\u4E2A\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u7559\u7A7A\u4E3A\u5DE5\u4F5C\u533A"), rows: 3, style: { width: "100%", resize: "vertical" } })
    ] }),
    direction === "upload" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { onDragOver: (event) => event.preventDefault(), onDrop: (event) => {
      event.preventDefault();
      const items = Array.from(event.dataTransfer.items);
      const handles = items.filter((item) => item.kind === "file").map((item) => {
        const get = item.getAsFileSystemHandle;
        return get ? get.call(item) : Promise.resolve(item.getAsFile());
      });
      run(async () => {
        const files = [];
        for (const pending of handles) {
          const handle = await pending;
          if (!handle)
            throw new Error(t("\u65E0\u6CD5\u8BBF\u95EE\u62D6\u62FD\u9879\u76EE\uFF0C\u8BF7\u7528\u9009\u62E9\u6587\u4EF6/\u76EE\u5F55\u3002"));
          if ("kind" in handle && handle.kind === "directory")
            files.push(...await directoryFiles(handle));
          else if ("kind" in handle) {
            const file2 = await handle.getFile();
            files.push(...selectedFiles([file2]));
          } else
            files.push(...selectedFiles([handle]));
        }
        model.select(files);
        setSelectionPage(0);
      });
    }, style: { border: "1px dashed var(--dsw-alias-border-l2)", padding: 10, borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { children: t("\u62D6\u62FD\u6587\u4EF6\u6216\u76EE\u5F55\u5230\u8FD9\u91CC\uFF0C\u6216\u9009\u62E9\uFF1A") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { ref: input2, type: "file", multiple: true, "aria-label": t("\u9009\u62E9\u4E0A\u4F20\u6587\u4EF6"), hidden: true, onChange: (event) => {
        try {
          model.select(selectedFiles(Array.from(event.target.files ?? [])));
          setSelectionPage(0);
        } catch (error) {
          model.report(error);
        }
        event.target.value = "";
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: "outline", disabled: !!state.active, onClick: () => input2.current?.click(), children: t("\u9009\u62E9\u6587\u4EF6") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: "outline", disabled: !!state.active || !directoriesAvailable, onClick: chooseFolder, children: t("\u9009\u62E9\u4E0A\u4F20\u76EE\u5F55") })
      ] })
    ] }),
    direction === "upload" && state.selected.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("summary", { children: [
        t("\u672C\u5730\u9009\u62E9\uFF1A"),
        state.selected.length,
        t("\u9879\uFF08\u542B\u6392\u9664\u9879\uFF09")
      ] }),
      selected.map((file2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { overflowWrap: "anywhere", fontSize: 12 }, children: [
        file2.entry.kind === "excluded" ? t("\u6392\u9664") : file2.entry.kind === "directory" ? t("\u76EE\u5F55") : transferSize(file2.entry.size),
        " \xB7 ",
        file2.entry.path,
        file2.entry.reason ? ` \u2014 ${file2.entry.reason}` : ""
      ] }, file2.entry.path)),
      selectionPage > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", onClick: () => setSelectionPage(Math.max(0, selectionPage - 100)), children: t("\u9009\u62E9\u6E05\u5355\u4E0A\u4E00\u9875") }),
      selectionPage + 100 < state.selected.length && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", onClick: () => setSelectionPage(selectionPage + 100), children: t("\u9009\u62E9\u6E05\u5355\u4E0B\u4E00\u9875") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { variant: "primary", disabled: state.busy || !!state.active || direction === "upload" && !state.selected.length, onClick: () => void model.plan(direction, target), children: state.busy ? t("\u8BFB\u53D6\u6E05\u5355\u2026") : direction === "upload" ? t("\u5EFA\u7ACB\u4E0A\u4F20\u8BA1\u5212") : t("\u9884\u89C8\u4E0B\u8F7D\u6E05\u5355") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Checkbox, { checked: replace, onChange: setReplace, label: t("\u5141\u8BB8\u66FF\u6362\u540C\u540D\u6587\u4EF6\uFF08\u5F00\u59CB\u524D\u6821\u9A8C\u7248\u672C\uFF09") }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: t("\u4F20\u8F93\u4E0E\u6062\u590D\u8BF4\u660E") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("small", { children: t("\u5355\u6587\u4EF6 / \u5355\u6279\u6700\u591A 1 TiB\u300110,000 \u9879\uFF0C\u4E24\u4E2A\u6587\u4EF6\u5E76\u53D1\u3002\u5173\u95ED\u9762\u677F\u4E0D\u505C\u6B62\u4F20\u8F93\uFF0C\u91CD\u542F\u540E\u9700\u91CD\u65B0\u6388\u6743\u3002\u9ED8\u8BA4\u6392\u9664\u51ED\u636E\u3001.env\u3001\u5BC6\u94A5\u3001.git \u548C\u7F13\u5B58\uFF0C\u4E0D\u8DDF\u968F\u7B26\u53F7\u94FE\u63A5\u3002\u4E0B\u8F7D\u4FDD\u5B58\u5230\u6388\u6743\u7684\u672C\u673A\u76EE\u5F55\uFF1B\u5176\u4ED6\u7A0B\u5E8F\u7684\u5E76\u53D1\u5199\u5165\u4ECD\u53EF\u80FD\u51B2\u7A81\u3002") })
    ] }),
    [state.error, state.listError].filter(Boolean).map((message2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { role: "alert", style: { overflowWrap: "anywhere" }, children: message2 }, message2)),
    state.notice && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { role: "status", style: { overflowWrap: "anywhere" }, children: state.notice }),
    state.failures?.map((file2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("strong", { children: [
        t("\u672A\u5B8C\u6210\uFF1A"),
        file2.path
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { children: file2.message })
    ] }, file2.path)),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { role: "list", "aria-label": t("\u4F20\u8F93\u4EFB\u52A1"), style: { display: "grid", gap: 10 }, children: state.jobs.map((job2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("article", { role: "listitem", style: { ...cardStyle, overflowWrap: "anywhere" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("strong", { children: [
        job2.direction === "upload" ? t("\u4E0A\u4F20") : t("\u4E0B\u8F7D"),
        " \xB7 ",
        job2.alias,
        " \xB7 ",
        job2.sources?.join("\u3001") || job2.target || t("\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
        job2.count,
        t("\u9879 /"),
        transferSize(job2.totalBytes),
        " \xB7 ",
        labels2()[job2.state],
        job2.state === "running" && !job2.live ? t("\uFF08\u4E0A\u6B21\u8BB0\u5F55\uFF1B\u5F53\u524D\u672A\u8FD0\u884C\uFF0C\u9700\u91CD\u65B0\u6388\u6743\u6062\u590D\uFF09") : ""
      ] }),
      state.active === job2.id && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            t("\u603B\u8FDB\u5EA6 \xB7"),
            transferSize(state.transferredBytes ?? 0),
            " / ",
            transferSize(state.totalBytes ?? 0)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("progress", { max: state.totalBytes || 1, value: state.transferredBytes ?? 0 })
        ] }),
        state.progress?.map((file2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: "status", style: { fontSize: 12 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
            file2.phase,
            " \xB7 ",
            file2.path
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            transferSize(file2.bytes),
            " / ",
            transferSize(file2.size)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("progress", { max: file2.size || 1, value: file2.bytes })
        ] }, file2.path))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: t("\u4EFB\u52A1\u8BE6\u60C5") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("small", { children: [
          t("\u4EFB\u52A1"),
          job2.id.slice(0, 8),
          t("\xB7 \u6682\u505C\u4E03\u5929\u540E\u5230\u671F\uFF0C\u672C\u5730\u6682\u5B58\u6E05\u7406\u9700\u6388\u6743\u3002")
        ] })
      ] }),
      job2.error && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { role: "alert", children: job2.error }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }, children: [
        !done(job2) && job2.state !== "preparing" && state.active !== job2.id && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { variant: "primary", size: "sm", disabled: !!state.active || job2.direction === "download" && !directoriesAvailable, onClick: () => start(job2), children: job2.direction === "download" ? t("\u6388\u6743\u76EE\u5F55\u5E76\u5F00\u59CB / \u7EE7\u7EED") : t("\u7528\u5F53\u524D\u9009\u62E9\u5F00\u59CB / \u7EE7\u7EED") }),
        state.active === job2.id && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: "primary", onClick: () => run(() => model.pause()), children: t("\u6682\u505C") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: "ghost", onClick: () => void model.page(job2.id), children: t("\u67E5\u770B\u6E05\u5355") }),
        !done(job2) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", variant: "ghost", onClick: () => run(() => model.cancel(job2)), children: t("\u53D6\u6D88\u5E76\u6E05\u7406\u6682\u5B58") }),
        done(job2) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", onClick: () => run(async () => {
          const folder = job2.direction === "download" ? await pickLocalDirectory("readwrite") : void 0;
          await model.forget(job2, folder);
        }), children: t("\u6E05\u7406\u6682\u5B58\u53CA\u4EFB\u52A1\u8BB0\u5F55") })
      ] })
    ] }, job2.id)) }),
    page2 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("summary", { children: [
        t("\u4EFB\u52A1\u6E05\u5355\uFF08"),
        page2.job.id.slice(0, 8),
        t("\uFF0C\u5F53\u524D"),
        page2.entries.length,
        t("\u9879\uFF09")
      ] }),
      page2.entries.map((file2) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { borderBottom: "1px solid var(--dsw-alias-border-l2)", padding: "6px 0", overflowWrap: "anywhere", fontSize: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          file2.path,
          " \xB7 ",
          file2.kind === "excluded" ? t("\u6392\u9664") : file2.kind === "directory" ? t("\u76EE\u5F55") : `${transferSize(file2.offset)} / ${transferSize(file2.size)}`,
          " \xB7 ",
          fileLabels()[file2.state]
        ] }),
        (file2.reason || file2.error) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { children: file2.reason || file2.error }),
        ["failed", "unknown", "paused"].includes(file2.state) && !done(page2.job) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", disabled: !!state.active, onClick: () => start(page2.job, file2.index), children: t("\u91CD\u8BD5\u6B64\u9879") })
      ] }, file2.id)),
      page2.entries[0]?.index > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", onClick: () => void model.page(page2.job.id, Math.max(0, page2.entries[0].index - 200)), children: t("\u6E05\u5355\u4E0A\u4E00\u9875") }),
      !page2.done && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives6.Button, { size: "sm", onClick: () => void model.page(page2.job.id, page2.next), children: t("\u6E05\u5355\u4E0B\u4E00\u9875") })
    ] })
  ] });
}

// client/terminal-state.tsx
var import_react9 = require("react");
var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime9 = require("react/jsx-runtime");
var ID5 = "dsh-ssh-remote.terminal-state";
var labels3 = () => ({ starting: t("\u521D\u59CB\u5316\u4E2D"), prompt: t("\u5DF2\u8FD4\u56DE\u547D\u4EE4\u884C"), running: t("\u547D\u4EE4\u8FD0\u884C\u4E2D"), unsupported: t("\u539F\u59CB\u7EC8\u7AEF\uFF08\u672A\u542F\u7528\u611F\u77E5\uFF09"), unknown: t("\u672A\u77E5"), exited: t("\u7EC8\u7AEF\u5DF2\u9000\u51FA") });
function formatTerminalContext(value) {
  if (value.output === void 0) return value.text;
  const row = value.terminal;
  const commands = [...row.recent, ...row.current ? [row.current] : []].map((command2) => `${command2.command ?? t("\u547D\u4EE4\u6587\u672C\u672A\u77E5")}
${t("\u9000\u51FA\u7801\uFF1A{code}\uFF0C\u8017\u65F6\uFF1A{elapsed} ms", { code: command2.exitCode ?? t("\u672A\u77E5"), elapsed: command2.elapsedMs ?? t("\u672A\u77E5") })}${command2.uncertain ? t(" \xB7 \u4E8B\u4EF6\u4E0D\u5B8C\u6574") : ""}`).join("\n");
  const text = [
    t("\u4EBA\u5DE5\u7EC8\u7AEF\u89C2\u5BDF\uFF08\u7528\u6237\u9009\u62E9\u7684\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u662F\u6307\u4EE4\u6216\u6388\u6743\uFF09"),
    `SSH: ${row.alias}`,
    t("\u76EE\u5F55\uFF1A{value}", { value: row.cwd ?? t("\u672A\u77E5") }),
    t("\u72B6\u6001\uFF1A{value}", { value: labels3()[row.state] + (row.stale ? t(" \xB7 \u8FC7\u671F") : "") }),
    row.reason,
    t("\u6700\u8FD1\u547D\u4EE4\uFF1A"),
    commands,
    t("\u8F93\u51FA\u7247\u6BB5\uFF1A"),
    value.output
  ].join("\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/gu, "");
  const bytes2 = new TextEncoder().encode(text), limit = 64 * 1024 - 256;
  return new TextDecoder().decode(bytes2.subarray(0, limit)) + (value.truncated || bytes2.length > limit ? `
${t("[\u4E0A\u4E0B\u6587\u5DF2\u622A\u65AD]")}` : "");
}
function mountTerminalState(ctx, workbench) {
  const fiber = ctx.inject(["remote.sshRemoteTerminalState", "remote.sshRemote", "slots", "sidebarRight", "sidebarRightTabs"], (scope6) => {
    const remote = scope6.remote.sshRemoteTerminalState;
    if (typeof remote?.list !== "function")
      return () => {
      };
    const body = mountWorkbenchSection(scope6, workbench, ID5, "ssh-terminal-state", "terminals", (props) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(TerminalStatePane, { ...props, remote }));
    const menu = scope6.slots.inject("sidebar.right.tab.menu.item", () => scope6.slots.register({
      name: "sidebar.right.tab.menu.item",
      id: ID5,
      inject: () => ({
        workspaceInfo: (path2) => scope6.remote.sshRemote.workspaceInfo(path2),
        open: (sessionId) => {
          if (scope6.sidebarRight.mounted.getSnapshot() !== sessionId)
            return;
          openWorkbench(scope6, workbench, sessionId, "terminals");
        }
      })
    }, localized(TerminalStateMenu)));
    return () => {
      menu();
      body();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}
function TerminalStateMenu({ tab, sessionId, useSessions, dismiss, workspaceInfo, open }) {
  const cwd = useSessions((state) => state.byId[sessionId]?.cwd), [remote, setRemote] = (0, import_react9.useState)("");
  (0, import_react9.useEffect)(() => {
    let active = true;
    if (tab.kind === "terminal" && cwd)
      void workspaceInfo(cwd).then((result4) => {
        if (active)
          setRemote(result4.ok && result4.value ? cwd : "");
      }, () => {
      });
    return () => {
      active = false;
    };
  }, [cwd, tab.kind, workspaceInfo]);
  return tab.kind === "terminal" && cwd && remote === cwd ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { size: "sm", onClick: () => {
    dismiss();
    open(sessionId);
  }, children: t("\u67E5\u770B SSH \u7EC8\u7AEF\u72B6\u6001") }) : null;
}
function TerminalStatePane({ sessionId, remote, inputActions, active = true }) {
  const visible = usePageVisible(active);
  const [rows, setRows] = (0, import_react9.useState)([]), [selected, setSelected] = (0, import_react9.useState)("");
  const [error, setError] = (0, import_react9.useState)(""), [listError, setListError] = (0, import_react9.useState)(""), [notice, setNotice] = (0, import_react9.useState)("");
  const [preview, setPreview] = (0, import_react9.useState)(""), [busy, setBusy] = (0, import_react9.useState)(false);
  const generation = (0, import_react9.useRef)(0), insertion = (0, import_react9.useRef)();
  const refresh = (0, import_react9.useRef)(() => {
  });
  (0, import_react9.useEffect)(() => {
    if (!visible)
      return;
    const lifetime = new AbortController();
    let pending = false;
    setRows([]);
    setSelected("");
    setPreview("");
    setBusy(false);
    insertion.current = void 0;
    generation.current++;
    const poll = async () => {
      if (pending || lifetime.signal.aborted)
        return;
      pending = true;
      try {
        const result4 = await remote.list(sessionId, AbortSignal.any([lifetime.signal, AbortSignal.timeout(6e3)]));
        if (lifetime.signal.aborted)
          return;
        if (!result4.ok)
          throw new Error(result4.error.message);
        setRows(result4.value);
        setListError("");
        setSelected((previous) => result4.value.some((row2) => row2.id === previous) ? previous : result4.value[0]?.id ?? "");
      } catch (failure2) {
        if (!lifetime.signal.aborted) {
          setListError(String(failure2));
          setRows((previous) => previous.map((row2) => ({ ...row2, stale: true })));
        }
      } finally {
        pending = false;
      }
    };
    refresh.current = () => {
      void poll();
    };
    void poll();
    const timer = setInterval(() => {
      if (!document.hidden)
        void poll();
    }, 1500);
    return () => {
      lifetime.abort();
      clearInterval(timer);
      generation.current++;
    };
  }, [sessionId, remote, visible]);
  const capture = async () => {
    const revision = ++generation.current;
    setError("");
    setNotice("");
    setBusy(true);
    insertion.current = inputActions ? { actions: inputActions, span: inputActions.captureInsertion(), sessionId } : void 0;
    try {
      const result4 = await remote.context(sessionId, selected, AbortSignal.timeout(6e3));
      if (revision !== generation.current)
        return;
      if (!result4.ok)
        throw new Error(result4.error.message);
      setPreview(formatTerminalContext(result4.value));
    } catch (failure2) {
      if (revision === generation.current)
        setError(String(failure2));
    } finally {
      if (revision === generation.current)
        setBusy(false);
    }
  };
  const insert = () => {
    const target = insertion.current;
    if (!target || target.sessionId !== sessionId || target.actions !== inputActions || !target.actions.insertText(preview, target.span)) {
      setError(t("\u8349\u7A3F\u5DF2\u6539\u53D8\u6216\u8F93\u5165\u6846\u4E0D\u53EF\u7528\uFF0C\u672A\u8986\u76D6\u4EFB\u4F55\u5185\u5BB9\u3002\u8BF7\u590D\u5236\u7247\u6BB5\uFF0C\u6216\u91CD\u65B0\u9884\u89C8\u540E\u518D\u63D2\u5165\u3002"));
      return;
    }
    insertion.current = void 0;
    setError("");
    setNotice(t("\u5DF2\u63D2\u5165\u539F\u4F1A\u8BDD\u8349\u7A3F\uFF0C\u672A\u53D1\u9001\u3002"));
  };
  const row = rows.find((item) => item.id === selected);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { "aria-label": t("SSH \u7EC8\u7AEF\u72B6\u6001"), style: panelStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(PanelHeader, { title: t("\u7EC8\u7AEF\u72B6\u6001"), children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { size: "sm", variant: "ghost", onClick: () => refresh.current(), children: t("\u5237\u65B0\u72B6\u6001") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("summary", { children: t("\u72B6\u6001\u611F\u77E5\u8BF4\u660E") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("small", { children: t("\u4EC5\u89C2\u5BDF\u65B0\u5EFA\u7684\u53D7\u652F\u6301 Bash / Zsh\uFF0C\u5DF2\u6709\u7EC8\u7AEF\u4E0D\u6CE8\u5165\u3002\u547D\u4EE4\u884C\u8FD4\u56DE\u4E0D\u4EE3\u8868\u540E\u53F0\u4EFB\u52A1\u7ED3\u675F\uFF1B\u5D4C\u5957 SSH\u3001tmux \u5185\u90E8\u72B6\u6001\u672A\u77E5\u3002\u4E0D\u81EA\u52A8\u53D1\u9001\u6D88\u606F\u6216\u66F4\u6539 Agent \u76EE\u5F55\u3002") })
    ] }),
    listError && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { role: "alert", children: [
      t("\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF0C\u65E7\u7ED3\u679C\u5DF2\u6807\u8BB0\u8FC7\u671F\uFF1A"),
      listError
    ] }),
    !rows.length && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: t("\u5F53\u524D\u4F1A\u8BDD\u5C1A\u65E0\u7EC8\u7AEF\u3002\u8BF7\u4F7F\u7528\u4FA7\u8FB9\u680F\u7684\u201C\u65B0\u5EFA\u7EC8\u7AEF\u201D\u3002") }),
    rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { children: [
      t("\u5F53\u524D\u4F1A\u8BDD\u7EC8\u7AEF"),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("select", { "aria-label": t("\u5F53\u524D\u4F1A\u8BDD\u7EC8\u7AEF"), value: selected, onChange: (event) => {
        setSelected(event.target.value);
        setPreview("");
        insertion.current = void 0;
        generation.current++;
        setBusy(false);
      }, children: rows.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("option", { value: item.id, children: [
        item.title,
        " \xB7 ",
        item.alias,
        " \xB7 ",
        labels3()[item.state],
        item.stale ? t("\uFF08\u8FC7\u671F\uFF09") : ""
      ] }, item.id)) })
    ] }),
    row && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { role: "status", style: cardStyle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("strong", { children: [
          labels3()[row.state],
          row.stale ? t(" \xB7 \u8FC7\u671F") : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.PathLabel, { path: row.cwd ?? t("\u5F53\u524D\u76EE\u5F55\u672A\u77E5"), style: { fontSize: 12 } }),
        row.reason && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("small", { children: row.reason })
      ] }),
      row.current && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
        row.state === "running" && !row.stale ? t("\u8FD0\u884C\u4E2D") : t("\u672A\u786E\u8BA4\u7ED3\u675F\u7684\u547D\u4EE4"),
        "\uFF1A",
        row.current.command ?? t("\u547D\u4EE4\u6587\u672C\u672A\u77E5\uFF08\u5386\u53F2\u914D\u7F6E\u672A\u63D0\u4F9B\uFF09")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ol", { style: { paddingLeft: 20, margin: 0, display: "grid", gap: 10 }, children: row.recent.map((command2, index) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { style: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" }, children: [
        command2.command ?? t("\u547D\u4EE4\u6587\u672C\u672A\u77E5"),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("br", {}),
        t("\u9000\u51FA\u7801\uFF1A"),
        command2.exitCode ?? t("\u672A\u77E5"),
        " \xB7 ",
        command2.elapsedMs ?? t("\u672A\u77E5"),
        " ms",
        command2.uncertain ? t(" \xB7 \u4E8B\u4EF6\u4E0D\u5B8C\u6574") : ""
      ] }, `${command2.startedAt}-${index}`)) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void capture(), children: t("\u9884\u89C8\u7EC8\u7AEF\u4E0A\u4E0B\u6587") })
    ] }),
    preview && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { children: [
        t("\u62DF\u63D2\u5165\u7247\u6BB5\uFF08\u53EF\u5220\u9664\u4E0D\u9700\u8981\u7684\u5185\u5BB9\uFF1B\u5148\u68C0\u67E5\u5176\u4E2D\u662F\u5426\u542B\u5BC6\u94A5\u7B49\u654F\u611F\u4FE1\u606F\uFF09"),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("textarea", { "aria-label": t("\u7EC8\u7AEF\u4E0A\u4E0B\u6587\u9884\u89C8"), rows: 14, value: preview, onChange: (event) => setPreview(event.target.value), style: { width: "100%", fontFamily: "monospace" } })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { variant: "primary", onClick: insert, children: t("\u63D2\u5165\u539F\u4F1A\u8BDD\u8349\u7A3F") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives7.Button, { variant: "ghost", onClick: () => void (0, import_dsh_client_ui_primitives7.writeClipboard)(preview).then((ok) => ok ? setNotice(t("\u5DF2\u590D\u5236\uFF0C\u672A\u53D1\u9001\u3002")) : setError(t("\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5728\u9884\u89C8\u6846\u5185\u624B\u52A8\u9009\u62E9\u590D\u5236\u3002"))), children: t("\u590D\u5236\u7247\u6BB5") })
      ] })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { role: "alert", children: error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { role: "status", children: notice })
  ] });
}

// client/updates.tsx
var import_react11 = require("react");
var import_dsh_client_ui_primitives9 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/start-guide.tsx
var import_react10 = require("react");
var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime10 = require("react/jsx-runtime");
function GettingStarted({ expanded = false }) {
  const [notice, setNotice] = (0, import_react10.useState)("");
  const command2 = "ssh -o BatchMode=yes devbox true";
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("details", { open: expanded, style: { fontSize: 13, color: "var(--dsw-alias-label-primary)", lineHeight: 1.6 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("summary", { style: { cursor: "pointer", fontWeight: 600 }, children: t("\u5F00\u59CB\u4F7F\u7528") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("ol", { style: { margin: "12px 0", paddingLeft: 20, display: "grid", gap: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("strong", { children: t("\u5148\u786E\u8BA4 SSH \u53EF\u7528") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: { ...mutedStyle, margin: "4px 0" }, children: t("\u5728 DSH \u6240\u5728\u673A\u5668\u914D\u7F6E SSH Host \u522B\u540D\uFF0C\u8FDC\u7AEF\u9700\u8981 Python 3.8+\u3002\u5C06\u547D\u4EE4\u4E2D\u7684 devbox \u6362\u6210\u4F60\u7684\u522B\u540D\u3002") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { style: { overflowWrap: "anywhere" }, children: command2 }),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives8.Button, { size: "sm", variant: "ghost", onClick: () => void (0, import_dsh_client_ui_primitives8.writeClipboard)(command2).then((ok) => setNotice(ok ? t("\u5DF2\u590D\u5236\u68C0\u67E5\u547D\u4EE4\u3002") : t("\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u547D\u4EE4\u3002"))), children: t("\u590D\u5236\u547D\u4EE4") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("strong", { children: t("\u6DFB\u52A0\u8FDC\u7A0B\u5DE5\u4F5C\u533A") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: { ...mutedStyle, margin: "4px 0" }, children: t("\u4ECE\u5B98\u65B9\u201C\u6DFB\u52A0\u5DE5\u4F5C\u533A\u201D\u5165\u53E3\u9009\u62E9 SSH \u4E3B\u673A\uFF0C\u518D\u9009\u62E9\u8FDC\u7AEF\u6587\u4EF6\u5939\u3002Desktop \u4E0E Web \u7684\u63D2\u4EF6\u914D\u7F6E\u5206\u522B\u7BA1\u7406\u3002") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("strong", { children: t("\u5F00\u59CB\u5F00\u53D1") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: { ...mutedStyle, margin: "4px 0" }, children: t("\u4F7F\u7528\u5B98\u65B9\u201C\u5DE5\u4F5C\u533A\u6587\u4EF6\u201D\u548C\u201C\u65B0\u5EFA\u7EC8\u7AEF\u201D\uFF1BSSH \u6807\u8BC6\u6253\u5F00\u5FEB\u901F\u67E5\u627E\u3001\u4F20\u8F93\u3001\u8F6C\u53D1\u53CA\u7EC8\u7AEF\u72B6\u6001\u3002") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { style: mutedStyle, children: t("\u9996\u6B21\u5B89\u88C5\u540E\u5982\u672A\u51FA\u73B0\u5165\u53E3\uFF0C\u8BF7\u4FDD\u5B58\u5DE5\u4F5C\u5E76\u91CD\u542F\u5F53\u524D DSH\u3002\u641C\u7D22\u9700\u8981\u8FDC\u7AEF ripgrep\uFF1B\u5B83\u4E0D\u662F\u5EFA\u7ACB\u8FDE\u63A5\u7684\u524D\u63D0\u3002") }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("a", { href: "https://github.com/CrazyShout/dsh-ssh-remote/blob/main/docs/TROUBLESHOOTING.md", target: "_blank", rel: "noreferrer", children: t("\u5B89\u88C5\u4E0E\u8FDE\u63A5\u6392\u9519") }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { role: "status", children: notice })
  ] });
}

// client/update-store.ts
function newerRelease(target, current) {
  const parse2 = (s) => /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(s);
  const a = parse2(target), b = parse2(current);
  if (!a || !b || a[4])
    return false;
  for (let i = 1; i <= 3; i++)
    if (Number(a[i]) !== Number(b[i]))
      return Number(a[i]) > Number(b[i]);
  return Boolean(b[4]);
}
function validTarget(value) {
  if (!value || typeof value !== "object")
    return false;
  const r = value;
  return /^\d+\.\d+\.\d+$/u.test(r.version) && r.packageUrl === `https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v${r.version}/dsh-ssh-remote-${r.version}.tgz` && r.url === `https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v${r.version}` && /^[a-f0-9]{64}$/u.test(r.sha256);
}
function read(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw && raw.length < 16384 ? JSON.parse(raw) : void 0;
  } catch {
    return void 0;
  }
}
function write(storage, key, value) {
  try {
    if (value === void 0)
      storage?.removeItem(key);
    else
      storage?.setItem(key, JSON.stringify(value));
  } catch {
  }
}
function browserStorage(kind) {
  try {
    return window[kind];
  } catch {
    return void 0;
  }
}
var UpdateStore = class {
  constructor(remote, installer, preferences, receipts) {
    __publicField(this, "remote", remote);
    __publicField(this, "installer", installer);
    __publicField(this, "preferences", preferences);
    __publicField(this, "receipts", receipts);
    __publicField(this, "state", { checking: false, automatic: true, dismissed: "", error: "" });
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "epoch", 0);
    __publicField(this, "disposed", false);
    __publicField(this, "key", "");
    __publicField(this, "checkTask");
    __publicField(this, "recovery");
    __publicField(this, "timer");
    __publicField(this, "visible", true);
    __publicField(this, "getSnapshot", () => this.state);
    __publicField(this, "subscribe", (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    });
  }
  patch(patch) {
    if (this.disposed)
      return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners)
      listener();
  }
  receipt() {
    const r = read(this.receipts, `${this.key}:pending`);
    return r && /^[a-z0-9-]{16,80}$/iu.test(r.requestId) && validTarget(r.target) ? r : void 0;
  }
  async start() {
    const epoch = ++this.epoch;
    this.checkTask = void 0;
    this.recovery = void 0;
    clearTimeout(this.timer);
    this.patch({ checking: true, error: "" });
    try {
      const answer = await this.remote.info();
      if (this.disposed || epoch !== this.epoch)
        return;
      if (!answer.ok)
        throw new Error(answer.error.message);
      const info = answer.value, key = `dsh-ssh-remote:updates:${info.profileId}`;
      const changed = key !== this.key;
      this.key = key;
      const prefs = read(this.preferences, key);
      this.patch({
        info,
        checking: false,
        automatic: prefs?.automatic !== false,
        dismissed: typeof prefs?.dismissed === "string" ? prefs.dismissed : "",
        error: "",
        ...changed ? { release: void 0, operation: void 0 } : {}
      });
      const receipt = this.receipt();
      if (receipt)
        void this.reconcile();
      if (this.state.automatic && this.visible)
        void this.check(false);
    } catch (error) {
      if (epoch !== this.epoch)
        return;
      const message2 = String(error instanceof Error ? error.message : error);
      this.patch({ checking: false, error: t("\u65E0\u6CD5\u8BFB\u53D6\u63D2\u4EF6\u7248\u672C\uFF1A{value1}", { value1: message2 }) });
    }
  }
  setVisible(visible) {
    this.visible = visible;
    clearTimeout(this.timer);
    if (visible && this.state.info && this.state.automatic)
      void this.check(false);
  }
  setAutomatic(automatic) {
    this.patch({ automatic });
    this.savePreferences();
    clearTimeout(this.timer);
    if (automatic && this.visible)
      void this.check(false);
  }
  dismiss() {
    this.patch({ dismissed: this.state.release?.latest?.version ?? "" });
    this.savePreferences();
  }
  savePreferences() {
    if (this.key)
      write(this.preferences, this.key, { automatic: this.state.automatic, dismissed: this.state.dismissed });
  }
  check(force = true) {
    if (this.disposed || !this.state.info)
      return Promise.resolve();
    if (this.checkTask)
      return this.checkTask;
    const epoch = this.epoch;
    this.patch({ checking: true });
    const task = this.remote.check(force).then((result4) => {
      if (epoch !== this.epoch || this.disposed)
        return;
      this.patch(result4.ok ? { release: result4.value, error: "" } : { release: void 0, error: result4.error.message });
    }, (error) => {
      if (epoch === this.epoch)
        this.patch({ release: void 0, error: t("\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF1A{value1}", { value1: String(error instanceof Error ? error.message : error) }) });
    }).finally(() => {
      if (this.checkTask === task)
        this.checkTask = void 0;
      if (epoch !== this.epoch || this.disposed)
        return;
      this.patch({ checking: false });
      clearTimeout(this.timer);
      if (this.visible && this.state.automatic)
        this.timer = setTimeout(() => {
          void this.check(false);
        }, 6 * 60 * 6e4);
    });
    this.checkTask = task;
    return task;
  }
  available() {
    const { info, release } = this.state;
    return info && release?.latest && !release.error && validTarget(release.latest) && newerRelease(release.latest.version, info.installedVersion) ? release.latest : void 0;
  }
  busy() {
    return ["installing", "applying", "unknown"].includes(this.state.operation?.phase ?? "");
  }
  /** Called only by the explicit confirmation button. Recheck installation identity before any write. */
  async install(target) {
    if (this.busy() || this.disposed)
      return;
    const previous = this.state.info;
    if (!previous || !validTarget(target) || this.available()?.packageUrl !== target.packageUrl)
      return;
    const epoch = this.epoch;
    this.patch({ operation: { requestId: "", target, phase: "installing", message: t("\u6B63\u5728\u6838\u5BF9\u5B89\u88C5\u6765\u6E90\u2026") } });
    try {
      const fresh = await this.remote.info();
      if (this.disposed || epoch !== this.epoch)
        return;
      if (!fresh.ok)
        throw new Error(fresh.error.message);
      const info = fresh.value;
      if (info.profileId !== previous.profileId || info.source !== previous.source || info.installedVersion !== previous.installedVersion) {
        throw new Error(t("\u5B89\u88C5\u6765\u6E90\u6216\u7248\u672C\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0\u3002"));
      }
      if (info.sourceKind !== "release")
        throw new Error(info.sourceKind === "development" ? t("\u6E90\u7801\u94FE\u63A5\u5B89\u88C5\u8BF7\u4F7F\u7528 Git \u540C\u6B65\uFF0C\u4E0D\u4F1A\u88AB\u5B89\u88C5\u5305\u8986\u76D6\u3002") : t("\u6B64\u5B89\u88C5\u6765\u6E90\u4E0D\u652F\u6301\u76F4\u63A5\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u5B98\u65B9\u63D2\u4EF6\u9875\u3002"));
      if (!newerRelease(target.version, info.installedVersion))
        throw new Error(t("\u76EE\u6807\u4E0D\u518D\u662F\u66F4\u65B0\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002"));
      const requestId = crypto.randomUUID(), key = `${this.key}:pending`;
      write(this.receipts, key, { requestId, target });
      this.patch({ info, operation: { requestId, target, phase: "installing", message: t("\u6B63\u5728\u901A\u8FC7 DSH \u5B89\u88C5 {value1}\u2026", { value1: target.version }) } });
      const result4 = await this.installer.installBundle(target.packageUrl, { requestId, enabled: info.enabled });
      if (result4.ok) {
        if (read(this.receipts, key)?.requestId === requestId)
          write(this.receipts, key, { requestId, target, result: result4.value });
        if (!this.disposed && epoch === this.epoch)
          await this.result(requestId, target, result4.value);
      } else if (!this.disposed && epoch === this.epoch)
        this.patch({ operation: { requestId, target, phase: "unknown", message: t("\u5B89\u88C5\u54CD\u5E94\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u7ED3\u679C\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u88C5\u3002") } });
    } catch (error) {
      if (epoch !== this.epoch || this.disposed)
        return;
      const operation = this.state.operation;
      this.patch({ operation: {
        requestId: operation?.requestId ?? "",
        target,
        phase: operation?.requestId ? "unknown" : "failed",
        message: String(error instanceof Error ? error.message : error)
      } });
    }
  }
  progress(requestId, phase) {
    const op = this.state.operation;
    if (op?.requestId !== requestId || !this.busy())
      return;
    if (phase === "applying")
      this.patch({ operation: { ...op, phase: "applying", message: t("\u5B89\u88C5\u5305\u5DF2\u5C31\u7EEA\uFF0CDSH \u6B63\u5728\u5E94\u7528\u66F4\u65B0\u2026") } });
  }
  async cancel() {
    const op = this.state.operation;
    if (!op?.requestId || !["installing", "unknown"].includes(op.phase))
      return;
    try {
      const result4 = await this.installer.cancelInstall(op.requestId);
      if (this.disposed || this.state.operation?.requestId !== op.requestId || !this.busy())
        return;
      if (result4.ok && result4.value.status === "cancelled") {
        write(this.receipts, `${this.key}:pending`, void 0);
        this.patch({ operation: { ...op, phase: "cancelled", message: t("DSH \u5DF2\u786E\u8BA4\u53D6\u6D88\u5B89\u88C5\u3002") } });
      } else
        this.patch({ operation: { ...op, phase: "unknown", message: t("\u5B89\u88C5\u53EF\u80FD\u5DF2\u8FDB\u5165\u5E94\u7528\u9636\u6BB5\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u7ED3\u679C\u3002") } });
    } catch {
      if (this.state.operation?.requestId === op.requestId && this.busy())
        this.patch({ operation: { ...op, phase: "unknown", message: t("\u53D6\u6D88\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u5B89\u88C5\u7ED3\u679C\u3002") } });
    }
  }
  reconcile() {
    if (this.recovery)
      return this.recovery;
    const receipt = this.receipt();
    if (!receipt || this.disposed)
      return Promise.resolve();
    const epoch = this.epoch;
    this.patch({ operation: { requestId: receipt.requestId, target: receipt.target, phase: "installing", message: t("\u6B63\u5728\u786E\u8BA4\u4E0A\u6B21\u66F4\u65B0\u7ED3\u679C\u2026") } });
    const recovery = (async () => {
      try {
        if (receipt.result) {
          await this.result(receipt.requestId, receipt.target, receipt.result);
          return;
        }
        const info = await this.remote.info();
        if (this.disposed || epoch !== this.epoch)
          return;
        if (info.ok && info.value.installedVersion === receipt.target.version) {
          this.patch({ info: info.value });
          this.installed(receipt.requestId, receipt.target, info.value);
          return;
        }
        const result4 = await this.installer.waitForInstall(receipt.requestId);
        if (this.disposed || epoch !== this.epoch)
          return;
        if (result4.ok && result4.value)
          await this.result(receipt.requestId, receipt.target, result4.value);
        else
          this.patch({ operation: {
            requestId: receipt.requestId,
            target: receipt.target,
            phase: "unknown",
            message: t("\u4E0A\u6B21\u5B89\u88C5\u7ED3\u679C\u672A\u77E5\u3002\u8BF7\u5728\u5B98\u65B9\u63D2\u4EF6\u9875\u6838\u5BF9\u7248\u672C\uFF0C\u6216\u91CD\u65B0\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u88C5\u3002")
          } });
      } catch {
        if (epoch === this.epoch)
          this.patch({ operation: { requestId: receipt.requestId, target: receipt.target, phase: "unknown", message: t("\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u66F4\u65B0\u7ED3\u679C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u786E\u8BA4\u3002") } });
      }
    })().finally(() => {
      if (this.recovery === recovery)
        this.recovery = void 0;
    });
    this.recovery = recovery;
    return recovery;
  }
  installed(requestId, target, info) {
    const running = info.runningVersion === target.version;
    this.patch({ operation: {
      requestId,
      target,
      phase: running ? "done" : "restart",
      message: running ? t("\u5DF2\u66F4\u65B0\u5230 {value1}\u3002", { value1: target.version }) : t("\u5DF2\u5B89\u88C5 {value1}\uFF1B\u5F53\u524D\u4ECD\u8FD0\u884C {value2}\uFF0C\u8BF7\u4FDD\u5B58\u5DE5\u4F5C\u540E\u91CD\u542F DSH\u3002", { value1: target.version, value2: info.runningVersion })
    } });
    if (running)
      write(this.receipts, `${this.key}:pending`, void 0);
  }
  async result(requestId, target, result4) {
    if (this.disposed || this.state.operation?.requestId !== requestId)
      return;
    if (result4.application === "failed" || result4.application === "cancelled" || result4.error || result4.application === "overridden") {
      write(this.receipts, `${this.key}:pending`, void 0);
      const cancelled = result4.application === "cancelled";
      this.patch({ operation: { requestId, target, phase: cancelled ? "cancelled" : "failed", message: cancelled ? t("DSH \u5DF2\u786E\u8BA4\u53D6\u6D88\u5B89\u88C5\u3002") : result4.pendingBuilds?.length ? t("\u4F9D\u8D56\u9700\u8981\u6784\u5EFA\u786E\u8BA4\uFF08{value1}\uFF09\u3002\u8BF7\u5230\u5B98\u65B9\u63D2\u4EF6\u9875\u6309\u63D0\u793A\u5904\u7406\uFF1B\u672C\u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u6279\u51C6\u811A\u672C\u3002", { value1: result4.pendingBuilds.join("\u3001") }) : result4.error?.diagnostic || (String(result4.error?.code) === "already-installed" ? t("DSH \u62D2\u7EDD\u76F4\u63A5\u66FF\u6362\u6B64\u5B89\u88C5\u6765\u6E90\uFF0C\u8BF7\u5230\u5B98\u65B9\u63D2\u4EF6\u9875\u5904\u7406\u3002") : t("\u5B89\u88C5\u6216\u6FC0\u6D3B\u672A\u5B8C\u6210\uFF0C\u8BF7\u5728\u5B98\u65B9\u63D2\u4EF6\u9875\u67E5\u770B\u8BCA\u65AD\u3002")) } });
      return;
    }
    try {
      const info = await this.remote.info();
      if (this.disposed || this.state.operation?.requestId !== requestId)
        return;
      if (info.ok && info.value.installedVersion === target.version) {
        this.patch({ info: info.value });
        this.installed(requestId, target, info.value);
      } else if (info.ok && result4.application === "applied" && info.value.source !== target.packageUrl) {
        write(this.receipts, `${this.key}:pending`, void 0);
        this.patch({ info: info.value, operation: {
          requestId,
          target,
          phase: "failed",
          message: t("\u4E0A\u6B21\u5B89\u88C5\u5DF2\u7ED3\u675F\uFF0C\u4F46\u5F53\u524D\u7248\u672C\u6216\u6765\u6E90\u5DF2\u88AB\u66F4\u6539\u3002\u8BF7\u6838\u5BF9\u5F53\u524D\u5B89\u88C5\u540E\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0\u3002")
        } });
      } else
        this.patch({ operation: { requestId, target, phase: "unknown", message: t("\u5B89\u88C5\u5DF2\u8FD4\u56DE\uFF0C\u7248\u672C\u6216\u6FC0\u6D3B\u72B6\u6001\u4ECD\u5F85\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u3002") } });
    } catch {
      this.patch({ operation: { requestId, target, phase: result4.application === "restart-required" ? "restart" : "unknown", message: result4.application === "restart-required" ? t("DSH \u8981\u6C42\u91CD\u542F\u4EE5\u52A0\u8F7D {value1}\uFF0C\u8BF7\u5148\u4FDD\u5B58\u5DE5\u4F5C\u3002", { value1: target.version }) : t("DSH \u6B63\u5728\u91CD\u8F7D\u63D2\u4EF6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u786E\u8BA4\u66F4\u65B0\u7ED3\u679C\u3002") } });
    }
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
};

// client/updates.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var mine = (props) => props.subject.kind === "bundle" && props.subject.pkg.name === "dsh-ssh-remote";
var hint = { color: "var(--dsw-alias-label-secondary)", fontSize: 12 };
function UpdateSection(props) {
  const state = (0, import_react11.useSyncExternalStore)(props.updates.subscribe, props.updates.getSnapshot, props.updates.getSnapshot);
  const [confirm, setConfirm] = (0, import_react11.useState)();
  if (!mine(props))
    return null;
  const { info, release, operation } = state, available = props.updates.available();
  const busy = props.updates.busy(), failure2 = state.error || release?.error;
  const latest = release?.latest;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("section", { "aria-label": t("SSH \u63D2\u4EF6\u7248\u672C\u66F4\u65B0"), style: { marginTop: 24, display: "grid", gap: 12, minWidth: 0, fontSize: 13 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(GettingStarted, {}),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h4", { style: { margin: 0 }, children: t("\u7248\u672C\u66F4\u65B0") }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: t("\u5F53\u524D\u8FD0\u884C {version}", { version: info?.runningVersion || t("\u6B63\u5728\u8BFB\u53D6\u2026") }) }),
      available && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("strong", { children: t("\u53EF\u66F4\u65B0\u81F3 {version}", { version: available.version }) }),
      !available && latest && info && !failure2 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: hint, children: info.installedVersion === latest.version && info.runningVersion === latest.version ? t("\u5DF2\u662F\u6700\u65B0\u7A33\u5B9A\u7248") : t("\u6700\u65B0\u7A33\u5B9A\u7248 {value1}", { value1: latest.version }) }),
      state.checking && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { role: "status", style: hint, children: t("\u6B63\u5728\u68C0\u67E5\u2026") })
    ] }),
    info && info.runningVersion !== info.installedVersion && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { role: "status", style: { margin: 0 }, children: t("\u5DF2\u5B89\u88C5 {version}\uFF0C\u91CD\u65B0\u52A0\u8F7D\u6216\u91CD\u542F\u540E\u751F\u6548\u3002", { version: info.installedVersion }) }),
    failure2 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { role: "alert", style: { color: "var(--dsw-alias-label-error)", margin: 0, overflowWrap: "anywhere" }, children: failure2 }),
    failure2 && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("details", { style: hint, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("summary", { children: t("\u66F4\u65B0\u6392\u9519\u5EFA\u8BAE") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("\u5982\u679C\u521A\u5347\u7EA7\u63D2\u4EF6\uFF0C\u8BF7\u5148\u4FDD\u5B58\u5DE5\u4F5C\u5E76\u91CD\u542F\u5F53\u524D DSH\uFF0C\u518D\u68C0\u67E5\u66F4\u65B0\u3002\u5176\u4ED6\u9519\u8BEF\u8BF7\u4FDD\u7559\u539F\u59CB\u8BE6\u60C5\uFF0C\u5728\u5B98\u65B9\u63D2\u4EF6\u9875\u6838\u67E5\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u88C5\u3002") })
    ] }),
    info?.sourceKind === "development" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: { ...hint, margin: 0 }, children: t("\u5F53\u524D\u4F7F\u7528\u6E90\u7801\u94FE\u63A5\uFF0C\u8BF7\u4F7F\u7528 Git \u540C\u6B65\u3002\u6B64\u5904\u4E0D\u4F1A\u7528\u5B89\u88C5\u5305\u8986\u76D6\u4F60\u7684\u5F00\u53D1\u76EE\u5F55\u3002") }),
    info?.sourceKind === "unsupported" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: { ...hint, margin: 0 }, children: t("\u6B64\u5B89\u88C5\u6765\u6E90\u4E0D\u652F\u6301\u76F4\u63A5\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u5B98\u65B9\u63D2\u4EF6\u9875\u5B89\u88C5\u56FA\u5B9A\u7248\u672C\u3002") }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }, children: [
      available && info?.sourceKind === "release" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { variant: "primary", disabled: busy, onClick: () => setConfirm(available), children: t("\u66F4\u65B0\u5230 {version}", { version: available.version }) }),
      latest && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("a", { href: latest.url, target: "_blank", rel: "noreferrer", style: { ...hint, color: "var(--dsw-alias-label-link)" }, children: t("\u66F4\u65B0\u8BF4\u660E") })
    ] }),
    operation && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { role: operation.phase === "failed" ? "alert" : "status", "aria-live": "polite", style: { display: "grid", gap: 8, overflowWrap: "anywhere", color: operation.phase === "failed" ? "var(--dsw-alias-label-error)" : void 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: operation.message }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [
        operation.phase === "installing" && operation.requestId && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { size: "sm", variant: "outline", onClick: () => void props.updates.cancel(), children: t("\u53D6\u6D88\u5B89\u88C5") }),
        ["unknown", "restart"].includes(operation.phase) && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { size: "sm", variant: "outline", onClick: () => void props.updates.reconcile(), children: t("\u91CD\u65B0\u786E\u8BA4\u7ED3\u679C") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Checkbox, { checked: state.automatic, onChange: (checked) => props.updates.setAutomatic(checked), label: t("\u81EA\u52A8\u68C0\u67E5\u7A33\u5B9A\u7248\u66F4\u65B0\uFF08\u6BCF 6 \u5C0F\u65F6\uFF09") }),
    release?.checkedAt && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { style: hint, children: [
      t("\u4E0A\u6B21\u68C0\u67E5\uFF1A"),
      formatDateTime(release.checkedAt)
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("details", { style: { ...hint, overflowWrap: "anywhere" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("summary", { style: { cursor: "pointer" }, children: t("\u5B89\u88C5\u6765\u6E90\u4E0E\u66F4\u65B0\u8BF4\u660E") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("\u53EA\u67E5\u8BE2\u672C\u9879\u76EE\u7684 GitHub Release\uFF0C\u4E0D\u4E0A\u4F20\u4F1A\u8BDD\u3001SSH \u914D\u7F6E\u6216\u9879\u76EE\u5185\u5BB9\u3002\u5B89\u88C5\u3001\u4F9D\u8D56\u5BA1\u6279\u548C\u662F\u5426\u9700\u8981\u91CD\u542F\u7531 DSH \u5224\u65AD\u3002") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
        t("\u6765\u6E90\uFF1A"),
        info?.source || t("\u4E0D\u53EF\u7528")
      ] }),
      latest && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
          t("\u5DF2\u9A8C\u6536 DSH\uFF1A"),
          latest.testedDshVersions.join(" / ")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("p", { children: [
          t("\u53D1\u5E03\u65B9 SHA-256\uFF1A"),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("code", { children: latest.sha256 })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { children: t("\u6E90\u7801\u94FE\u63A5\u4E0D\u81EA\u52A8\u66FF\u6362\uFF1B\u672C\u6B21\u6253\u5F00\u7684\u5E94\u7528\u4E0E\u5176\u4ED6 Web/Desktop profile \u5206\u522B\u7BA1\u7406\u3002") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Modal, { open: Boolean(confirm), onClose: () => setConfirm(void 0), closeLabel: t("\u53D6\u6D88\u66F4\u65B0"), title: t("\u66F4\u65B0 dsh-ssh-remote \u81F3 {value1}", { value1: confirm?.version ?? "" }), description: t("\u66F4\u65B0\u4F1A\u91CD\u8F7D SSH \u63D2\u4EF6\uFF0C\u53EF\u80FD\u7ED3\u675F\u8FDC\u7A0B\u7EC8\u7AEF\u3001\u7AEF\u53E3\u8F6C\u53D1\u6216\u4E2D\u65AD\u4F20\u8F93\u3002\u8BF7\u5148\u4FDD\u5B58\u7F16\u8F91\u8349\u7A3F\u5E76\u6682\u505C\u4F20\u8F93\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u542F DSH\u3002"), footer: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { variant: "outline", "data-modal-autofocus": true, onClick: () => setConfirm(void 0), children: t("\u6682\u4E0D\u66F4\u65B0") }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { variant: "primary", onClick: () => {
        const target = confirm;
        setConfirm(void 0);
        if (target)
          void props.updates.install(target);
      }, children: t("\u786E\u8BA4\u66F4\u65B0") })
    ] }), children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { style: { ...hint, overflowWrap: "anywhere" }, children: confirm?.packageUrl }) })
  ] });
}
function UpdateAction(props) {
  const state = (0, import_react11.useSyncExternalStore)(props.updates.subscribe, props.updates.getSnapshot, props.updates.getSnapshot);
  return mine(props) ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Button, { disabled: state.checking || props.updates.busy(), onClick: () => {
    if (state.info)
      void props.updates.check(true);
    else
      void props.updates.start();
  }, children: t("\u68C0\u67E5\u66F4\u65B0") }) : null;
}
function UpdateBadge(props) {
  (0, import_react11.useSyncExternalStore)(props.updates.subscribe, props.updates.getSnapshot, props.updates.getSnapshot);
  return mine(props) && props.updates.available() ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { style: { fontSize: 12, borderRadius: 6, padding: "2px 6px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-link)" }, children: t("\u6709\u53EF\u7528\u66F4\u65B0") }) : null;
}
function UpdateNotice({ updates, openUpdates }) {
  const state = (0, import_react11.useSyncExternalStore)(updates.subscribe, updates.getSnapshot, updates.getSnapshot);
  const visible = usePageVisible(), target = updates.available();
  if (!visible || !state.automatic || !target || state.dismissed === target.version || updates.busy())
    return null;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives9.Toast, { text: t("SSH \u63D2\u4EF6 {value1} \u53EF\u7528\u3002", { value1: target.version }), holdMs: 12e3, actions: [{ label: t("\u67E5\u770B\u66F4\u65B0"), onClick: () => {
    updates.dismiss();
    openUpdates();
  } }, { label: t("\u7A0D\u540E"), onClick: () => updates.dismiss() }], onDone: () => updates.dismiss() }, target.version);
}
function mountPluginUpdates(ctx) {
  const fiber = ctx.inject(["remote.sshRemoteUpdates", "remote.pluginManager", "slots", "pluginNavigation"], (scope6) => {
    if (!scope6.remote.sshRemoteUpdates || !scope6.remote.pluginManager)
      return () => {
      };
    const updates = new UpdateStore(scope6.remote.sshRemoteUpdates, scope6.remote.pluginManager, browserStorage("localStorage"), browserStorage("sessionStorage"));
    const inject2 = () => ({ updates, openUpdates: () => scope6.pluginNavigation.openBundle("dsh-ssh-remote") });
    const registrations = [
      scope6.slots.inject("plugins.detail.actions", () => scope6.slots.register({ name: "plugins.detail.actions", id: "ssh-updates.action", order: 50, inject: inject2 }, localized(UpdateAction))),
      scope6.slots.inject("plugins.detail.badge", () => scope6.slots.register({ name: "plugins.detail.badge", id: "ssh-updates.badge", order: 50, inject: inject2 }, localized(UpdateBadge))),
      scope6.slots.inject("plugins.detail.section", () => scope6.slots.register({ name: "plugins.detail.section", id: "ssh-updates.section", order: 50, inject: inject2 }, localized(UpdateSection))),
      scope6.slots.inject("shell.overlay", () => scope6.slots.register({ name: "shell.overlay", id: "ssh-updates.notice", inject: inject2 }, localized(UpdateNotice))),
      scope6.remote.$on("plugin-manager/install-state", (event) => updates.progress(event.requestId, event.phase)),
      scope6.on("connection/reset", () => {
        void updates.start();
      })
    ];
    const visibility = () => updates.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    void updates.start();
    return () => {
      updates.dispose();
      document.removeEventListener("visibilitychange", visibility);
      for (const dispose of registrations)
        dispose();
    };
  });
  return async () => {
    await fiber.dispose();
  };
}

// client/directory-flow.tsx
var import_react12 = require("react");
var import_dsh_client_ui_primitives10 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/local-browse.ts
function windowsDriveAnchors(entries) {
  return entries.filter((entry2) => /^[A-Za-z]$/.test(entry2.name)).map((entry2) => ({
    label: `Windows \xB7 ${entry2.name.toUpperCase()}:`,
    path: `/mnt/${entry2.name.toLowerCase()}`
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

// client/directory-flow.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function SshDirectoryFlow({ open, busy, onPicked, onCancel, onError, ssh, pickLocal, listLocal, createLocalDirectory, createWorkspace, renameWorkspace }) {
  const [config2, setConfig] = (0, import_react12.useState)(null);
  const [target, setTarget] = (0, import_react12.useState)(null);
  const [listing, setListing] = (0, import_react12.useState)(null);
  const [loading, setLoading] = (0, import_react12.useState)(false);
  const [mutating, setMutating] = (0, import_react12.useState)(false);
  const [error, setError] = (0, import_react12.useState)("");
  const [newFolder, setNewFolder] = (0, import_react12.useState)("");
  const [pathInput, setPathInput] = (0, import_react12.useState)("");
  const [pathDirty, setPathDirty] = (0, import_react12.useState)(false);
  const [composingPath, setComposingPath] = (0, import_react12.useState)(false);
  const pathTimer = (0, import_react12.useRef)();
  const [localCanBrowse, setLocalCanBrowse] = (0, import_react12.useState)(null);
  const [configLoading, setConfigLoading] = (0, import_react12.useState)(false);
  const [configError, setConfigError] = (0, import_react12.useState)("");
  const [localProbeError, setLocalProbeError] = (0, import_react12.useState)("");
  const [driveAnchors, setDriveAnchors] = (0, import_react12.useState)(null);
  const navigationEpoch = (0, import_react12.useRef)(0);
  const mutationEpoch = (0, import_react12.useRef)(0);
  const mounted = (0, import_react12.useRef)(false);
  const nativePicker = (0, import_react12.useRef)(null);
  function clearPathTimer() {
    clearTimeout(pathTimer.current);
    pathTimer.current = void 0;
  }
  (0, import_react12.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      navigationEpoch.current += 1;
      mutationEpoch.current += 1;
      nativePicker.current?.abort();
      clearPathTimer();
    };
  }, []);
  (0, import_react12.useEffect)(() => {
    if (!open)
      return;
    ++navigationEpoch.current;
    let active = true;
    setConfig(null);
    setTarget(null);
    setListing(null);
    setError("");
    setNewFolder("");
    setPathInput("");
    setPathDirty(false);
    setComposingPath(false);
    setDriveAnchors(null);
    setLocalCanBrowse(null);
    setLoading(false);
    setConfigError("");
    setLocalProbeError("");
    setConfigLoading(true);
    void withReadDeadline(ssh.config(), t("SSH \u914D\u7F6E\u8BFB\u53D6")).then((result4) => {
      if (!active)
        return;
      if (result4.ok)
        setConfig(result4.value);
      else
        setConfigError(result4.error.message);
    }, (reason) => {
      if (active)
        setConfigError(messageOf(reason));
    }).finally(() => {
      if (active)
        setConfigLoading(false);
    });
    void probeLocalBrowse(() => withReadDeadline(listLocal(), t("\u672C\u673A\u6D4F\u89C8"))).then((value) => {
      if (active)
        setLocalCanBrowse(value);
    }, (reason) => {
      if (active)
        setLocalProbeError(t("\u672C\u673A\u6D4F\u89C8\u63A2\u6D4B\u5931\u8D25\uFF1A{value1}", { value1: messageOf(reason) }));
    });
    return () => {
      active = false;
      navigationEpoch.current += 1;
      nativePicker.current?.abort();
      clearPathTimer();
    };
  }, [open, ssh, listLocal]);
  (0, import_react12.useEffect)(() => {
    if (!open || !target || !pathDirty || !pathInput || composingPath || busy || mutating)
      return;
    pathTimer.current = setTimeout(() => {
      void enter(target, pathInput, true);
    }, 300);
    return clearPathTimer;
  }, [open, target, pathInput, pathDirty, composingPath, busy, mutating]);
  (0, import_react12.useEffect)(() => {
    if (!open || target?.kind !== "local" || driveAnchors !== null)
      return;
    const epoch = navigationEpoch.current;
    let cancelled = false;
    void asResult(() => withReadDeadline(listLocal("/mnt"), t("\u672C\u673A\u78C1\u76D8\u63A2\u6D4B"))).then((result4) => {
      if (!cancelled && navigationEpoch.current === epoch) {
        setDriveAnchors(result4.ok ? windowsDriveAnchors(result4.value.entries) : []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, target, driveAnchors, listLocal]);
  async function browseLocalRaw(path2) {
    try {
      return { ok: true, value: await withReadDeadline(listLocal(path2), t("\u672C\u673A\u6D4F\u89C8")) };
    } catch (error2) {
      return { ok: false, error: error2 };
    }
  }
  async function enter(targetNext, path2, preserveInput = false) {
    clearPathTimer();
    const epoch = ++navigationEpoch.current;
    setLoading(true);
    setError("");
    if (targetNext.kind === "ssh") {
      let result4;
      try {
        result4 = await withReadDeadline(ssh.browse(targetNext.alias, path2 ?? ""), t("\u8FDC\u7A0B\u76EE\u5F55\u6D4F\u89C8"));
      } catch (reason) {
        if (navigationEpoch.current === epoch) {
          setError(messageOf(reason));
          setLoading(false);
        }
        return false;
      }
      if (navigationEpoch.current !== epoch)
        return false;
      if (result4.ok) {
        setTarget(targetNext);
        setListing(result4.value);
        if (!preserveInput)
          setPathInput(result4.value.path);
        setPathDirty(false);
      } else {
        setError(result4.error.message);
      }
      setLoading(false);
      return result4.ok;
    }
    const outcome = await browseLocalRaw(path2);
    if (navigationEpoch.current !== epoch)
      return false;
    if (outcome.ok) {
      setTarget(targetNext);
      setListing(outcome.value);
      if (!preserveInput)
        setPathInput(outcome.value.path);
      setPathDirty(false);
    } else {
      setError(messageOf(outcome.error));
    }
    setLoading(false);
    return outcome.ok;
  }
  function navigate(path2) {
    if (target)
      void enter(target, path2);
  }
  async function chooseLocal() {
    if (localCanBrowse !== false) {
      const epoch = ++navigationEpoch.current;
      setLoading(true);
      setError("");
      const outcome = await browseLocalRaw();
      if (navigationEpoch.current !== epoch)
        return;
      if (outcome.ok) {
        setLoading(false);
        setTarget({ kind: "local" });
        setListing(outcome.value);
        setPathInput(outcome.value.path);
        setPathDirty(false);
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
      const path2 = await withDeadline(pickLocal(controller.signal), t("\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668\u8D85\u8FC7 30 \u79D2\u672A\u8FD4\u56DE\uFF0C\u5DF2\u505C\u6B62\u7B49\u5F85\u3002\u82E5\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4ECD\u5728\u6216\u7F6E\u4E8E\u540E\u53F0\uFF0C\u8BF7\u5148\u5173\u95ED\u540E\u91CD\u8BD5\uFF1B\u82E5\u4ECD\u65E0\u5BF9\u8BDD\u6846\uFF0C\u8BF7\u91CD\u542F DSH \u540E\u518D\u8BD5\u3002"), READ_DEADLINE_MS, () => controller.abort());
      if (navigationEpoch.current === epoch && path2)
        onPicked(path2);
    } catch (reason) {
      if (navigationEpoch.current === epoch)
        setError(messageOf(reason));
    } finally {
      if (nativePicker.current === controller)
        nativePicker.current = null;
      if (navigationEpoch.current === epoch)
        setLoading(false);
    }
  }
  async function commit() {
    if (!target || !listing || pathDirty)
      return;
    clearPathTimer();
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
      const result4 = await withMutationDeadline(ssh.materializeWorkspace(target.alias, listing.path), t("\u8FDC\u7A0B\u5DE5\u4F5C\u533A\u9A8C\u8BC1"));
      if (navigationEpoch.current !== epoch)
        return;
      if (result4.ok) {
        const workspace = await withMutationDeadline(createWorkspace({ path: result4.value.anchorPath }), t("\u5DE5\u4F5C\u533A\u521B\u5EFA"));
        if (navigationEpoch.current !== epoch)
          return;
        if (workspace.title !== result4.value.title) {
          await withMutationDeadline(renameWorkspace(workspace.workspaceId, result4.value.title), t("\u5DE5\u4F5C\u533A\u547D\u540D"));
          if (navigationEpoch.current !== epoch)
            return;
        }
        onPicked(result4.value.anchorPath);
      } else {
        onError(result4.error.message);
      }
    } catch (reason) {
      if (navigationEpoch.current === epoch)
        onError(messageOf(reason));
    } finally {
      if (navigationEpoch.current === epoch)
        setLoading(false);
      if (mounted.current && mutationEpoch.current === mutation)
        setMutating(false);
    }
  }
  async function createFolder() {
    if (!target || !listing || pathDirty || !newFolder.trim())
      return;
    clearPathTimer();
    const epoch = ++navigationEpoch.current;
    const mutation = ++mutationEpoch.current;
    const targetSnapshot = target;
    const listingPath = listing.path;
    const folderName = newFolder.trim();
    setLoading(true);
    setMutating(true);
    setError("");
    try {
      const created = targetSnapshot.kind === "ssh" ? await withMutationDeadline(ssh.createDirectory(targetSnapshot.alias, listingPath, folderName), t("\u8FDC\u7A0B\u6587\u4EF6\u5939\u521B\u5EFA")) : await asResult(() => withMutationDeadline(createLocalDirectory(listingPath, folderName), t("\u672C\u673A\u6587\u4EF6\u5939\u521B\u5EFA")));
      if (navigationEpoch.current !== epoch)
        return;
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
      if (mounted.current && mutationEpoch.current === mutation)
        setMutating(false);
    }
  }
  function cancel() {
    clearPathTimer();
    navigationEpoch.current += 1;
    nativePicker.current?.abort();
    onCancel();
  }
  const disabled = loading || busy || mutating;
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    import_dsh_client_ui_primitives10.Modal,
    {
      open,
      onClose: () => {
        if (!busy && !mutating)
          cancel();
      },
      className: "dsh-ssh-remote-flow",
      title: !target ? t("\u6DFB\u52A0\u5DE5\u4F5C\u533A") : target.kind === "local" ? t("\u672C\u673A\u6587\u4EF6") : `SSH \xB7 ${target.alias}`,
      closeLabel: t("\u5173\u95ED"),
      description: listing ? listing.path : t("\u9009\u62E9\u672C\u673A\u6587\u4EF6\u5939\u6216 SSH \u4E3B\u673A"),
      footer: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { variant: "ghost", disabled: busy || mutating, onClick: cancel, children: t("\u53D6\u6D88") }),
        target && listing && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { variant: "primary", disabled: disabled || pathDirty, onClick: () => void commit(), children: busy ? t("\u6B63\u5728\u6DFB\u52A0\u2026") : t("\u6253\u5F00\u6B64\u6587\u4EF6\u5939") })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("style", { children: ".dsh-ssh-remote-flow{width:min(880px,94vw)}.dsh-ssh-remote-flow .dsh-ssh-remote-field{width:100%;box-sizing:border-box}" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
          !target || !listing ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_dsh_client_ui_primitives10.Button, { variant: "outline", disabled: disabled || localCanBrowse === null && !localProbeError, onClick: () => void chooseLocal(), style: sourceRowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: t("\u672C\u673A") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: subtleText, children: localCanBrowse === false ? t("\u4F7F\u7528\u7CFB\u7EDF\u6587\u4EF6\u5939\u9009\u62E9\u5668") : t("\u5728\u5E94\u7528\u5185\u6D4F\u89C8 Host \u6587\u4EF6\u7CFB\u7EDF\uFF08\u542B /mnt \u4E0B\u7684 Windows \u76D8\uFF09") })
            ] }),
            localCanBrowse === null && !localProbeError && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { role: "status", style: subtleText, children: t("\u6B63\u5728\u68C0\u67E5\u672C\u673A\u76EE\u5F55\u6D4F\u89C8\u2026") }),
            localProbeError && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { role: "alert", style: subtleText, children: localProbeError }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: hostListStyle, children: [
              configLoading && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { role: "status", style: subtleText, children: t("\u6B63\u5728\u8BFB\u53D6 SSH \u4E3B\u673A\u2026") }),
              configError && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { role: "alert", children: configError }),
              config2?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_dsh_client_ui_primitives10.Button, { variant: "outline", disabled, onClick: () => void enter({ kind: "ssh", alias: host.alias }), style: sourceRowStyle, children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: host.alias }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { style: subtleText, children: [
                  host.user ? `${host.user}@` : "",
                  host.host,
                  ":",
                  host.port
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: dimmedText, children: helperStateLabel(host.helper.status) }),
                host.helper.error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: { ...dimmedText, color: "var(--dsw-alias-label-error)" }, children: host.helper.error }),
                host.helper.environment?.search.available === false && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: dimmedText, children: searchSummary(host.helper) })
              ] }, host.alias)),
              !configLoading && config2?.hosts.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: subtleText, children: t("~/.ssh/config \u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5177\u4F53 Host\u3002") })
            ] })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Input, { "aria-label": t("\u6587\u4EF6\u5939\u8DEF\u5F84"), className: "dsh-ssh-remote-field", value: pathInput, spellCheck: false, autoCorrect: "off", autoCapitalize: "none", disabled: busy || mutating, onChange: (event) => {
                clearPathTimer();
                navigationEpoch.current += 1;
                setLoading(false);
                setError("");
                setPathInput(event.target.value);
                setPathDirty(event.target.value !== listing.path);
              }, onCompositionStart: () => {
                clearPathTimer();
                navigationEpoch.current += 1;
                setLoading(false);
                setComposingPath(true);
              }, onCompositionEnd: () => setComposingPath(false), onKeyDown: (event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && !composingPath && pathInput) {
                  event.preventDefault();
                  navigate(pathInput);
                }
              }, placeholder: t("\u8F93\u5165\u5B8C\u6574\u6587\u4EF6\u5939\u8DEF\u5F84") }) }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { disabled: busy || mutating || !pathInput, onClick: () => navigate(pathInput), children: t("\u524D\u5F80") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { disabled: busy || mutating, onClick: () => navigate(listing.path), children: t("\u5237\u65B0\u76EE\u5F55") }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { disabled: busy || mutating, onClick: () => navigate(listing.home), children: t("\u4E3B\u76EE\u5F55") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: chipRowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Pill, { disabled, onClick: () => {
                clearPathTimer();
                navigationEpoch.current += 1;
                setPathDirty(false);
                setTarget(null);
                setListing(null);
              }, children: target.kind === "local" ? t("\u672C\u673A") : t("\u4E3B\u673A") }),
              listing.crumbs.map((crumb) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Pill, { disabled, onClick: () => navigate(crumb.path), children: crumb.name }, crumb.path))
            ] }),
            target.kind === "local" && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: chipRowStyle, children: [
              (driveAnchors ?? []).map((anchor) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Pill, { disabled, onClick: () => navigate(anchor.path), children: anchor.label }, anchor.path)),
              driveAnchors === null && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: subtleText, children: t("\u68C0\u6D4B Windows \u76D8\u2026") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: entryListStyle, children: [
              listing.entries.map((entry2) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_dsh_client_ui_primitives10.Button, { variant: "ghost", size: "sm", icon: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.IconFolderCloseRegular, {}), disabled, onClick: () => navigate(entry2.path), style: entryRowStyle, children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: entry2.name }),
                entry2.hidden && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { style: { marginLeft: "auto", ...dimmedText }, children: t("\u9690\u85CF") })
              ] }, entry2.path)),
              !loading && listing.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { padding: 16, ...dimmedText }, children: t("\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u6587\u4EF6\u5939\u3002") })
            ] }),
            listing.truncated && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { fontSize: 12, ...dimmedText }, children: t("\u76EE\u5F55\u5217\u8868\u5DF2\u622A\u65AD\uFF08\u6700\u591A 1000 \u9879\uFF09\uFF1B\u672A\u663E\u793A\u7684\u6587\u4EF6\u5939\u53EF\u8F93\u5165\u5B8C\u6574\u8DEF\u5F84\u524D\u5F80\u3002") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Input, { value: newFolder, spellCheck: false, autoCorrect: "off", autoCapitalize: "none", className: "dsh-ssh-remote-field", disabled: disabled || pathDirty, onChange: (event) => setNewFolder(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter")
                  void createFolder();
              }, placeholder: t("\u65B0\u5EFA\u6587\u4EF6\u5939\u540D\u79F0") }) }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.Button, { variant: "ghost", icon: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_dsh_client_ui_primitives10.IconPlusOutlineRegular, {}), disabled: disabled || pathDirty || !newFolder.trim(), onClick: () => void createFolder(), children: t("\u65B0\u5EFA") })
            ] })
          ] }),
          loading && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { role: "status", style: subtleText, children: t("\u6B63\u5728\u8BFB\u53D6\u2026") }),
          pathDirty && !loading && !error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { role: "status", style: subtleText, children: t("\u8F93\u5165\u505C\u987F\u540E\u81EA\u52A8\u524D\u5F80\uFF1BEnter \u53EF\u7ACB\u5373\u524D\u5F80\u3002") }),
          error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: error })
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

// client/connection-settings.tsx
var import_react14 = require("react");
var import_dsh_client_ui_primitives12 = require("@deepseek-ai/dsh-client-ui-primitives");

// client/migration.tsx
var import_react13 = require("react");
var import_dsh_client_ui_primitives11 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime13 = require("react/jsx-runtime");
function MigrationWizard({ ssh, onComplete }) {
  const [preview, setPreview] = (0, import_react13.useState)();
  const [aliases, setAliases] = (0, import_react13.useState)({});
  const [result4, setResult] = (0, import_react13.useState)();
  const [recoveryId, setRecoveryId] = (0, import_react13.useState)("");
  const [busy, setBusy] = (0, import_react13.useState)(false), [error, setError] = (0, import_react13.useState)("");
  const revision = (0, import_react13.useRef)(0);
  (0, import_react13.useEffect)(() => () => {
    revision.current++;
  }, [ssh]);
  async function run(action) {
    const current = ++revision.current;
    setBusy(true);
    setError("");
    try {
      if (action === "preview") {
        const response = await ssh.migrationPreview(Object.entries(aliases).map(([name2, alias]) => ({ name: name2, alias })));
        if (current !== revision.current)
          return;
        if (!response.ok)
          throw new Error(response.error.message);
        setPreview(response.value);
      } else if (action === "apply" && preview?.ready) {
        const response = await ssh.migrationApply(preview.token);
        if (current !== revision.current)
          return;
        if (!response.ok)
          throw new Error(response.error.message);
        setResult(response.value);
        setPreview(void 0);
        onComplete();
      } else if (action === "rollback" && (result4 || recoveryId)) {
        const response = await ssh.migrationRollback(result4?.id ?? recoveryId.trim());
        if (current !== revision.current)
          return;
        if (!response.ok)
          throw new Error(response.error.message);
        setResult(void 0);
        setRecoveryId("");
        onComplete();
      }
    } catch (reason) {
      if (current === revision.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (current === revision.current)
        setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("section", { "aria-label": t("\u8FC1\u79FB\u65E7 SSH \u914D\u7F6E"), style: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("strong", { children: t("\u8FC1\u79FB\u65E7 SSH \u914D\u7F6E") }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)" }, children: t("\u65E7 SFTP \u540E\u7AEF\u5DF2\u79FB\u9664\u3002\u786E\u8BA4\u6539\u52A8\u540E\u8FC1\u5165 OpenSSH\uFF0C\u4FDD\u7559\u73B0\u6709\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\u3002") }),
    preview?.hosts.map((host) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { style: { display: "grid", gap: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { children: [
        host.name,
        " \u2192 ",
        host.user ? `${host.user}@` : "",
        host.host,
        ":",
        host.port
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives11.Input, { "aria-label": t("{value1} \u7684 SSH \u522B\u540D", { value1: host.name }), value: aliases[host.name] ?? host.alias, disabled: busy, onChange: (event) => {
        setAliases((current) => ({ ...current, [host.name]: event.target.value }));
        setPreview((current) => current && { ...current, ready: false });
      } }),
      host.error && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { role: "alert", children: host.error })
    ] }, host.name)),
    preview && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("details", { open: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("summary", { children: t("\u6838\u5BF9\u5199\u5165\u5DEE\u5F02\uFF08\u4EC5\u914D\u7F6E\uFF0C\u4E0D\u8BFB\u53D6\u79C1\u94A5\uFF09") }),
      ["config", "fragment"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { minWidth: 0 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("code", { style: { overflowWrap: "anywhere" }, children: key === "config" ? preview.configPath : preview.fragmentPath }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { display: "grid", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("summary", { children: t("\u4FEE\u6539\u524D") }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" }, children: preview.before[key] || t("\uFF08\u6587\u4EF6\u4E0D\u5B58\u5728\uFF09") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto" }, children: preview.after[key] })
        ] })
      ] }, key))
    ] }),
    result4 && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { role: "status", children: [
      t("\u5DF2\u9A8C\u8BC1\uFF1A"),
      result4.verified.join("\u3001") || t("\u6682\u65E0"),
      Object.entries(result4.errors).map(([alias, message2]) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { role: "alert", children: [
        alias,
        "\uFF1A",
        message2,
        t("\uFF08\u914D\u7F6E\u5DF2\u4FDD\u7559\uFF0C\u5DE5\u4F5C\u533A\u672A\u91CD\u6620\u5C04\uFF09")
      ] }, alias)),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { fontSize: 12 }, children: [
        t("\u8FC1\u79FB\u8BB0\u5F55\uFF1A"),
        result4.id
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives11.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void run("preview"), children: busy ? t("\u5904\u7406\u4E2D\u2026") : preview ? t("\u91CD\u65B0\u68C0\u67E5\u5DEE\u5F02") : t("\u68C0\u67E5\u65E7\u914D\u7F6E") }),
      preview && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives11.Button, { size: "sm", variant: "primary", disabled: busy || !preview.ready, onClick: () => void run("apply"), children: t("\u786E\u8BA4\u3001\u5907\u4EFD\u5E76\u8FC1\u79FB") }),
      result4 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives11.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void run("rollback"), children: t("\u56DE\u6EDA\u672C\u6B21\u8FC1\u79FB") })
    ] }),
    !result4 && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("summary", { children: t("\u6062\u590D\u6216\u56DE\u6EDA\u5DF2\u6709\u8FC1\u79FB") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { style: { fontSize: 12 }, children: t("\u8F93\u5165\u4E4B\u524D\u4FDD\u5B58\u7684\u8FC1\u79FB\u8BB0\u5F55 ID\u3002\u914D\u7F6E\u6709\u540E\u7EED\u4FEE\u6539\u65F6\u4F1A\u62D2\u7EDD\u56DE\u6EDA\uFF0C\u907F\u514D\u8986\u76D6\u4F60\u7684\u66F4\u6539\u3002") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives11.Input, { "aria-label": t("\u8FC1\u79FB\u8BB0\u5F55 ID"), value: recoveryId, onChange: (event) => setRecoveryId(event.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_dsh_client_ui_primitives11.Button, { size: "sm", variant: "outline", disabled: busy || !recoveryId.trim(), onClick: () => void run("rollback"), children: t("\u6838\u5BF9\u5E76\u56DE\u6EDA") })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)" }, children: error })
  ] });
}

// client/connection-settings.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
function SshRemotePanel({ ssh, connectionStatus }) {
  const [config2, setConfig] = (0, import_react14.useState)(null);
  const [error, setError] = (0, import_react14.useState)("");
  const [loading, setLoading] = (0, import_react14.useState)(false);
  const [actions, setActions] = (0, import_react14.useState)({});
  const [hostErrors, setHostErrors] = (0, import_react14.useState)({});
  const [details, setDetails] = (0, import_react14.useState)(null);
  const epoch = (0, import_react14.useRef)(0);
  const mounted = (0, import_react14.useRef)(false);
  const actionEpochs = (0, import_react14.useRef)(/* @__PURE__ */ new Map());
  const statusRevision = (0, import_react14.useRef)(0);
  const visible = usePageVisible();
  const snapshot = (0, import_react14.useSyncExternalStore)(connectionStatus.subscribe, connectionStatus.getSnapshot, connectionStatus.getSnapshot);
  const aliases = config2?.hosts.map((host) => host.alias).join("\0") ?? "";
  (0, import_react14.useEffect)(() => {
    if (!visible || !aliases)
      return;
    const releases = aliases.split("\0").map((alias) => connectionStatus.retain(`settings\0${alias}`));
    return () => {
      for (const release of releases)
        release();
    };
  }, [connectionStatus, visible, aliases]);
  (0, import_react14.useEffect)(() => {
    if (!visible)
      return;
    setConfig((current) => current === null ? current : {
      ...current,
      hosts: current.hosts.map((host) => ({
        ...host,
        helper: actionEpochs.current.has(host.alias) ? host.helper : snapshot.hosts[host.alias] ?? host.helper
      }))
    });
    for (const alias of aliases.split("\0")) {
      if (snapshot.hosts[alias]?.environment?.search.available === false)
        void connectionStatus.recheckHost(alias);
    }
  }, [snapshot, connectionStatus, visible, aliases]);
  async function load(showLoading = true) {
    const request2 = ++epoch.current;
    const revision = statusRevision.current;
    if (showLoading)
      setLoading(true);
    try {
      const result4 = await withReadDeadline(ssh.config(), t("SSH \u914D\u7F6E\u8BFB\u53D6"));
      if (!mounted.current || epoch.current !== request2)
        return;
      if (result4.ok) {
        setConfig((current) => revision === statusRevision.current || current === null ? result4.value : {
          ...result4.value,
          hosts: result4.value.hosts.map((host) => ({
            ...host,
            helper: current.hosts.find((previous) => previous.alias === host.alias)?.helper ?? host.helper
          }))
        });
        setError("");
      } else
        setError(result4.error.message);
    } catch (reason) {
      if (mounted.current && epoch.current === request2)
        setError(messageOf(reason));
    } finally {
      if (mounted.current && showLoading && epoch.current === request2)
        setLoading(false);
    }
  }
  (0, import_react14.useEffect)(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      epoch.current += 1;
      statusRevision.current += 1;
      actionEpochs.current.clear();
    };
  }, [ssh]);
  async function runHostAction(alias, action) {
    const request2 = ++statusRevision.current;
    actionEpochs.current.set(alias, request2);
    const isCurrent = () => mounted.current && actionEpochs.current.get(alias) === request2;
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
      const result4 = await (action === "diagnostics" ? withReadDeadline(operation, t("\u8FDE\u63A5\u8BCA\u65AD")) : withMutationDeadline(operation, t("\u4E3B\u673A\u64CD\u4F5C")));
      if (!isCurrent())
        return;
      if (!result4.ok)
        setHostErrors((current) => ({ ...current, [alias]: result4.error.message }));
      else {
        if (action === "diagnostics")
          setDetails(result4.value);
        setConfig((current) => current === null ? current : {
          ...current,
          hosts: current.hosts.map((host) => host.alias === alias ? { ...host, helper: result4.value } : host)
        });
      }
    } catch (reason) {
      if (isCurrent())
        setHostErrors((current) => ({ ...current, [alias]: messageOf(reason) }));
    } finally {
      if (isCurrent()) {
        actionEpochs.current.delete(alias);
        statusRevision.current += 1;
        setActions((current) => ({ ...current, [alias]: void 0 }));
        connectionStatus.refresh();
      }
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14, padding: 12, maxWidth: 760 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(PanelHeader, { title: t("SSH \u8FDE\u63A5"), children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Button, { variant: "outline", size: "sm", disabled: loading, onClick: () => void load(), children: loading ? t("\u5237\u65B0\u4E2D\u2026") : t("\u5237\u65B0") }) }),
    config2 && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { padding: 10, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: subtleText, children: t("SSH \u914D\u7F6E\u6587\u4EF6") }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.PathLabel, { path: config2.configPath, style: { fontSize: 12 } }),
      !config2.configExists && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: t("\u8BF7\u521B\u5EFA\u8BE5\u6587\u4EF6\u5E76\u6DFB\u52A0\u5177\u4F53 Host \u540E\u5237\u65B0\u3002") })
    ] }),
    config2?.hosts.length === 0 && config2.configExists && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: subtleText, children: t("\u6CA1\u6709\u53D1\u73B0\u5177\u4F53 SSH Host alias\u3002") }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(GettingStarted, { expanded: config2?.hosts.length === 0 }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: config2?.hosts.map((host) => {
      const action = actions[host.alias];
      const busy = action !== void 0;
      const canStop = action === "connect" || action === "retry" || ["connected", "degraded", "installing", "connecting", "reconnecting"].includes(host.helper.status);
      return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { role: "group", "aria-label": t("SSH \u4E3B\u673A {value1}", { value1: host.alias }), style: cardStyle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: { fontWeight: 600 }, children: host.alias }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: { ...dimmedText, color: host.helper.status === "error" ? "var(--dsw-alias-label-error)" : void 0 }, children: snapshot.unavailable && !busy ? t("\u72B6\u6001\u672A\u77E5") : helperStateLabel(host.helper.status) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { ...subtleText, overflowWrap: "anywhere" }, children: [
          host.user ? `${host.user}@` : "",
          host.host,
          ":",
          host.port
        ] }),
        host.helper.environment?.search.available === false && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: subtleText, children: searchSummary(host.helper) }),
        (hostErrors[host.alias] || host.helper.error) && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { role: "alert", style: { marginTop: 6, color: "var(--dsw-alias-label-error)", fontSize: 12 }, children: hostErrors[host.alias] || host.helper.error }),
        host.helper.hint && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: { marginTop: 6, ...subtleText }, children: host.helper.hint }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("details", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("summary", { style: subtleText, children: t("\u8FDE\u63A5\u8BE6\u60C5") }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: dimmedText, children: [
            "Helper ",
            host.helper.version || t("\u5C1A\u672A\u63E1\u624B"),
            " \xB7 ",
            helperCapabilitySummary(host.helper.capabilities)
          ] }),
          host.helper.environment?.search.available !== false && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { style: subtleText, children: searchSummary(host.helper) }),
          (host.proxyJump || host.proxyCommand || host.identityFile) && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }, children: [
            host.proxyJump && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_dsh_client_ui_primitives12.Pill, { children: [
              "ProxyJump: ",
              host.proxyJump
            ] }),
            host.proxyCommand && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Pill, { children: "ProxyCommand" }),
            host.identityFile && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Pill, { children: t("\u5DF2\u914D\u7F6E\u5BC6\u94A5\u8DEF\u5F84") })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }, children: [
          canStop ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Button, { size: "sm", variant: "outline", disabled: action === "disconnect", onClick: () => void runHostAction(host.alias, "disconnect"), children: action === "disconnect" ? t("\u6B63\u5728\u505C\u6B62\u2026") : t("\u505C\u6B62 / \u65AD\u5F00") }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => void runHostAction(host.alias, "connect"), children: busy ? t("\u5904\u7406\u4E2D\u2026") : t("\u8FDE\u63A5") }),
          (host.helper.status === "error" || host.helper.status === "reconnecting" || host.helper.status === "connecting") && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => void runHostAction(host.alias, "retry"), children: t("\u91CD\u8BD5") }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => void runHostAction(host.alias, "diagnostics"), children: t("\u8BCA\u65AD") })
        ] }),
        ["connected", "degraded"].includes(host.helper.status) && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("small", { style: subtleText, children: t("\u65AD\u5F00\u4F1A\u7ED3\u675F\u6B64\u8FDE\u63A5\u7BA1\u7406\u7684\u7EC8\u7AEF\u548C\u8F6C\u53D1\uFF0C\u5E76\u4E2D\u65AD\u4F20\u8F93\u3002") })
      ] }, host.alias);
    }) }),
    details && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("strong", { children: [
          details.alias,
          t("\xB7 \u8BCA\u65AD")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Button, { size: "sm", variant: "ghost", onClick: () => setDetails(null), children: t("\u5173\u95ED") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("pre", { style: { margin: "8px 0 0", maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 11 }, children: JSON.stringify(details, null, 2) })
    ] }),
    config2 && config2.legacyHostCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(MigrationWizard, { ssh, onComplete: () => void load() }),
    error && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-label-error)" }, children: error })
  ] });
}

// client/index.tsx
var name = "dsh-ssh-remote-client";
var inject = ["remote", "locale"];
async function apply(ctx) {
  const releases = [];
  const dispose = async () => {
    const failures = [];
    for (const release of releases.splice(0).reverse()) {
      try {
        await release();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "SSH client cleanup failed");
  };
  try {
    releases.push(installLocale(ctx.locale));
    const workbench = new Workbench();
    releases.push(await ctx.remote.$mount(typert_remote_client_default));
    releases.push(mountConnectionStatus(ctx));
    const ui = ctx.inject(["remote.sshRemote", "slots", "workspaces", "sshConnectionStatus"], (scope6) => {
      let pickNative;
      const nativePicker = scope6.inject(["remote.directoryPicker"], (next) => {
        const picker = next.remote.directoryPicker;
        const adapter = async (signal) => {
          const result4 = await picker.pick(signal);
          if (!result4.ok) throw new Error(`directory picker failed: ${result4.error.message}`);
          return result4.value;
        };
        pickNative = adapter;
        return () => {
          if (pickNative === adapter) pickNative = void 0;
        };
      });
      const mountUi = (scope7, directories2) => {
        const ssh = scope7.remote.sshRemote;
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
          listLocal: (path2) => directories2.listDirectory(path2),
          createLocalDirectory: (path2, name2) => directories2.createDirectory(path2, name2),
          createWorkspace: (input2) => scope7.workspaces.create(input2),
          renameWorkspace: (workspaceId, title) => scope7.workspaces.rename(workspaceId, title)
        });
        return scope7.slots.inject(
          "settings.plugins.tab",
          () => scope7.slots.inject(
            "conversation.hero.workspace.directoryFlow",
            () => scope7.slots.inject("sidebar.workspaces.directoryFlow", function* () {
              yield scope7.slots.register(
                {
                  name: "settings.plugins.tab",
                  id: "ssh-remote",
                  order: 20,
                  label: () => t("SSH \u8FDE\u63A5"),
                  inject: () => ({ ssh, connectionStatus: scope7.sshConnectionStatus })
                },
                localized(SshRemotePanel)
              );
              yield scope7.slots.register(
                {
                  name: "conversation.hero.workspace.directoryFlow",
                  priority: -100,
                  inject: flowInject
                },
                localized(SshDirectoryFlow)
              );
              yield scope7.slots.register(
                {
                  name: "sidebar.workspaces.directoryFlow",
                  priority: -100,
                  inject: flowInject
                },
                localized(SshDirectoryFlow)
              );
            })
          )
        );
      };
      const directories = scope6.inject(["uiWorkspace"], (next) => mountUi(
        next,
        next.uiWorkspace
      ));
      return async () => {
        await directories.dispose();
        await nativePicker.dispose();
      };
    });
    releases.push(async () => {
      await ui.dispose();
    });
    releases.push(mountNativePanels(ctx, workbench));
    releases.push(mountSessionMarkdownImages(ctx));
    const editorBridge = {};
    releases.push(mountRemoteEditor(ctx, editorBridge));
    releases.push(mountQuickOpen(ctx, editorBridge, workbench));
    releases.push(mountPortForwards(ctx, workbench));
    releases.push(mountTransfers(ctx, workbench));
    releases.push(mountTerminalState(ctx, workbench));
    releases.push(mountPluginUpdates(ctx));
    await ui;
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "SSH client activation and cleanup failed");
    }
    throw error;
  }
  return dispose;
}
return module.exports; } });
