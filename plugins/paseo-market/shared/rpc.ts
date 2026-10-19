import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  artifactSchema,
  installedPluginSchema,
  marketCategorySchema,
  marketEntrySchema,
  pluginUpdateSchema,
  sourceKindSchema,
  sourceStatusSchema,
} from "./model";

const installationIdSchema = z.string().min(1).max(100);
const sourceIdSchema = z.string().min(1).max(64);
const entryIdSchema = z.string().min(1).max(200);

export const MAX_CATALOG_ENTRIES = 4_000;
export const MAX_CATEGORIES = 200;

export const marketCatalogRpc = defineRpc({
  name: "market.catalog",
  input: z.object({ force: z.boolean().default(false) }),
  output: z.object({
    sources: z.array(sourceStatusSchema).max(64),
    entries: z.array(marketEntrySchema).max(MAX_CATALOG_ENTRIES),
    categories: z.array(marketCategorySchema).max(MAX_CATEGORIES),
    fetchedAt: z.string().max(40),
    /** daemon 上的 `paseo` CLI 是否支持从注册表解析 `owner/slug` 安装。 */
    installSupported: z.boolean(),
    installations: z.array(installedPluginSchema).max(1_000),
    installationsError: z.string().max(2_000).optional(),
    updates: z.array(pluginUpdateSchema).max(1_000),
    updatesError: z.string().max(2_000).optional(),
  }),
});

export const marketInstalledRpc = defineRpc({
  name: "market.installed",
  input: z.object({}),
  output: z.object({
    installations: z.array(installedPluginSchema).max(1_000),
    updates: z.array(pluginUpdateSchema).max(1_000),
    installSupported: z.boolean(),
    installationsError: z.string().max(2_000).optional(),
    updatesError: z.string().max(2_000).optional(),
  }),
});

export const marketInstallRpc = defineRpc({
  name: "market.install",
  input: z.object({
    sourceId: sourceIdSchema,
    entryId: entryIdSchema,
    /** 用户确认过的产物锚点；注册表中它若已变动则拒绝安装。 */
    expected: artifactSchema.nullable(),
  }),
  output: z.object({ ok: z.boolean(), message: z.string().max(4_000) }),
});

export const marketInstallDirectRpc = defineRpc({
  name: "market.install-direct",
  input: z.object({
    /** 直接传给 `paseo plugin add` 的来源参数，如 git:owner/repo 或 npm:pkg@ver。 */
    source: z.string().min(1).max(500),
    /** 可选 Git 分支、标签或提交。 */
    ref: z.string().max(128).optional(),
    /** 可选仓库内子路径（单仓多插件时）。 */
    path: z.string().max(500).optional(),
  }),
  output: z.object({ ok: z.boolean(), message: z.string().max(4_000) }),
});

export const marketUninstallRpc = defineRpc({
  name: "market.uninstall",
  input: z.object({ installationId: installationIdSchema }),
  output: z.object({ ok: z.boolean(), message: z.string().max(4_000) }),
});

export const marketSetEnabledRpc = defineRpc({
  name: "market.set-enabled",
  input: z.object({ installationId: installationIdSchema, enabled: z.boolean() }),
  output: z.object({ ok: z.boolean(), message: z.string().max(4_000) }),
});

export const marketReloadRpc = defineRpc({
  name: "market.reload",
  input: z.object({ installationId: installationIdSchema }),
  output: z.object({ ok: z.boolean(), message: z.string().max(4_000) }),
});

export const marketUpdatesRpc = defineRpc({
  name: "market.updates",
  input: z.object({ force: z.boolean().default(false) }),
  output: z.object({
    updates: z.array(pluginUpdateSchema).max(1_000),
    error: z.string().max(2_000).optional(),
  }),
});

export const marketUpdateRpc = defineRpc({
  name: "market.update",
  input: z.object({ installationId: installationIdSchema }),
  output: z.object({
    ok: z.boolean(),
    updated: z.boolean().optional(),
    /** 该插件更新了自己：进程会重启，本次调用无法回报最终结果。 */
    restarting: z.boolean().optional(),
    message: z.string().max(4_000),
  }),
});

export const marketCheckSourceRpc = defineRpc({
  name: "market.check-source",
  input: z.object({
    kind: sourceKindSchema,
    url: z.string().max(2_048),
  }),
  output: z.object({
    ok: z.boolean(),
    name: z.string().max(200),
    count: z.number().int().nonnegative(),
    invalidCount: z.number().int().nonnegative(),
    message: z.string().max(2_000),
  }),
});

export const marketDetailRpc = defineRpc({
  name: "market.detail",
  input: z.object({ sourceId: sourceIdSchema, entryId: entryIdSchema }),
  output: z.object({
    entry: marketEntrySchema,
    readme: z.string().max(200_000),
  }),
});