/**
 * GENERATED FILE — do not edit by hand.
 * Source: src/services/domains/platform/platformPermissionCatalog.ts
 * Regenerate with: node central-server/scripts/generate-catalog.mjs
 */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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

// src/services/domains/platform/platformPermissionCatalog.ts
var platformPermissionCatalog_exports = {};
__export(platformPermissionCatalog_exports, {
  PLATFORM_ALL_PERMISSION: () => PLATFORM_ALL_PERMISSION,
  PLATFORM_MODULE_KEYS: () => PLATFORM_MODULE_KEYS,
  PLATFORM_PAGE_CATALOG: () => PLATFORM_PAGE_CATALOG,
  PLATFORM_PERMISSION_CATALOG: () => PLATFORM_PERMISSION_CATALOG,
  PLATFORM_PERMISSION_CODES: () => PLATFORM_PERMISSION_CODES,
  PLATFORM_PERMISSION_SECTIONS: () => PLATFORM_PERMISSION_SECTIONS,
  PLATFORM_ROLE_CODES: () => PLATFORM_ROLE_CODES,
  PLATFORM_ROLE_DEFAULT_PERMISSIONS: () => PLATFORM_ROLE_DEFAULT_PERMISSIONS,
  STANDARD_ACTION_LABELS: () => STANDARD_ACTION_LABELS
});
module.exports = __toCommonJS(platformPermissionCatalog_exports);
var std = (module2, action, name) => ({ code: `platform.${module2}.${action}`, module: module2, action, name });
var special = (module2, action, name) => ({ code: `platform.${module2}.${action}`, module: module2, action, name, special: true });
var SIX = ["view", "create", "update", "delete", "approve", "export"];
var NO_CREATE_NO_DELETE = ["view", "update", "approve", "export"];
var SETTINGS_STYLE = ["view", "update", "approve"];
var BACKUPS_STYLE = ["view", "create", "approve", "export"];
var VIEW_ONLY = ["view"];
var PLATFORM_PERMISSION_SECTIONS = [
  {
    module: "tenants",
    title: "\u0627\u0644\u0639\u0645\u0644\u0627\u0621 (Tenants)",
    standardActions: ["view", "create", "update", "delete", "export"],
    permissions: [
      std("tenants", "view", "\u0639\u0631\u0636 \u0627\u0644\u0639\u0645\u0644\u0627\u0621"),
      std("tenants", "create", "\u0625\u0646\u0634\u0627\u0621 \u0639\u0645\u064A\u0644 \u062C\u062F\u064A\u062F"),
      std("tenants", "update", "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0639\u0645\u064A\u0644"),
      std("tenants", "delete", "\u062D\u0630\u0641 \u0627\u0644\u0639\u0645\u064A\u0644"),
      std("tenants", "export", "\u062A\u0635\u062F\u064A\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0639\u0645\u0644\u0627\u0621"),
      special("tenants", "suspend", "\u062A\u0639\u0644\u064A\u0642 \u0627\u0644\u0639\u0645\u064A\u0644"),
      special("tenants", "activate", "\u0625\u0639\u0627\u062F\u0629 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0639\u0645\u064A\u0644"),
      special("tenants", "manage_users", "\u0625\u062F\u0627\u0631\u0629 \u0645\u0633\u062A\u062E\u062F\u0645\u064A \u0627\u0644\u0639\u0645\u064A\u0644")
    ]
  },
  {
    module: "staff",
    title: "\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646 (Staff)",
    standardActions: ["view", "create", "update", "delete", "export"],
    permissions: [
      std("staff", "view", "\u0639\u0631\u0636 \u0645\u0648\u0638\u0641\u064A \u0627\u0644\u0645\u0646\u0635\u0629"),
      std("staff", "create", "\u0625\u0636\u0627\u0641\u0629 \u0645\u0648\u0638\u0641 \u0644\u0644\u0645\u0646\u0635\u0629"),
      std("staff", "update", "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641"),
      std("staff", "delete", "\u062D\u0630\u0641 \u0627\u0644\u0645\u0648\u0638\u0641 (\u0645\u0646\u0637\u0642\u064A)"),
      std("staff", "export", "\u062A\u0635\u062F\u064A\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646"),
      special("staff", "deactivate", "\u062A\u0641\u0639\u064A\u0644 \u0648\u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628"),
      special("staff", "reset_password", "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631"),
      special("staff", "assign_role", "\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0623\u062F\u0648\u0627\u0631"),
      special("staff", "manage_permissions", "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0648\u0627\u0644\u0623\u062F\u0648\u0627\u0631"),
      special("staff", "revoke_sessions", "\u0625\u0628\u0637\u0627\u0644 \u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641")
    ]
  },
  {
    module: "subscriptions",
    title: "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A (Subscriptions)",
    standardActions: SIX,
    permissions: [
      std("subscriptions", "view", "\u0639\u0631\u0636 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A"),
      std("subscriptions", "create", "\u0625\u0646\u0634\u0627\u0621 \u0627\u0634\u062A\u0631\u0627\u0643"),
      std("subscriptions", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643"),
      std("subscriptions", "delete", "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643"),
      std("subscriptions", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 / \u0627\u0644\u062A\u0631\u0642\u064A\u0629"),
      std("subscriptions", "export", "\u062A\u0635\u062F\u064A\u0631 \u0633\u062C\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A")
    ]
  },
  {
    module: "billing",
    title: "\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 (Billing)",
    standardActions: SIX,
    permissions: [
      std("billing", "view", "\u0639\u0631\u0636 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0648\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A"),
      std("billing", "create", "\u0625\u0646\u0634\u0627\u0621 \u0641\u0627\u062A\u0648\u0631\u0629"),
      std("billing", "update", "\u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629"),
      std("billing", "delete", "\u062D\u0630\u0641/\u0639\u0643\u0633 \u0641\u0627\u062A\u0648\u0631\u0629"),
      std("billing", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A"),
      std("billing", "export", "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631")
    ]
  },
  {
    module: "licenses",
    title: "\u0627\u0644\u062A\u0631\u0627\u062E\u064A\u0635 (Licenses)",
    standardActions: SIX,
    permissions: [
      std("licenses", "view", "\u0639\u0631\u0636 \u0627\u0644\u062A\u0631\u0627\u062E\u064A\u0635"),
      std("licenses", "create", "\u0625\u0635\u062F\u0627\u0631 \u062A\u0631\u062E\u064A\u0635"),
      std("licenses", "update", "\u062A\u0639\u062F\u064A\u0644 / \u062A\u062C\u062F\u064A\u062F \u062A\u0631\u062E\u064A\u0635"),
      std("licenses", "delete", "\u0625\u0644\u063A\u0627\u0621 \u062A\u0631\u062E\u064A\u0635"),
      std("licenses", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062A\u0631\u0627\u062E\u064A\u0635"),
      std("licenses", "export", "\u062A\u0635\u062F\u064A\u0631 \u0633\u062C\u0644 \u0627\u0644\u062A\u0631\u0627\u062E\u064A\u0635")
    ]
  },
  {
    module: "devices",
    title: "\u0627\u0644\u0623\u062C\u0647\u0632\u0629 (Devices)",
    standardActions: SIX,
    permissions: [
      std("devices", "view", "\u0639\u0631\u0636 \u0627\u0644\u0623\u062C\u0647\u0632\u0629"),
      std("devices", "create", "\u062A\u0633\u062C\u064A\u0644 \u062C\u0647\u0627\u0632"),
      std("devices", "update", "\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632"),
      std("devices", "delete", "\u0625\u0632\u0627\u0644\u0629 \u062C\u0647\u0627\u0632"),
      std("devices", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0631\u0628\u0637 \u0627\u0644\u0623\u062C\u0647\u0632\u0629"),
      std("devices", "export", "\u062A\u0635\u062F\u064A\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u062C\u0647\u0632\u0629")
    ]
  },
  {
    module: "plans",
    title: "\u062E\u0637\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 (Plans)",
    standardActions: SIX,
    permissions: [
      std("plans", "view", "\u0639\u0631\u0636 \u0627\u0644\u062E\u0637\u0637"),
      std("plans", "create", "\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629"),
      std("plans", "update", "\u062A\u0639\u062F\u064A\u0644 \u062E\u0637\u0629"),
      std("plans", "delete", "\u062D\u0630\u0641 \u062E\u0637\u0629"),
      std("plans", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u062A\u063A\u064A\u064A\u0631\u0627\u062A \u0627\u0644\u062E\u0637\u0637"),
      std("plans", "export", "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u062E\u0637\u0637")
    ]
  },
  {
    module: "product",
    title: "\u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0627\u0644\u0645\u0632\u0627\u064A\u0627 (Product)",
    standardActions: SIX,
    permissions: [
      std("product", "view", "\u0639\u0631\u0636 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C"),
      std("product", "create", "\u0625\u0636\u0627\u0641\u0629 \u0648\u062D\u062F\u0629 / \u0645\u064A\u0632\u0629"),
      std("product", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0627\u0644\u0645\u0632\u0627\u064A\u0627"),
      std("product", "delete", "\u062D\u0630\u0641 \u0648\u062D\u062F\u0629 / \u0645\u064A\u0632\u0629"),
      std("product", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0646\u0634\u0631 \u0627\u0644\u0645\u0632\u0627\u064A\u0627"),
      std("product", "export", "\u062A\u0635\u062F\u064A\u0631 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C")
    ]
  },
  {
    module: "releases",
    title: "\u0627\u0644\u0625\u0635\u062F\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A (Releases)",
    standardActions: SIX,
    permissions: [
      std("releases", "view", "\u0639\u0631\u0636 \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u0627\u062A"),
      std("releases", "create", "\u0625\u0646\u0634\u0627\u0621 \u062D\u0632\u0645\u0629 \u0625\u0635\u062F\u0627\u0631"),
      std("releases", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0625\u0635\u062F\u0627\u0631"),
      std("releases", "delete", "\u062D\u0630\u0641 \u0625\u0635\u062F\u0627\u0631"),
      std("releases", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0646\u0634\u0631 \u0644\u0644\u0639\u0645\u0644\u0627\u0621"),
      std("releases", "export", "\u062A\u0635\u062F\u064A\u0631 \u0633\u062C\u0644 \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u0627\u062A")
    ]
  },
  {
    module: "support",
    title: "\u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A (Support)",
    standardActions: SIX,
    permissions: [
      std("support", "view", "\u0639\u0631\u0636 \u062A\u0630\u0627\u0643\u0631 \u0627\u0644\u062F\u0639\u0645"),
      std("support", "create", "\u0641\u062A\u062D \u062A\u0630\u0643\u0631\u0629"),
      std("support", "update", "\u0627\u0644\u0631\u062F \u0648\u0627\u0644\u062A\u062D\u062F\u064A\u062B"),
      std("support", "delete", "\u062D\u0630\u0641 \u062A\u0630\u0643\u0631\u0629"),
      std("support", "approve", "\u0625\u063A\u0644\u0627\u0642 / \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062D\u0644"),
      std("support", "export", "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u062A\u0630\u0627\u0643\u0631")
    ]
  },
  {
    module: "settings",
    title: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A (Settings)",
    standardActions: SETTINGS_STYLE,
    permissions: [
      std("settings", "view", "\u0639\u0631\u0636 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629"),
      std("settings", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A"),
      std("settings", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u062A\u063A\u064A\u064A\u0631\u0627\u062A \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A")
    ]
  },
  {
    module: "security",
    title: "\u0627\u0644\u0623\u0645\u0627\u0646 (Security)",
    standardActions: NO_CREATE_NO_DELETE,
    permissions: [
      std("security", "view", "\u0639\u0631\u0636 \u0645\u0631\u0643\u0632 \u0627\u0644\u0623\u0645\u0627\u0646"),
      std("security", "update", "\u062A\u0639\u062F\u064A\u0644 \u0633\u064A\u0627\u0633\u0627\u062A \u0627\u0644\u0623\u0645\u0627\u0646"),
      std("security", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629"),
      std("security", "export", "\u062A\u0635\u062F\u064A\u0631 \u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0623\u0645\u0627\u0646")
    ]
  },
  {
    module: "backups",
    title: "\u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A (Backups)",
    standardActions: BACKUPS_STYLE,
    permissions: [
      std("backups", "view", "\u0639\u0631\u0636 \u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629"),
      std("backups", "create", "\u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629"),
      std("backups", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629"),
      std("backups", "export", "\u062A\u0635\u062F\u064A\u0631 / \u062A\u0646\u0632\u064A\u0644 \u0646\u0633\u062E\u0629")
    ]
  },
  {
    module: "audit",
    title: "\u0633\u062C\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A (Audit)",
    standardActions: ["view", "export"],
    permissions: [
      std("audit", "view", "\u0639\u0631\u0636 \u0633\u062C\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A"),
      std("audit", "export", "\u062A\u0635\u062F\u064A\u0631 \u0633\u062C\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A")
    ]
  },
  {
    module: "analytics",
    title: "\u0627\u0644\u062A\u062D\u0644\u064A\u0644\u0627\u062A \u0648\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 (Analytics)",
    standardActions: ["view", "export"],
    permissions: [
      std("analytics", "view", "\u0639\u0631\u0636 \u0627\u0644\u062A\u062D\u0644\u064A\u0644\u0627\u062A"),
      std("analytics", "export", "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631")
    ]
  },
  {
    module: "sync",
    title: "\u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 (Sync)",
    standardActions: ["view", "update"],
    permissions: [
      std("sync", "view", "\u0639\u0631\u0636 \u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629"),
      std("sync", "update", "\u0625\u0639\u0627\u062F\u0629 \u062A\u0634\u063A\u064A\u0644 / \u062A\u062F\u062E\u0644 \u062A\u0634\u063A\u064A\u0644\u064A")
    ]
  },
  {
    module: "integrations",
    title: "\u0627\u0644\u062A\u0643\u0627\u0645\u0644\u0627\u062A (Integrations)",
    standardActions: SIX,
    permissions: [
      std("integrations", "view", "\u0639\u0631\u0636 \u0627\u0644\u062A\u0643\u0627\u0645\u0644\u0627\u062A"),
      std("integrations", "create", "\u0625\u0636\u0627\u0641\u0629 \u062A\u0643\u0627\u0645\u0644 / Webhook"),
      std("integrations", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062A\u0643\u0627\u0645\u0644"),
      std("integrations", "delete", "\u062D\u0630\u0641 \u062A\u0643\u0627\u0645\u0644"),
      std("integrations", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0631\u0628\u0637"),
      std("integrations", "export", "\u062A\u0635\u062F\u064A\u0631 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0643\u0627\u0645\u0644")
    ]
  },
  {
    module: "notifications",
    title: "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A (Notifications)",
    standardActions: SIX,
    permissions: [
      std("notifications", "view", "\u0639\u0631\u0636 \u0645\u0631\u0643\u0632 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A"),
      std("notifications", "create", "\u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631"),
      std("notifications", "update", "\u062A\u0639\u062F\u064A\u0644 \u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A"),
      std("notifications", "delete", "\u062D\u0630\u0641 \u0625\u0634\u0639\u0627\u0631 / \u0642\u0627\u0644\u0628"),
      std("notifications", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u062D\u0645\u0644\u0627\u062A \u0627\u0644\u0625\u0631\u0633\u0627\u0644"),
      std("notifications", "export", "\u062A\u0635\u062F\u064A\u0631 \u0633\u062C\u0644 \u0627\u0644\u062A\u0633\u0644\u064A\u0645")
    ]
  },
  {
    module: "policies",
    title: "\u0633\u064A\u0627\u0633\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629 (Policies)",
    standardActions: ["view", "create", "update", "approve", "export"],
    permissions: [
      std("policies", "view", "\u0639\u0631\u0636 \u0627\u0644\u0633\u064A\u0627\u0633\u0627\u062A"),
      std("policies", "create", "\u0625\u0636\u0627\u0641\u0629 \u0633\u064A\u0627\u0633\u0629"),
      std("policies", "update", "\u062A\u0639\u062F\u064A\u0644 \u0633\u064A\u0627\u0633\u0629"),
      std("policies", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0646\u0634\u0631 \u0627\u0644\u0633\u064A\u0627\u0633\u0629"),
      std("policies", "export", "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0633\u064A\u0627\u0633\u0627\u062A")
    ]
  },
  {
    module: "operations",
    title: "\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A \u0648\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062A (Operations)",
    standardActions: SIX,
    permissions: [
      std("operations", "view", "\u0639\u0631\u0636 \u0645\u0631\u0643\u0632 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A"),
      std("operations", "create", "\u0625\u0646\u0634\u0627\u0621 \u0645\u0647\u0645\u0629 \u062A\u0634\u063A\u064A\u0644\u064A\u0629"),
      std("operations", "update", "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A"),
      std("operations", "delete", "\u0625\u0644\u063A\u0627\u0621 \u0639\u0645\u0644\u064A\u0629"),
      std("operations", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0645\u0647\u0627\u0645 \u0627\u0644\u062A\u0634\u063A\u064A\u0644"),
      std("operations", "export", "\u062A\u0635\u062F\u064A\u0631 \u0633\u062C\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A")
    ]
  },
  {
    module: "overview",
    title: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629 (Overview)",
    standardActions: VIEW_ONLY,
    permissions: [std("overview", "view", "\u0639\u0631\u0636 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629")]
  },
  {
    module: "super-admin",
    title: "\u0644\u0648\u062D\u0629 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629 (Super Admin)",
    standardActions: VIEW_ONLY,
    permissions: [std("super-admin", "view", "\u0639\u0631\u0636 \u0644\u0648\u062D\u0629 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629")]
  },
  {
    module: "activity",
    title: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637 (Activity)",
    standardActions: ["view", "update"],
    permissions: [
      std("activity", "view", "\u0639\u0631\u0636 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637"),
      std("activity", "update", "\u062A\u0639\u062F\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637")
    ]
  },
  {
    module: "branding",
    title: "\u0627\u0644\u0647\u0648\u064A\u0629 \u0648\u0627\u0644\u0645\u0638\u0647\u0631 (Branding)",
    standardActions: ["view", "update"],
    permissions: [
      std("branding", "view", "\u0639\u0631\u0636 \u0627\u0644\u0647\u0648\u064A\u0629"),
      std("branding", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0647\u0648\u064A\u0629")
    ]
  },
  {
    module: "customization",
    title: "\u062A\u062E\u0635\u064A\u0635 \u0627\u0644\u0648\u0627\u062C\u0647\u0629 (Customization)",
    standardActions: ["view", "update"],
    permissions: [
      std("customization", "view", "\u0639\u0631\u0636 \u062A\u062E\u0635\u064A\u0635\u0627\u062A \u0627\u0644\u0648\u0627\u062C\u0647\u0629"),
      std("customization", "update", "\u062A\u0639\u062F\u064A\u0644 \u062A\u062E\u0635\u064A\u0635\u0627\u062A \u0627\u0644\u0648\u0627\u062C\u0647\u0629")
    ]
  },
  {
    module: "app-configuration",
    title: "\u0645\u062D\u0631\u0643 \u0627\u0644\u062A\u0643\u0648\u064A\u0646 (App Configuration)",
    standardActions: ["view", "update", "export"],
    permissions: [
      std("app-configuration", "view", "\u0639\u0631\u0636 \u0627\u0644\u062A\u0643\u0648\u064A\u0646 \u0627\u0644\u062F\u064A\u0646\u0627\u0645\u064A\u0643\u064A"),
      std("app-configuration", "update", "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062A\u0643\u0648\u064A\u0646"),
      std("app-configuration", "export", "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u062A\u0643\u0648\u064A\u0646")
    ]
  },
  {
    module: "system-health",
    title: "\u0635\u062D\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 (System Health)",
    standardActions: ["view", "update", "approve"],
    permissions: [
      std("system-health", "view", "\u0639\u0631\u0636 \u0635\u062D\u0629 \u0627\u0644\u0646\u0638\u0627\u0645"),
      std("system-health", "update", "\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u062A\u0634\u062E\u064A\u0635\u064A\u0629"),
      std("system-health", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629")
    ]
  },
  {
    module: "platform-health",
    title: "\u0635\u062D\u0629 \u0627\u0644\u0645\u0646\u0635\u0629 (Platform Health)",
    standardActions: ["view", "update", "approve"],
    permissions: [
      std("platform-health", "view", "\u0639\u0631\u0636 \u0635\u062D\u0629 \u0627\u0644\u0645\u0646\u0635\u0629 \u0644\u0644\u0639\u0645\u0644\u0627\u0621"),
      std("platform-health", "update", "\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0645\u0639\u0627\u0644\u062C\u0629"),
      std("platform-health", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0645\u0639\u0627\u0644\u062C\u0629")
    ]
  },
  {
    module: "admin-control",
    title: "\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u064A (Admin Control)",
    standardActions: ["view", "update", "approve", "export"],
    permissions: [
      std("admin-control", "view", "\u0639\u0631\u0636 \u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u064A"),
      std("admin-control", "update", "\u062A\u0639\u062F\u064A\u0644 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0624\u0633\u0633\u064A"),
      std("admin-control", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0645\u0648\u0627\u0641\u0642\u0627\u062A \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u064A"),
      std("admin-control", "export", "\u062A\u0635\u062F\u064A\u0631 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u0635\u064A\u0627\u0646\u0629")
    ]
  },
  {
    module: "emergency",
    title: "\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0637\u0648\u0627\u0631\u0626 (Emergency)",
    standardActions: ["view", "update", "approve"],
    permissions: [
      std("emergency", "view", "\u0639\u0631\u0636 \u0645\u0631\u0643\u0632 \u0627\u0644\u0637\u0648\u0627\u0631\u0626"),
      std("emergency", "update", "\u062A\u0646\u0641\u064A\u0630 \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0637\u0648\u0627\u0631\u0626"),
      std("emergency", "approve", "\u0627\u0639\u062A\u0645\u0627\u062F \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0637\u0648\u0627\u0631\u0626")
    ]
  },
  {
    module: "customer-portal",
    title: "\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 (Customer Portal)",
    standardActions: ["view", "update"],
    permissions: [
      std("customer-portal", "view", "\u0639\u0631\u0636 \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621"),
      std("customer-portal", "update", "\u062A\u0639\u062F\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0628\u0648\u0627\u0628\u0629")
    ]
  }
];
var PLATFORM_PERMISSION_CATALOG = PLATFORM_PERMISSION_SECTIONS.flatMap((s) => s.permissions);
var PLATFORM_PERMISSION_CODES = PLATFORM_PERMISSION_CATALOG.map((p) => p.code);
var PLATFORM_ALL_PERMISSION = "*";
var STANDARD_ACTION_LABELS = {
  view: "\u0639\u0631\u0636",
  create: "\u0625\u0646\u0634\u0627\u0621",
  update: "\u062A\u0639\u062F\u064A\u0644",
  delete: "\u062D\u0630\u0641",
  approve: "\u0627\u0639\u062A\u0645\u0627\u062F",
  export: "\u062A\u0635\u062F\u064A\u0631"
};
var PLATFORM_MODULE_KEYS = Array.from(
  new Set(PLATFORM_PERMISSION_SECTIONS.filter((s) => s.standardActions.length || s.permissions.length).map((s) => s.module))
);
var PLATFORM_ROLE_DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: [PLATFORM_ALL_PERMISSION],
  PLATFORM_ADMIN: PLATFORM_PERMISSION_CODES.filter(
    (code) => !code.startsWith("platform.staff.delete") && code !== "platform.super-admin.view"
  ),
  SUPPORT_AGENT: [
    "platform.overview.view",
    "platform.tenants.view",
    "platform.support.view",
    "platform.support.create",
    "platform.support.update",
    "platform.support.export",
    "platform.devices.view",
    "platform.system-health.view",
    "platform.platform-health.view",
    "platform.sync.view",
    "platform.notifications.view",
    "platform.customer-portal.view",
    "platform.analytics.view"
  ],
  OPERATIONS_ENGINEER: [
    "platform.overview.view",
    "platform.operations.view",
    "platform.operations.create",
    "platform.operations.update",
    "platform.operations.approve",
    "platform.operations.export",
    "platform.system-health.view",
    "platform.system-health.update",
    "platform.platform-health.view",
    "platform.platform-health.update",
    "platform.devices.view",
    "platform.devices.update",
    "platform.app-configuration.view",
    "platform.app-configuration.update",
    "platform.sync.view",
    "platform.sync.update",
    "platform.backups.view",
    "platform.backups.create",
    "platform.integrations.view",
    "platform.integrations.update",
    "platform.notifications.view",
    "platform.notifications.update",
    "platform.emergency.view",
    "platform.emergency.update",
    "platform.emergency.approve"
  ],
  BILLING_SPECIALIST: [
    "platform.overview.view",
    "platform.billing.view",
    "platform.billing.create",
    "platform.billing.update",
    "platform.billing.approve",
    "platform.billing.export",
    "platform.plans.view",
    "platform.subscriptions.view",
    "platform.subscriptions.create",
    "platform.subscriptions.update",
    "platform.subscriptions.approve",
    "platform.subscriptions.export",
    "platform.tenants.view",
    "platform.tenants.export",
    "platform.analytics.view",
    "platform.analytics.export",
    "platform.customer-portal.view"
  ],
  LICENSE_MANAGER: [
    "platform.overview.view",
    "platform.licenses.view",
    "platform.licenses.create",
    "platform.licenses.update",
    "platform.licenses.approve",
    "platform.licenses.export",
    "platform.devices.view",
    "platform.devices.update",
    "platform.tenants.view",
    "platform.subscriptions.view",
    "platform.subscriptions.create",
    "platform.subscriptions.update",
    "platform.sync.view"
  ]
};
var PLATFORM_ROLE_CODES = Object.keys(PLATFORM_ROLE_DEFAULT_PERMISSIONS);
var page = (path, module2, title, requiredPermission) => ({
  path,
  module: module2,
  title,
  requiredPermission
});
var PLATFORM_PAGE_CATALOG = [
  page("/platform", "overview", "\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0646\u0635\u0629", "platform.overview.view"),
  page("/platform/tenants", "tenants", "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621", "platform.tenants.view"),
  page("/platform/subscriptions", "subscriptions", "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629", "platform.subscriptions.view"),
  page("/platform/licenses", "licenses", "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062A\u0631\u0627\u062E\u064A\u0635", "platform.licenses.view"),
  page("/platform/billing", "billing", "\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631", "platform.billing.view"),
  page("/platform/plans", "plans", "\u062E\u0637\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "platform.plans.view"),
  page("/platform/staff", "staff", "\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0641\u064A \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629", "platform.staff.view"),
  page("/platform/roles", "staff", "\u0645\u0635\u0641\u0648\u0641\u0629 \u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A", "platform.staff.manage_permissions"),
  page("/platform/releases", "releases", "\u062D\u0632\u0645 \u0627\u0644\u0625\u0635\u062F\u0627\u0631\u0627\u062A \u0648\u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A", "platform.releases.view"),
  page("/platform/product", "product", "\u0627\u0644\u062A\u062D\u0643\u0645 \u0641\u064A \u0627\u0644\u0645\u0646\u062A\u062C", "platform.product.view"),
  page("/platform/audit", "audit", "\u0633\u062C\u0644 \u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629", "platform.audit.view"),
  page("/platform/settings", "settings", "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629", "platform.settings.view"),
  page("/platform/activity", "activity", "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637", "platform.activity.view"),
  page("/platform/operations", "operations", "\u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0648\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062A", "platform.operations.view"),
  page("/platform/branding", "branding", "\u0627\u0644\u0647\u0648\u064A\u0629 \u0648\u0627\u0644\u0645\u0638\u0647\u0631", "platform.branding.view"),
  page("/platform/customization", "customization", "\u062A\u062E\u0635\u064A\u0635 \u0627\u0644\u0648\u0627\u062C\u0647\u0629", "platform.customization.view"),
  page("/platform/app-configuration", "app-configuration", "\u0645\u062D\u0631\u0643 \u0627\u0644\u062A\u0643\u0648\u064A\u0646 \u0627\u0644\u062F\u064A\u0646\u0627\u0645\u064A\u0643\u064A", "platform.app-configuration.view"),
  page("/platform/system-health", "system-health", "\u0635\u062D\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u062A\u0634\u062E\u064A\u0635\u0647", "platform.system-health.view"),
  page("/platform/platform-health", "platform-health", "\u0635\u062D\u0629 \u0627\u0644\u0645\u0646\u0635\u0629 (\u062C\u0645\u064A\u0639 \u0627\u0644\u0639\u0645\u0644\u0627\u0621)", "platform.platform-health.view"),
  page("/platform/support", "support", "\u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A", "platform.support.view"),
  page("/platform/devices", "devices", "\u0627\u0644\u0623\u062C\u0647\u0632\u0629", "platform.devices.view"),
  page("/platform/admin-control", "admin-control", "\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u064A", "platform.admin-control.view"),
  page("/platform/security-center", "security", "\u0645\u0631\u0643\u0632 \u0627\u0644\u0623\u0645\u0627\u0646", "platform.security.view"),
  page("/platform/analytics", "analytics", "\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0648\u0627\u0644\u062A\u062D\u0644\u064A\u0644\u0627\u062A \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629", "platform.analytics.view"),
  page("/platform/sync", "sync", "\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0648\u0627\u0644\u0623\u062C\u0647\u0632\u0629", "platform.sync.view"),
  page("/platform/backups", "backups", "\u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A \u0627\u0644\u0633\u062D\u0627\u0628\u064A", "platform.backups.view"),
  page("/platform/integrations", "integrations", "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062A\u0643\u0627\u0645\u0644\u0627\u062A \u0648\u0627\u0644\u0631\u0628\u0637 \u0627\u0644\u062E\u0627\u0631\u062C\u064A", "platform.integrations.view"),
  page("/platform/notifications", "notifications", "\u0645\u0631\u0643\u0632 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0648\u0633\u062C\u0644 \u0627\u0644\u062A\u0633\u0644\u064A\u0645", "platform.notifications.view"),
  page("/platform/policies", "policies", "\u0633\u064A\u0627\u0633\u0627\u062A \u0627\u0644\u0645\u0646\u0635\u0629 \u0648\u0627\u0644\u0627\u0645\u062A\u062B\u0627\u0644", "platform.policies.view"),
  page("/platform/emergency", "emergency", "\u0645\u0631\u0643\u0632 \u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0637\u0648\u0627\u0631\u0626 \u0648\u0627\u0644\u062D\u0645\u0627\u064A\u0629", "platform.emergency.view"),
  page("/platform/customer-portal", "customer-portal", "\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629", "platform.customer-portal.view"),
  page("/platform/super-admin", "super-admin", "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u062D\u0633\u0627\u0633\u0629", "platform.super-admin.view")
];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PLATFORM_ALL_PERMISSION,
  PLATFORM_MODULE_KEYS,
  PLATFORM_PAGE_CATALOG,
  PLATFORM_PERMISSION_CATALOG,
  PLATFORM_PERMISSION_CODES,
  PLATFORM_PERMISSION_SECTIONS,
  PLATFORM_ROLE_CODES,
  PLATFORM_ROLE_DEFAULT_PERMISSIONS,
  STANDARD_ACTION_LABELS
});
