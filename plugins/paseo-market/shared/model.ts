import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Paseo 官方插件注册表（协议 v1：`<base>/index.json` 与 `<base>/plugins/<owner>/<slug>.json`）。 */
export const DEFAULT_REGISTRY_URL = "https://plugins.paseo.sh";
/** 社区驱动的目录站点 paseo.cafe（`<base>/api/plugins` 与 `<base>/api/plugin/<id>.json`）。 */
export const DEFAULT_CAFE_URL = "https://paseo.cafe";
export const SITE_URL = "https://paseo.sh";

/** 本插件自身的安装 id。它更新时进程会被重启，因此自更新必须走 detachment。 */
export const SELF_INSTALLATION_ID = "paseo-market";

/** 首个支持 `paseo plugin add owner/slug` 从注册表解析安装的 Paseo 版本。 */
export const MIN_REGISTRY_INSTALL_VERSION = "0.11.0-beta.4";

// ---------------------------------------------------------------------------
// 源地址校验

// 手工解析而不用 URL：React Native 的 URL shim 会破坏 IPv6 主机写法。
const sourceUrlPattern =
  /^(https?):\/\/([^/?#@\s\\]+@)?(\[[0-9a-f:.]+\]|[^:/?#@\s\\]+)(?::(\d+))?(\/[^?#\s]*)?$/i;

/** 源决定 daemon 上 `paseo` CLI 安装什么，因此必须走受信通道：HTTPS，或仅限回环的 HTTP。 */
export function isTrustedSourceUrl(value: string): boolean {
  const match = sourceUrlPattern.exec(value.trim());
  if (!match) return false;
  const [, protocol, credentials, rawHost, port] = match;
  if (credentials !== undefined) return false;
  if (port !== undefined && Number(port) > 65_535) return false;
  if (protocol.toLowerCase() === "https") return true;
  const host = rawHost.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") {
    return true;
  }
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
  );
}

export function sourceBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

const DIRECT_REGISTRY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIRECT_HOST_ID = /^[a-z0-9.-]+(?::\d{1,5})?\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * 校验一个「直接安装」来源是否是可接受的 `paseo plugin add` 参数。
 * 支持：注册表 id `owner/slug`、`host[:port]/owner/slug`、`git:owner/repo[:路径]`、
 * `npm:包[@版本]`、HTTPS Git URL、以及绝对本地目录路径。
 */
export function isValidDirectSource(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return false;
  if (/[\u0000-\u001f]/.test(trimmed)) return false;
  if (trimmed.startsWith("git:") || trimmed.startsWith("npm:")) return trimmed.length > 4;
  if (/^https:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith("/")) return true;
  if (DIRECT_REGISTRY_ID.test(trimmed)) return true;
  if (DIRECT_HOST_ID.test(trimmed)) return true;
  return false;
}

/** 去掉路径后返回 `host[:port]`，用于把源拼成 `host/owner/slug` 形式的安装来源。 */
export function sourceRoot(url: string): { host: string; port?: string } | undefined {
  const match = sourceUrlPattern.exec(sourceBase(url));
  if (!match || match[5] !== undefined || !/^https:/i.test(match[1])) return undefined;
  return { host: match[3], port: match[4] };
}

// ---------------------------------------------------------------------------
// 市场源

export const SOURCE_KINDS = ["paseo-registry", "paseo-cafe", "custom-json"] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof sourceKindSchema>;

const sourceIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "源 id 只能是小写字母、数字与连字符");
const sourceUrlSchema = z
  .string()
  .max(2_048)
  .refine(isTrustedSourceUrl, "源地址必须使用 HTTPS，或 localhost 上的 HTTP");

export const marketSourceSchema = z.object({
  id: sourceIdSchema,
  name: z.string().max(100).default(""),
  kind: sourceKindSchema,
  url: sourceUrlSchema,
  enabled: z.boolean().default(true),
});
export type MarketSource = z.infer<typeof marketSourceSchema>;

export const DEFAULT_SOURCES: MarketSource[] = [
  {
    id: "official",
    name: "Paseo 官方",
    kind: "paseo-registry",
    url: DEFAULT_REGISTRY_URL,
    enabled: true,
  },
  {
    id: "cafe",
    name: "Paseo Cafe",
    kind: "paseo-cafe",
    url: DEFAULT_CAFE_URL,
    enabled: true,
  },
];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  "paseo-registry": "Paseo 注册表",
  "paseo-cafe": "Paseo Cafe 目录",
  "custom-json": "自定义 JSON",
};

// ---------------------------------------------------------------------------
// 浏览偏好

export const BROWSE_SORTS = ["popular", "recent", "a-z"] as const;
export const BROWSE_STATUS = ["all", "installed", "updates", "not-installed"] as const;

export const browseSchema = z.object({
  query: z.string().max(200).default(""),
  sourceIds: z.array(z.string().max(64)).max(50).default([]),
  categories: z.array(z.string().max(64)).max(32).default([]),
  status: z.enum(BROWSE_STATUS).catch("all").default("all"),
  sort: z.enum(BROWSE_SORTS).catch("popular").default("popular"),
});
export type BrowseSettings = z.infer<typeof browseSchema>;
export const DEFAULT_BROWSE: BrowseSettings = browseSchema.parse({});

// ---------------------------------------------------------------------------
// 设置

export const marketSettings = defineSettings({
  id: "market-settings",
  scope: "host",
  version: 1,
  schema: z.object({
    sources: z.array(marketSourceSchema).max(50).default(DEFAULT_SOURCES),
    browse: browseSchema.default(DEFAULT_BROWSE),
  }),
});
export type MarketSettingsValues = z.infer<typeof marketSettings.schema>;

// ---------------------------------------------------------------------------
// 条目与产物

/** 规范化后的安装产物。它是唯一可信的安装锚点，安装时按它做一次一致性校验。 */
export const artifactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("npm"),
    package: z.string().min(1).max(214),
    version: z.string().max(128).default(""),
    integrity: z.string().max(256).optional(),
  }),
  z.object({
    kind: z.literal("git"),
    remote: z.string().min(1).max(500),
    commit: z.string().max(64).optional(),
    pluginPath: z.string().max(500).optional(),
  }),
]);
export type Artifact = z.infer<typeof artifactSchema>;

export const MAX_ENTRY_DESCRIPTION = 600;

export const marketEntrySchema = z.object({
  sourceId: z.string().max(64),
  sourceName: z.string().max(100),
  sourceKind: sourceKindSchema,
  /** 源内唯一标识：注册表为 `owner/slug`，cafe 为插件 slug。 */
  id: z.string().min(1).max(200),
  /** 跨源唯一：`<sourceId>:<id>`。 */
  globalId: z.string().max(300),
  name: z.string().max(200),
  description: z.string().max(MAX_ENTRY_DESCRIPTION).default(""),
  author: z.string().max(200).optional(),
  categories: z.array(z.string().max(64)).max(32).default([]),
  artifact: artifactSchema.nullable(),
  /** `paseo plugin add` 的来源参数；不可安装时为 null。 */
  installSource: z.string().max(500).nullable(),
  installRef: z.string().max(128).nullable(),
  installPath: z.string().max(500).nullable(),
  installable: z.boolean(),
  installNote: z.string().max(500).optional(),
  /** 值得在安装前提醒的短注意事项（如安全扫描未通过、平台限制）。 */
  caveats: z.array(z.string().max(300)).max(6).default([]),
  icon: z.string().max(2_048).optional(),
  media: z.array(z.string().max(2_048)).max(6).default([]),
  installs: z.number().int().nonnegative().optional(),
  version: z.string().max(128).optional(),
  updatedAt: z.string().max(40).optional(),
  repositoryUrl: z.string().max(2_048).optional(),
  /** 该条目在源站点上的可分享链接。 */
  listingUrl: z.string().max(2_048).optional(),
});
export type MarketEntry = z.infer<typeof marketEntrySchema>;

export const marketCategorySchema = z.object({
  slug: z.string().max(64),
  label: z.string().max(100),
  description: z.string().max(500).optional(),
});
export type MarketCategory = z.infer<typeof marketCategorySchema>;

export const sourceStatusSchema = z.object({
  sourceId: z.string().max(64),
  name: z.string().max(100),
  kind: sourceKindSchema,
  ok: z.boolean(),
  count: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative().default(0),
  error: z.string().max(2_000).optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

// ---------------------------------------------------------------------------
// 已安装插件

export const installedPluginSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200).optional(),
  description: z.string().max(2_000).optional(),
  icon: z.string().max(500).optional(),
  enabled: z.boolean(),
  status: z.enum(["running", "failed", "disabled"]),
  kind: z.enum(["directory", "git", "npm"]),
  registryId: z.string().max(100).optional(),
  registryUrl: z.string().max(2_048).optional(),
  packageName: z.string().max(214).optional(),
  remote: z.string().max(500).optional(),
  pluginPath: z.string().max(500).optional(),
  revision: z.string().max(128).optional(),
});
export type InstalledPlugin = z.infer<typeof installedPluginSchema>;

export const UPDATE_OUTCOMES = [
  "update",
  "current",
  "installed-newer",
  "local",
  "error",
] as const;

export const pluginUpdateSchema = z.object({
  id: z.string().min(1).max(100),
  outcome: z.enum(UPDATE_OUTCOMES),
  target: z.string().max(128).optional(),
  error: z.string().max(2_000).optional(),
});
export type PluginUpdate = z.infer<typeof pluginUpdateSchema>;

// ---------------------------------------------------------------------------
// 纯函数：产物比较、已安装匹配、展示

function normalizeRemote(remote: string | undefined): string | undefined {
  return remote
    ?.trim()
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function normalizePath(path: string | undefined): string {
  return (path ?? "").trim().replace(/^\.?\/*/, "").replace(/\/+$/, "");
}

export function sameArtifact(left: Artifact, right: Artifact): boolean {
  if (left.kind === "npm" && right.kind === "npm") {
    return left.package === right.package && left.version === right.version;
  }
  if (left.kind === "git" && right.kind === "git") {
    return (
      normalizeRemote(left.remote) === normalizeRemote(right.remote) &&
      (left.commit ?? "").toLowerCase() === (right.commit ?? "").toLowerCase() &&
      normalizePath(left.pluginPath) === normalizePath(right.pluginPath)
    );
  }
  return false;
}

/**
 * 某条目录条目对应的已安装插件。带 registry 身份的按 `registryUrl + id` 精确匹配；
 * 否则按 npm 包名，或 git remote + 子路径匹配。
 */
export function findInstallations(
  entry: Pick<MarketEntry, "id" | "artifact">,
  installations: readonly InstalledPlugin[],
  sourceUrl: string,
): InstalledPlugin[] {
  const base = sourceBase(sourceUrl);
  return installations.filter((installation) => {
    if (installation.registryId !== undefined) {
      return (
        installation.registryId === entry.id &&
        sourceBase(installation.registryUrl ?? "") === base
      );
    }
    const { artifact } = entry;
    if (!artifact) return false;
    if (artifact.kind === "npm") {
      return installation.kind === "npm" && installation.packageName === artifact.package;
    }
    return (
      installation.kind === "git" &&
      normalizeRemote(installation.remote) === normalizeRemote(artifact.remote) &&
      normalizePath(installation.pluginPath) === normalizePath(artifact.pluginPath)
    );
  });
}

/** 产物的短标签：npm 版本，或 12 位 commit。 */
export function formatArtifactRevision(artifact: Artifact | null): string {
  if (!artifact) return "";
  return artifact.kind === "npm"
    ? artifact.version || "latest"
    : (artifact.commit ?? "").slice(0, 12);
}

export function countAvailableUpdates(
  updates: readonly Pick<PluginUpdate, "outcome">[],
): number {
  return updates.filter((update) => update.outcome === "update").length;
}

/** 安装来源的展示形式：`paseo plugin add <source> [--ref ...] [--path ...]`。 */
export function formatInstallCommand(entry: MarketEntry): string {
  if (!entry.installable || !entry.installSource) return "不可安装";
  const parts = ["paseo plugin add", entry.installSource];
  if (entry.installRef) parts.push(`--ref ${entry.installRef}`);
  if (entry.installPath) parts.push(`--path ${entry.installPath}`);
  return parts.join(" ");
}