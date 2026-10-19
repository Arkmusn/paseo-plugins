import { z } from "zod";
import {
  type Artifact,
  DEFAULT_REGISTRY_URL,
  DEFAULT_CAFE_URL,
  MAX_ENTRY_DESCRIPTION,
  type MarketCategory,
  type MarketEntry,
  type MarketSource,
  SITE_URL,
  type SourceStatus,
  sourceBase,
  sourceRoot,
} from "../shared/model";
import type { InstallTarget } from "./cli";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_RESPONSE_BYTES = 16 * 1_024 * 1_024;
const MAX_MEDIA = 6;
const MAX_CATEGORIES = 200;

// ---------------------------------------------------------------------------
// 受限的 JSON 抓取

async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`源响应超过 ${MAX_RESPONSE_BYTES} 字节上限`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let parts: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`源响应超过 ${MAX_RESPONSE_BYTES} 字节上限`);
    }
    parts.push(decoder.decode(value, { stream: true }));
    if (parts.length >= 1_024) parts = [parts.join("")];
  }
  parts.push(decoder.decode());
  return parts.join("");
}

/**
 * 拒绝重定向：daemon 安装时同样拒绝重定向，若源会重定向，列出的插件将无人可装。
 */
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`${url} 返回 ${response.status} ${response.statusText}`);
    }
    return JSON.parse(await readBoundedBody(response));
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// 通用工具

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function truncate(text: string): string {
  return text.length > MAX_ENTRY_DESCRIPTION ? `${text.slice(0, MAX_ENTRY_DESCRIPTION - 1)}…` : text;
}

function httpsOnly(urls: unknown, limit = MAX_MEDIA): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter((url): url is string => typeof url === "string" && /^https:\/\//i.test(url)).slice(0, limit);
}

function hostRootInstall(source: MarketSource, id: string): InstallTarget | null {
  if (sourceBase(source.url) === DEFAULT_REGISTRY_URL) return { source: id };
  const root = sourceRoot(source.url);
  if (!root) return null;
  return { source: `${root.host}${root.port ? `:${root.port}` : ""}/${id}` };
}

/**
 * 直接用条目自带的产物构造安装来源。用于源不是默认注册表、且无法按 host/id 解析的场景：
 * npm 走 `npm:包@版本`，git 走远端 URL（或 owner/repo）加 commit 与子路径。
 */
function artifactInstall(artifact: Artifact): InstallTarget | null {
  if (artifact.kind === "npm") {
    return {
      source: artifact.version ? `npm:${artifact.package}@${artifact.version}` : `npm:${artifact.package}`,
    };
  }
  if (!artifact.remote) return null;
  return { source: artifact.remote, ref: artifact.commit, path: artifact.pluginPath };
}

/** 注册表型条目的安装来源：默认注册表交给 daemon 解析，否则退回产物直接安装。 */
function registryInstall(source: MarketSource, id: string, artifact: Artifact): InstallTarget | null {
  return hostRootInstall(source, id) ?? artifactInstall(artifact);
}

function listingUrl(source: MarketSource, id: string, repositoryUrl?: string): string | undefined {
  if (source.kind === "paseo-registry" && sourceBase(source.url) === DEFAULT_REGISTRY_URL) {
    return `${SITE_URL}/plugins/${id}`;
  }
  if (source.kind === "paseo-cafe") return `https://${new URL(source.url).host}/plugins/${id}`;
  return repositoryUrl;
}

// ---------------------------------------------------------------------------
// Paseo 注册表协议 v1

const registryArtifactSchema = z.discriminatedUnion("kind", [
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

const registryEntrySchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200).default(""),
  description: z.string().max(4_000).default(""),
  categories: z.array(z.string().max(64)).max(32).default([]),
  author: z
    .object({ github: z.string().max(100).optional(), name: z.string().max(200).optional() })
    .partial()
    .optional(),
  repository: z.object({ url: z.string().max(2_048).optional() }).partial().optional(),
  artifact: registryArtifactSchema,
  icon: z.string().max(2_048).optional(),
  media: z.array(z.string()).max(16).default([]),
  updatedAt: z.string().max(40).optional(),
  installs: z.number().int().nonnegative().optional(),
});

function normalizeRegistryEntry(
  source: MarketSource,
  raw: unknown,
): { entry: MarketEntry; install: InstallTarget | null } | null {
  const parsed = registryEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  const artifact: Artifact = value.artifact;
  const install = registryInstall(source, value.id, artifact);
  const repositoryUrl = value.repository?.url;
  return {
    install,
    entry: {
      sourceId: source.id,
      sourceName: source.name || source.id,
      sourceKind: source.kind,
      id: value.id,
      globalId: `${source.id}:${value.id}`,
      name: value.name || value.id,
      description: truncate(value.description),
      author: value.author?.name ?? value.author?.github,
      categories: value.categories,
      artifact,
      installSource: install?.source ?? null,
      installRef: install?.ref ?? null,
      installPath: install?.path ?? null,
      installable: install !== null,
      installNote:
        install === null
          ? "该条目既没有 daemon 可解析的注册表来源，也没有可用的 npm/Git 产物"
          : undefined,
      caveats: [],
      icon: /^https:\/\//i.test(value.icon ?? "") ? value.icon : undefined,
      media: httpsOnly(value.media),
      installs: value.installs,
      version: artifact.kind === "npm" ? artifact.version || undefined : undefined,
      updatedAt: value.updatedAt,
      repositoryUrl,
      listingUrl: listingUrl(source, value.id, repositoryUrl),
    },
  };
}

const registryIndexSchema = z.object({
  schemaVersion: z.number().optional(),
  registry: z.object({ name: z.string().max(200) }).optional(),
  categories: z.array(z.unknown()).max(256).default([]),
  plugins: z.array(z.unknown()).max(5_000),
});

// ---------------------------------------------------------------------------
// paseo.cafe 目录 API

const cafeEntrySchema = z.object({
  id: z.string().min(1).max(200),
  repo: z.string().max(200),
  path: z.string().max(500).optional(),
  npm: z
    .object({
      package: z.string().min(1).max(214),
      version: z.string().max(128).default(""),
      integrity: z.string().max(256).optional(),
      downloadsLast30Days: z.number().int().nonnegative().optional(),
    })
    .optional(),
  name: z.string().max(200).optional(),
  description: z.string().max(4_000).default(""),
  categories: z.array(z.string().max(64)).max(32).default([]),
  images: z.array(z.string()).max(32).default([]),
  caveats: z.array(z.string().max(300)).max(16).default([]),
  version: z.string().max(128).optional(),
  security: z.object({ commit: z.string().max(64).optional() }).partial().optional(),
  author: z.string().max(200).optional(),
  license: z.string().max(100).optional(),
  manifest: z.object({ id: z.string().optional() }).partial().optional(),
  addedAt: z.string().max(40).optional(),
  scannedAt: z.string().max(40).optional(),
});

function normalizeCafeEntry(
  source: MarketSource,
  raw: unknown,
): { entry: MarketEntry; install: InstallTarget | null } | null {
  const parsed = cafeEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  const commit = value.security?.commit;
  let artifact: Artifact | null = null;
  let install: InstallTarget | null = null;
  if (value.npm) {
    artifact = {
      kind: "npm",
      package: value.npm.package,
      version: value.npm.version,
      integrity: value.npm.integrity,
    };
    install = {
      source: value.npm.version ? `npm:${value.npm.package}@${value.npm.version}` : `npm:${value.npm.package}`,
    };
  } else if (value.repo) {
    artifact = {
      kind: "git",
      remote: `https://github.com/${value.repo}`,
      commit,
      pluginPath: value.path,
    };
    install = { source: `git:${value.repo}`, ref: commit, path: value.path };
  }
  const repositoryUrl = `https://github.com/${value.repo}`;
  return {
    install,
    entry: {
      sourceId: source.id,
      sourceName: source.name || source.id,
      sourceKind: source.kind,
      id: value.id,
      globalId: `${source.id}:${value.id}`,
      name: value.manifest?.id && value.manifest.id !== value.id ? value.manifest.id : titleCaseSlug(value.id),
      description: truncate(value.description),
      author: value.author,
      categories: value.categories,
      artifact,
      installSource: install?.source ?? null,
      installRef: install?.ref ?? null,
      installPath: install?.path ?? null,
      installable: install !== null,
      installNote: install === null ? "该条目没有可用的 npm 包或 Git 仓库" : undefined,
      caveats: value.caveats.slice(0, 6),
      media: httpsOnly(value.images),
      installs: value.npm?.downloadsLast30Days,
      version: value.version,
      updatedAt: value.scannedAt ?? value.addedAt,
      repositoryUrl,
      listingUrl: listingUrl(source, value.id, repositoryUrl),
    },
  };
}

const cafeCatalogSchema = z.object({
  plugins: z.array(z.unknown()).max(5_000),
  generatedAt: z.string().max(40).optional(),
});

// ---------------------------------------------------------------------------
// 源加载（带缓存与并发去重）

interface LoadedSource {
  receivedAt: number;
  fetchedAt: string;
  name: string;
  entries: MarketEntry[];
  categories: MarketCategory[];
  invalidCount: number;
  /** sourceId → 安装目标，安装时用于二次校验。 */
  installs: Map<string, InstallTarget | null>;
}

const sourceCache = new Map<string, LoadedSource>();
const inFlight = new Map<string, Promise<LoadedSource>>();

function cacheKey(source: MarketSource): string {
  return `${source.kind}::${sourceBase(source.url)}`;
}

function collectCategories(entries: MarketEntry[], declared: MarketCategory[]): MarketCategory[] {
  const known = new Map<string, MarketCategory>();
  for (const category of declared) known.set(category.slug, category);
  for (const entry of entries) {
    for (const slug of entry.categories) {
      if (!known.has(slug)) known.set(slug, { slug, label: titleCaseSlug(slug) });
    }
  }
  return [...known.values()].sort((a, b) => a.slug.localeCompare(b.slug)).slice(0, MAX_CATEGORIES);
}

async function loadRegistry(source: MarketSource): Promise<LoadedSource> {
  const base = sourceBase(source.url);
  const index = registryIndexSchema.parse(await fetchJson(`${base}/index.json`));
  const entries: MarketEntry[] = [];
  const installs = new Map<string, InstallTarget | null>();
  let invalidCount = 0;
  for (const raw of index.plugins) {
    const normalized = normalizeRegistryEntry(source, raw);
    if (!normalized) {
      invalidCount += 1;
      continue;
    }
    entries.push(normalized.entry);
    installs.set(normalized.entry.id, normalized.install);
  }
  return {
    receivedAt: Date.now(),
    fetchedAt: new Date().toISOString(),
    name: index.registry?.name ?? source.name,
    entries,
    categories: collectCategories(entries, []),
    invalidCount,
    installs,
  };
}

async function loadCafe(source: MarketSource): Promise<LoadedSource> {
  const base = sourceBase(source.url);
  const catalog = cafeCatalogSchema.parse(await fetchJson(`${base}/api/plugins`));
  const entries: MarketEntry[] = [];
  const installs = new Map<string, InstallTarget | null>();
  let invalidCount = 0;
  for (const raw of catalog.plugins) {
    const normalized = normalizeCafeEntry(source, raw);
    if (!normalized) {
      invalidCount += 1;
      continue;
    }
    entries.push(normalized.entry);
    installs.set(normalized.entry.id, normalized.install);
  }
  return {
    receivedAt: Date.now(),
    fetchedAt: catalog.generatedAt ?? new Date().toISOString(),
    name: source.name || "Paseo Cafe",
    entries,
    categories: collectCategories(entries, []),
    invalidCount,
    installs,
  };
}

/** 自定义 JSON：自动识别注册表协议、cafe 目录或裸数组。 */
async function loadCustom(source: MarketSource): Promise<LoadedSource> {
  const parsed = (await fetchJson(sourceBase(source.url))) as unknown;
  let rows: unknown[] = [];
  let declaredCategories: MarketCategory[] = [];
  let name = source.name || source.id;
  let isRegistry = false;
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.plugins)) {
      rows = record.plugins;
      isRegistry = "schemaVersion" in record || "registry" in record;
      if (isRegistry && record.registry && typeof record.registry === "object") {
        const registryName = (record.registry as Record<string, unknown>).name;
        if (typeof registryName === "string") name = registryName;
      }
      if (Array.isArray(record.categories)) {
        declaredCategories = z
          .array(z.object({ slug: z.string().max(64), label: z.string().max(100), description: z.string().max(500).optional() }))
          .safeParse(record.categories).data ?? [];
      }
    } else {
      throw new Error("自定义 JSON 需包含 plugins 数组，或本身是一个数组");
    }
  } else {
    throw new Error("自定义 JSON 的形状无法识别");
  }
  const entries: MarketEntry[] = [];
  const installs = new Map<string, InstallTarget | null>();
  let invalidCount = 0;
  for (const raw of rows) {
    const looksCafe =
      !isRegistry &&
      raw !== null &&
      typeof raw === "object" &&
      !("artifact" in (raw as Record<string, unknown>)) &&
      ("repo" in (raw as Record<string, unknown>) || "npm" in (raw as Record<string, unknown>));
    const normalized = looksCafe
      ? normalizeCafeEntry(source, raw)
      : normalizeRegistryEntry(source, raw);
    if (!normalized) {
      invalidCount += 1;
      continue;
    }
    entries.push(normalized.entry);
    installs.set(normalized.entry.id, normalized.install);
  }
  return {
    receivedAt: Date.now(),
    fetchedAt: new Date().toISOString(),
    name,
    entries,
    categories: collectCategories(entries, declaredCategories),
    invalidCount,
    installs,
  };
}

function loadFromNetwork(source: MarketSource): Promise<LoadedSource> {
  switch (source.kind) {
    case "paseo-registry":
      return loadRegistry(source);
    case "paseo-cafe":
      return loadCafe(source);
    case "custom-json":
      return loadCustom(source);
  }
}

async function loadSource(source: MarketSource, force: boolean): Promise<LoadedSource> {
  const key = cacheKey(source);
  const cached = sourceCache.get(key);
  if (!force && cached && Date.now() - cached.receivedAt < CACHE_TTL_MS) return cached;
  const existing = inFlight.get(key);
  if (existing && !force) return existing;
  const request = loadFromNetwork(source)
    .then((loaded) => {
      sourceCache.set(key, loaded);
      return loaded;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

// ---------------------------------------------------------------------------
// 对外：目录、已安装匹配、详情、安装校验

export interface CatalogResult {
  sources: SourceStatus[];
  entries: MarketEntry[];
  categories: MarketCategory[];
  fetchedAt: string;
}

export async function buildCatalog(sources: MarketSource[], force: boolean): Promise<CatalogResult> {
  const enabled = sources.filter((source) => source.enabled);
  const results = await Promise.all(
    enabled.map(async (source): Promise<{ status: SourceStatus; loaded?: LoadedSource }> => {
      try {
        const loaded = await loadSource(source, force);
        return {
          status: {
            sourceId: source.id,
            name: loaded.name,
            kind: source.kind,
            ok: true,
            count: loaded.entries.length,
            invalidCount: loaded.invalidCount,
          },
          loaded,
        };
      } catch (error) {
        return {
          status: {
            sourceId: source.id,
            name: source.name || source.id,
            kind: source.kind,
            ok: false,
            count: 0,
            invalidCount: 0,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }),
  );
  const entries = results.flatMap((result) => result.loaded?.entries ?? []);
  const categories = collectCategories(
    entries,
    results.flatMap((result) => result.loaded?.categories ?? []),
  );
  return {
    sources: results.map((result) => result.status),
    entries,
    categories,
    fetchedAt: new Date().toISOString(),
  };
}

/** 安装前用新鲜的源数据重新定位条目，避免确认后源内容被替换。 */
export async function findEntry(
  source: MarketSource,
  entryId: string,
): Promise<{ entry: MarketEntry; install: InstallTarget | null } | undefined> {
  const loaded = await loadSource(source, true);
  const entry = loaded.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return undefined;
  return { entry, install: loaded.installs.get(entryId) ?? null };
}

export async function fetchDetail(source: MarketSource, entryId: string): Promise<string> {
  const base = sourceBase(source.url);
  if (source.kind === "paseo-cafe") {
    const record = (await fetchJson(`${base}/api/plugin/${entryId}.json`)) as Record<string, unknown>;
    return typeof record.readmeText === "string" ? record.readmeText : "";
  }
  const detail = z
    .object({ id: z.string(), readme: z.string() })
    .safeParse(await fetchJson(`${base}/plugins/${encodeURIComponent(entryId)}.json`));
  return detail.success ? detail.data.readme : "";
}

export interface SourceCheck {
  name: string;
  count: number;
  invalidCount: number;
}

export async function checkSource(kind: MarketSource["kind"], url: string): Promise<SourceCheck> {
  const source: MarketSource = { id: "check", name: "", kind, url, enabled: true };
  const loaded = await loadSourceFromNetworkFresh(source);
  return { name: loaded.name, count: loaded.entries.length, invalidCount: loaded.invalidCount };
}

async function loadSourceFromNetworkFresh(source: MarketSource): Promise<LoadedSource> {
  return loadFromNetwork(source);
}

export { DEFAULT_CAFE_URL };