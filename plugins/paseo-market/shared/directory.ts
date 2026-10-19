import {
  defineAttachmentSource,
  defineRpc,
  defineSettings,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin"
import { z } from "zod"

/** Official Paseo plugin registry (protocol v1): `<base>/index.json` and `<base>/plugins/<owner>/<slug>.json`. */
export const DEFAULT_REGISTRY_URL = "https://plugins.paseo.sh"
/** Community directory (its own REST shape): `<base>/api/plugins` and `<base>/api/plugin/<id>.json`. */
export const DEFAULT_CAFE_URL = "https://paseo.cafe"
export const SITE_URL = "https://paseo.sh"
export const SUBMIT_URL =
  "https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml"
export const REGISTRY_ISSUES_URL =
  "https://github.com/getpaseo/plugins/issues/new"

/** Installation id of this plugin; it cannot be stopped mid-update, so it updates detached. */
export const SELF_INSTALLATION_ID = "paseo-market"

/**
 * The registry decides what the `paseo` CLI installs on the daemon host, so
 * the transport must be authenticated: HTTPS, or HTTP on loopback only.
 * Parsed by hand because React Native's URL shim mangles IPv6 hosts.
 */
const registryUrlPattern =
  /^(https?):\/\/([^/?#@\s\\]+@)?(\[[0-9a-f:.]+\]|[^:/?#@\s\\]+)(?::(\d+))?(\/[^?#\s]*)?$/i

export function isTrustedRegistryUrl(value: string): boolean {
  const match = registryUrlPattern.exec(value.trim())
  if (!match) return false
  const [, protocol, credentials, rawHost, port] = match
  if (credentials !== undefined) return false
  if (port !== undefined && Number(port) > 65_535) return false
  if (protocol.toLowerCase() === "https") return true
  const host = rawHost.toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") {
    return true
  }
  const octets = host.split(".")
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every(
      (octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255
    )
  )
}

const registryUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    isTrustedRegistryUrl,
    "Registry URL must use HTTPS, or HTTP on localhost"
  )

export function registryBase(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

/** 去掉路径后的 `host[:port]`；仅在 HTTPS 且无路径时用于 `host/owner/slug` 安装来源。 */
export function sourceRoot(
  url: string
): { host: string; port?: string } | undefined {
  const match = registryUrlPattern.exec(registryBase(url))
  if (!match || match[5] !== undefined || !/^https:/i.test(match[1]))
    return undefined
  return { host: match[3], port: match[4] }
}

// ---------------------------------------------------------------------------
// Market sources

export const SOURCE_KINDS = [
  "paseo-registry",
  "paseo-cafe",
  "custom-json",
] as const
export const sourceKindSchema = z.enum(SOURCE_KINDS)
export type SourceKind = z.infer<typeof sourceKindSchema>

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  "paseo-registry": "Paseo registry",
  "paseo-cafe": "Paseo Cafe directory",
  "custom-json": "Custom JSON",
}

const sourceIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const marketSourceSchema = z.object({
  id: sourceIdSchema,
  name: z.string().max(100).default(""),
  kind: sourceKindSchema,
  url: registryUrlSchema,
  enabled: z.boolean().default(true),
})
export type MarketSource = z.infer<typeof marketSourceSchema>

export const DEFAULT_SOURCES: MarketSource[] = [
  {
    id: "official",
    name: "Paseo registry",
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
]

export const sourceStatusSchema = z.object({
  sourceId: z.string().max(64),
  name: z.string().max(100),
  kind: sourceKindSchema,
  ok: z.boolean(),
  count: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative().default(0),
  error: z.string().max(2_000).optional(),
})
export type SourceStatus = z.infer<typeof sourceStatusSchema>

const SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*"
export const REGISTRY_ID_PATTERN = new RegExp(`^${SEGMENT}/${SEGMENT}$`)
const registryIdSchema = z.string().max(100).regex(REGISTRY_ID_PATTERN)
const httpsUrlSchema = z
  .string()
  .max(2_048)
  .refine((value) => /^https:\/\//i.test(value), "Expected an HTTPS URL")

const npmArtifactSchema = z.object({
  kind: z.literal("npm"),
  package: z.string().min(1).max(214),
  version: z.string().max(128).default(""),
  resolved: z.string().max(2_048).optional(),
  integrity: z.string().startsWith("sha512-").max(256).optional(),
})
const gitArtifactSchema = z.object({
  kind: z.literal("git"),
  remote: z.string().min(1).max(500),
  commit: z
    .string()
    .regex(/^[0-9a-f]{40,64}$/i)
    .optional(),
  pluginPath: z.string().max(500).optional(),
})
export const artifactSchema = z.discriminatedUnion("kind", [
  npmArtifactSchema,
  gitArtifactSchema,
])
export type Artifact = z.infer<typeof artifactSchema>

const dateSchema = z.string().max(40)
const entryIdSchema = z.string().min(1).max(200)

export const directoryEntrySchema = z.object({
  id: entryIdSchema,
  /** 该条目所属的市场源；跨源唯一键是 `${sourceId}:${id}`。 */
  sourceId: z.string().max(64),
  sourceKind: sourceKindSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).default(""),
  license: z.string().max(100).optional(),
  categories: z.array(z.string().max(64)).max(32).default([]),
  author: z.object({
    github: z.string().max(100).default(""),
    name: z.string().max(200).optional(),
    npm: z.string().max(200).optional(),
  }),
  repository: z.object({
    url: z.string().max(2_048).default(""),
    commit: z.string().max(64).optional(),
  }),
  artifact: artifactSchema,
  /** `paseo plugin add` 的来源参数；不可安装时为 null。服务端算好后供界面展示。 */
  installCommand: z.string().max(500).nullable().default(null),
  icon: httpsUrlSchema.optional(),
  media: z.array(httpsUrlSchema).max(16).default([]),
  publishedAt: dateSchema.default(""),
  updatedAt: dateSchema.default(""),
  reviewedAt: dateSchema.optional(),
  installs: z.number().int().nonnegative().optional(),
})
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>

export const directoryCategorySchema = z.object({
  slug: z.string().max(64),
  label: z.string().max(100),
  description: z.string().max(500).optional(),
})
export type DirectoryCategory = z.infer<typeof directoryCategorySchema>

export const DIRECTORY_SORT_MODES = [
  "updates-first",
  "popular",
  "recent",
  "recently-added",
  "a-z",
] as const
export const DIRECTORY_STATUS_FILTERS = [
  "all",
  "installed",
  "updates",
  "not-installed",
] as const

export const directoryBrowseSettingsSchema = z.object({
  query: z.string().max(200).default(""),
  categories: z.array(z.string().max(64)).max(32).default([]),
  /** 空数组表示不按源过滤。 */
  sourceIds: z.array(z.string().max(64)).max(50).default([]),
  // Tolerant on purpose: browse state is nested in the settings document, so an
  // unknown slug from another build must not invalidate every other setting.
  status: z.enum(DIRECTORY_STATUS_FILTERS).catch("all").default("all"),
  sort: z
    .enum(DIRECTORY_SORT_MODES)
    .catch("updates-first")
    .default("updates-first"),
  lastOpenedPluginId: z.string().nullable().default(null),
})
export type DirectoryBrowseSettings = z.infer<
  typeof directoryBrowseSettingsSchema
>
export const DEFAULT_DIRECTORY_BROWSE_SETTINGS =
  directoryBrowseSettingsSchema.parse({})

export function isDefaultDirectoryBrowseView(
  browse: Pick<
    DirectoryBrowseSettings,
    "query" | "categories" | "sourceIds" | "status" | "sort"
  >
): boolean {
  return (
    browse.query.trim() === "" &&
    browse.categories.length === 0 &&
    browse.sourceIds.length === 0 &&
    browse.status === DEFAULT_DIRECTORY_BROWSE_SETTINGS.status &&
    browse.sort === DEFAULT_DIRECTORY_BROWSE_SETTINGS.sort
  )
}

export function directoryBrowseSettingsEqual(
  left: DirectoryBrowseSettings,
  right: DirectoryBrowseSettings
): boolean {
  return (
    left.query === right.query &&
    left.status === right.status &&
    left.sort === right.sort &&
    left.lastOpenedPluginId === right.lastOpenedPluginId &&
    left.sourceIds.length === right.sourceIds.length &&
    left.sourceIds.every((id) => right.sourceIds.includes(id)) &&
    left.categories.length === right.categories.length &&
    left.categories.every((category) => right.categories.includes(category))
  )
}

const installationIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(100)

export function setAutomaticUpdatePreference(
  current: readonly string[],
  installationId: string,
  enabled: boolean
): string[] {
  return enabled
    ? current.filter((id) => id !== installationId)
    : Array.from(new Set([...current, installationId]))
}

/**
 * v5 retires the Cafe catalog URL, Preview opt-ins, and the pending self-update
 * record. v6 replaces the single `registryUrl` with a `sources` list. Browse
 * state and automatic-update opt-outs carry over; a non-default custom registry
 * becomes a single paseo-registry source.
 */
export function migrateDirectorySettings(
  values: unknown,
  fromVersion: number
): unknown {
  if (
    fromVersion >= 6 ||
    typeof values !== "object" ||
    values === null ||
    Array.isArray(values)
  ) {
    return values
  }
  const previous = values as Record<string, unknown>
  const browse =
    previous.browse &&
    typeof previous.browse === "object" &&
    !Array.isArray(previous.browse)
      ? (previous.browse as Record<string, unknown>)
      : {}

  let sources: unknown = Array.isArray(previous.sources)
    ? previous.sources
    : undefined
  if (sources === undefined) {
    const url = typeof previous.registryUrl === "string" ? previous.registryUrl : ""
    const base = registryBase(url)
    sources =
      base && base !== DEFAULT_REGISTRY_URL && isTrustedRegistryUrl(base)
        ? [
            {
              id: "custom",
              name: "Custom registry",
              kind: "paseo-registry",
              url: base,
              enabled: true,
            },
          ]
        : DEFAULT_SOURCES
  }

  return {
    sources,
    browse: {
      ...browse,
      sourceIds: [],
      // The pre-v5 Cafe taxonomy differed from the registry's, so reset then.
      categories: fromVersion >= 5 ? (browse.categories ?? []) : [],
    },
    autoUpdateOptOuts: previous.autoUpdateOptOuts,
  }
}

export const directorySettings = defineSettings({
  id: "directory-settings",
  scope: "host",
  version: 6,
  schema: z.object({
    sources: z.array(marketSourceSchema).max(50).default(DEFAULT_SOURCES),
    browse: directoryBrowseSettingsSchema.default(
      DEFAULT_DIRECTORY_BROWSE_SETTINGS
    ),
    autoUpdateOptOuts: z.array(installationIdSchema).max(500).default([]),
  }),
  migrate: migrateDirectorySettings,
})

/** One row of `paseo plugin ls --json`, reduced to what the directory shows and matches on. */
export const installedPluginSchema = z.object({
  id: installationIdSchema,
  enabled: z.boolean(),
  status: z.enum(["running", "failed", "disabled"]),
  kind: z.enum(["directory", "git", "npm"]),
  registryId: z.string().max(100).optional(),
  registryUrl: z.string().max(2_048).optional(),
  packageName: z.string().max(214).optional(),
  remote: z.string().max(500).optional(),
  pluginPath: z.string().max(500).optional(),
  revision: z.string().max(128).optional(),
})
export type InstalledPlugin = z.infer<typeof installedPluginSchema>

/** One row of `paseo plugin update --all --check --json`. */
export const pluginUpdateSchema = z.object({
  id: installationIdSchema,
  outcome: z.enum(["update", "current", "installed-newer", "local", "error"]),
  target: z.string().max(128).optional(),
  error: z.string().max(2_000).optional(),
})
export type PluginUpdate = z.infer<typeof pluginUpdateSchema>

/** Output limits of `directory.list`; the server trims what the registry serves to fit. */
export const MAX_DIRECTORY_CATEGORIES = 64
export const MAX_DIRECTORY_FEATURED = 100

export const directoryListRpc = defineRpc({
  name: "directory.list",
  input: z.object({
    force: z.boolean().default(false),
  }),
  output: z.object({
    sources: z.array(sourceStatusSchema).max(64),
    plugins: z.array(directoryEntrySchema).max(4_000),
    categories: z.array(directoryCategorySchema).max(MAX_DIRECTORY_CATEGORIES),
    featured: z.array(z.string().max(100)).max(MAX_DIRECTORY_FEATURED),
    /** Entries the registries served that failed validation; shown, never silently dropped. */
    invalidCount: z.number().int().nonnegative(),
    fetchedAt: z.iso.datetime({ offset: true, local: true }),
    /** False when the daemon's `paseo` CLI cannot resolve `owner/slug` (needs 0.11.0-beta.4+). */
    installSupported: z.boolean(),
    installations: z.array(installedPluginSchema).max(500).optional(),
    installationError: z.string().optional(),
  }),
})

export const directoryDetailRpc = defineRpc({
  name: "directory.detail",
  input: z.object({
    sourceId: z.string().max(64),
    id: entryIdSchema,
  }),
  output: z.object({ readme: z.string().max(200_000) }),
})

export const directoryUpdateStatusRpc = defineRpc({
  name: "directory.update-status",
  // `force` skips the daemon-side cache so Refresh sees changes made outside the app.
  input: z.object({ force: z.boolean().default(false) }),
  output: z.object({ updates: z.array(pluginUpdateSchema).max(500) }),
})

export const directoryInstallRpc = defineRpc({
  name: "directory.install",
  input: z.object({
    sourceId: z.string().max(64),
    id: entryIdSchema,
    /** The artifact the user reviewed; install is refused if the source pin moved since. */
    expected: artifactSchema.nullable(),
  }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
})

export const directoryUninstallRpc = defineRpc({
  name: "directory.uninstall",
  input: z.object({ installationId: installationIdSchema }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
})

export const directorySetEnabledRpc = defineRpc({
  name: "directory.set-enabled",
  input: z.object({
    installationId: installationIdSchema,
    enabled: z.boolean(),
  }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
})

export const directoryReloadRpc = defineRpc({
  name: "directory.reload",
  input: z.object({ installationId: installationIdSchema }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
})

export const directoryUpdateRpc = defineRpc({
  name: "directory.update",
  input: z.object({ installationId: installationIdSchema }),
  output: z.object({
    ok: z.boolean(),
    message: z.string(),
    updated: z.boolean().optional(),
    /** True when this plugin updated itself: its process restarts and the call cannot report the result. */
    restarting: z.boolean().optional(),
  }),
})

export const directorySearchRpc = defineRpc({
  name: "directory.search",
  input: z.object({ query: z.string().max(200) }),
  output: PluginAttachmentSearchPayloadSchema,
})

export const directoryAttachments = defineAttachmentSource({
  id: "paseo-plugins",
  title: "Paseo plugin",
  icon: "Blocks",
  pickerTitle: "Attach Paseo plugin",
  searchPlaceholder: "Search plugins by name, author, or category",
  search: directorySearchRpc,
})

/**
 * The argument for `paseo plugin add`, or undefined when this registry cannot
 * be installed from: the daemon resolves bare ids against its own default
 * registry and `host/owner/slug` against a host root, never a path prefix.
 */
export function getInstallSource(
  registryUrl: string,
  id: string
): string | undefined {
  const base = registryBase(registryUrl)
  if (base === DEFAULT_REGISTRY_URL) return id
  const match = registryUrlPattern.exec(base)
  if (!match || match[5] !== undefined || !/^https:/i.test(base))
    return undefined
  return `${match[3]}${match[4] ? `:${match[4]}` : ""}/${id}`
}

export function getInstallCommand(
  registryUrl: string,
  id: string
): string | undefined {
  const source = getInstallSource(registryUrl, id)
  return source === undefined ? undefined : `paseo plugin add ${source}`
}

export function getUpdateCommand(installationId: string): string {
  return `paseo plugin update ${installationId} --yes`
}

export function getSiteUrl(id: string): string {
  return `${SITE_URL}/plugins/${id}`
}

export function getReportPluginIssueUrl(id: string): string {
  return `${REGISTRY_ISSUES_URL}?title=${encodeURIComponent(`Report: ${id}`)}`
}

function normalizeRemote(remote: string | undefined): string | undefined {
  return remote
    ?.trim()
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase()
}

function normalizePath(path: string | undefined): string {
  const trimmed = (path ?? "")
    .trim()
    .replace(/^\.?\/*/, "")
    .replace(/\/+$/, "")
  return trimmed
}

/**
 * Installations of a listing. A registry install carries the listing id and is
 * matched exactly; installs made through `npm:` or `git:` sources before the
 * pivot carry no registry identity and match on the artifact's package, or on
 * remote plus plugin path.
 */
export function findInstallations(
  entry: Pick<DirectoryEntry, "id" | "artifact">,
  installations: readonly InstalledPlugin[],
  registryUrl: string
): InstalledPlugin[] {
  const base = registryBase(registryUrl)
  return installations.filter((installation) => {
    if (installation.registryId !== undefined) {
      return (
        installation.registryId === entry.id &&
        registryBase(installation.registryUrl ?? "") === base
      )
    }
    const { artifact } = entry
    if (artifact.kind === "npm") {
      return (
        installation.kind === "npm" &&
        installation.packageName === artifact.package
      )
    }
    return (
      installation.kind === "git" &&
      normalizeRemote(installation.remote) ===
        normalizeRemote(artifact.remote) &&
      normalizePath(installation.pluginPath) ===
        normalizePath(artifact.pluginPath)
    )
  })
}

export function sameArtifact(left: Artifact, right: Artifact): boolean {
  if (left.kind === "npm" && right.kind === "npm") {
    return (
      left.package === right.package &&
      left.version === right.version &&
      left.integrity === right.integrity
    )
  }
  if (left.kind === "git" && right.kind === "git") {
    return (
      left.remote === right.remote &&
      (left.commit ?? "").toLowerCase() === (right.commit ?? "").toLowerCase() &&
      normalizePath(left.pluginPath) === normalizePath(right.pluginPath)
    )
  }
  return false
}

/** Short human label for an artifact pin: `1.2.3` or a 12-character commit. */
export function formatArtifactRevision(artifact: Artifact): string {
  return artifact.kind === "npm"
    ? artifact.version
    : (artifact.commit ?? "").slice(0, 12)
}

export function getInstallationStateLabel(
  installation: InstalledPlugin,
  update: PluginUpdate | undefined
): string {
  if (installation.kind === "directory") return "Installed locally"
  if (update?.outcome === "update") {
    return update.target
      ? `Update available: ${update.target}`
      : "Update available"
  }
  if (update?.outcome === "current") return "Up to date"
  if (update?.outcome === "installed-newer") return "Newer than the registry"
  if (update?.outcome === "error") return "Update check failed"
  return "Update status unavailable"
}

export function countAvailableUpdates(
  updates: readonly Pick<PluginUpdate, "outcome">[]
): number {
  return updates.filter((update) => update.outcome === "update").length
}

export const directoryRunAutomaticUpdatesRpc = defineRpc({
  name: "directory.run-automatic-updates",
  input: z.object({}),
  output: z.object({
    outcomes: z.array(
      z.object({
        installationId: installationIdSchema,
        status: z.enum(["updated", "current", "skipped", "failed"]),
        message: z.string(),
      })
    ),
  }),
})
