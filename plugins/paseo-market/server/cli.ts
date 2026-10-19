import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  type InstalledPlugin,
  installedPluginSchema,
  MIN_REGISTRY_INSTALL_VERSION,
  type PluginUpdate,
  pluginUpdateSchema,
  UPDATE_OUTCOMES,
} from "../shared/model";

const execFileAsync = promisify(execFile);

const MAX_COMMAND_OUTPUT_LENGTH = 32_000;
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

/**
 * 构造 `paseo` CLI 的调用方式。daemon 子进程由打包后的 Electron 应用拉起时，
 * 会继承 `ELECTRON_RUN_AS_NODE`；把它传回 AppImage 会让 Electron 把 `plugin`
 * 当成 Node 入口，而不是派发 Paseo CLI，因此必须剔除。
 */
export function buildPaseoInvocation(
  args: readonly string[],
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  windowsVerbatimArguments: boolean;
} {
  const childEnv: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(childEnv)) {
    if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") delete childEnv[key];
  }
  if (platform !== "win32") {
    return {
      executable: "paseo",
      args: [...args],
      env: childEnv,
      windowsVerbatimArguments: false,
    };
  }
  const tokens = ["paseo", ...args].map((value) => {
    // 每个 token 单独加引号，因此它不能自行闭合该引号：不允许字面量引号与反斜杠。
    if (
      value.includes(String.fromCharCode(0)) ||
      value.includes('"') ||
      /[\\\r\n&|<>()^%!]/.test(value)
    ) {
      throw new Error("Paseo CLI 参数包含 Windows 不支持的 shell 字符");
    }
    return `"${value}"`;
  });
  return {
    executable: childEnv.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${tokens.join(" ")}"`],
    env: childEnv,
    windowsVerbatimArguments: true,
  };
}

export async function execPaseo(
  args: readonly string[],
  timeout: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  const invocation = buildPaseoInvocation(args);
  return execFileAsync(invocation.executable, invocation.args, {
    timeout,
    signal,
    env: invocation.env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    maxBuffer: 4 * 1_024 * 1_024,
  });
}

async function startDetachedPaseo(args: readonly string[]): Promise<void> {
  const invocation = buildPaseoInvocation(args);
  const child = spawn(invocation.executable, invocation.args, {
    detached: true,
    stdio: "ignore",
    env: invocation.env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
}

/** 把 CLI 失败转成给用户看的可读信息，去掉 ANSI 控制码并截断。 */
export function commandFailureMessage(error: unknown): string {
  const failure = error as {
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const details = [
    text(failure.message).split("\n")[0] ?? "",
    text(failure.stderr),
    text(failure.stdout),
  ]
    .filter((value) => value.trim().length > 0)
    .join("\n\n")
    .replace(ANSI_ESCAPE_PATTERN, "")
    .trim();
  const message = details || String(error);
  return message.length > MAX_COMMAND_OUTPUT_LENGTH
    ? `${message.slice(0, MAX_COMMAND_OUTPUT_LENGTH)}\n\n[输出已被插件市场截断]`
    : message;
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const [core, pre = ""] = value.trim().replace(/^v/, "").split("-", 2);
    const numbers = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
    while (numbers.length < 3) numbers.push(0);
    return { numbers, pre };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] - right.numbers[i];
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === "") return 1;
  if (right.pre === "") return -1;
  return left.pre < right.pre ? -1 : 1;
}

export function supportsRegistryInstall(versionText: string): boolean {
  return compareVersions(versionText.trim(), MIN_REGISTRY_INSTALL_VERSION) >= 0;
}

/** 探测 daemon 上的 `paseo` CLI 是否存在，以及是否支持从注册表安装。 */
export async function probeInstallSupport(): Promise<boolean> {
  try {
    const { stdout } = await execPaseo(["--version"], 10_000);
    return supportsRegistryInstall(stdout);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// `paseo plugin ls` 的解析

const pluginSourceIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("directory"), path: z.string() }),
  z.object({
    kind: z.literal("git"),
    remote: z.string(),
    pluginPath: z.string(),
    registry: z.object({ url: z.string(), id: z.string() }).optional(),
  }),
  z.object({
    kind: z.literal("npm"),
    packageName: z.string(),
    pluginPath: z.string(),
    registry: z.object({ url: z.string(), id: z.string() }).optional(),
  }),
]);

const paseoPluginListItemSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  status: z.enum(["running", "failed", "disabled"]),
  name: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  installation: z
    .object({
      identity: pluginSourceIdentitySchema,
      currentRevision: z.string().optional(),
    })
    .optional(),
});

/** 把一行 `paseo plugin ls --json` 归一到界面使用的形状。 */
export function normalizeInstalledPlugin(value: unknown): InstalledPlugin {
  const item = paseoPluginListItemSchema.parse(value);
  const base = {
    id: item.id,
    name: item.name,
    description: item.description,
    icon: item.icon,
    enabled: item.enabled,
    status: item.status,
  };
  const identity = item.installation?.identity;
  if (!identity || identity.kind === "directory") {
    return installedPluginSchema.parse({ ...base, kind: "directory" });
  }
  return installedPluginSchema.parse({
    ...base,
    kind: identity.kind,
    registryId: identity.registry?.id,
    registryUrl: identity.registry?.url,
    packageName: identity.kind === "npm" ? identity.packageName : undefined,
    remote: identity.kind === "git" ? identity.remote : undefined,
    pluginPath: identity.pluginPath,
    revision: item.installation?.currentRevision,
  });
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  const { stdout } = await execPaseo(["plugin", "ls", "--json"], 30_000);
  return z
    .array(z.unknown())
    .max(1_000)
    .parse(JSON.parse(stdout))
    .map(normalizeInstalledPlugin);
}

// ---------------------------------------------------------------------------
// 安装、卸载、启停、重载

export interface InstallTarget {
  source: string;
  ref?: string;
  path?: string;
}

export async function installPluginSource(target: InstallTarget): Promise<void> {
  const args = ["plugin", "add", target.source];
  if (target.ref) args.push("--ref", target.ref);
  if (target.path) args.push("--path", target.path);
  args.push("--json");
  await execPaseo(args, 180_000);
  invalidateUpdateStatusCache();
}

export async function removePlugin(installationId: string): Promise<void> {
  await execPaseo(["plugin", "remove", installationId, "--json"], 60_000);
  invalidateUpdateStatusCache();
}

export async function setPluginEnabled(
  installationId: string,
  enabled: boolean,
): Promise<void> {
  await execPaseo(
    ["plugin", enabled ? "enable" : "disable", installationId, "--json"],
    60_000,
  );
}

export async function reloadPlugin(installationId: string): Promise<void> {
  await execPaseo(["plugin", "reload", installationId, "--json"], 60_000);
}

// ---------------------------------------------------------------------------
// 更新

const updatePreviewSchema = z.object({
  id: z.string(),
  outcome: z.string(),
  target: z
    .object({
      kind: z.string(),
      version: z.string().optional(),
      commit: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export function parseUpdatePreview(stdout: string): PluginUpdate[] {
  return z
    .array(updatePreviewSchema)
    .max(1_000)
    .parse(JSON.parse(stdout))
    .map((row) => {
      const known = z.enum(UPDATE_OUTCOMES).safeParse(row.outcome);
      const target = row.target?.version ?? row.target?.commit?.slice(0, 12);
      return pluginUpdateSchema.parse({
        id: row.id,
        outcome: known.success ? known.data : "error",
        target,
        error: known.success
          ? row.error
          : `无法识别的更新结果 "${row.outcome}"`,
      });
    });
}

export async function checkPluginUpdates(): Promise<PluginUpdate[]> {
  const { stdout } = await execPaseo(
    ["plugin", "update", "--all", "--check", "--json"],
    60_000,
  );
  return parseUpdatePreview(stdout);
}

const UPDATE_STATUS_TTL_MS = 60_000;
let updateStatusCache: { expiresAt: number; value: Promise<PluginUpdate[]> } | undefined;

/** 带缓存的更新检查：目录页与已安装页共用，避免每次加载都跑一次 CLI。 */
export function getUpdateStatus(force = false): Promise<PluginUpdate[]> {
  if (!force && updateStatusCache && updateStatusCache.expiresAt > Date.now()) {
    return updateStatusCache.value;
  }
  const value = checkPluginUpdates();
  const entry = { expiresAt: Date.now() + UPDATE_STATUS_TTL_MS, value };
  updateStatusCache = entry;
  value.catch(() => {
    if (updateStatusCache === entry) updateStatusCache = undefined;
  });
  return value;
}

export function invalidateUpdateStatusCache(): void {
  updateStatusCache = undefined;
}

const updateResultSchema = z.array(
  z.object({
    id: z.string(),
    outcome: z.string(),
    error: z.string().optional(),
    warning: z.string().optional(),
  }),
);

export interface UpdateOutcome {
  ok: boolean;
  updated?: boolean;
  restarting?: boolean;
  message: string;
}

export function parseUpdateResult(stdout: string, installationId: string): UpdateOutcome {
  const [result] = updateResultSchema.parse(JSON.parse(stdout));
  if (!result) {
    return { ok: false, message: `没有 ${installationId} 的更新结果。` };
  }
  const warning = result.warning ? ` ${result.warning}` : "";
  switch (result.outcome) {
    case "updated":
      return { ok: true, updated: true, message: `已更新 ${installationId}。${warning}` };
    case "current":
    case "installed-newer":
      return { ok: true, updated: false, message: `${installationId} 已是最新。` };
    case "error":
      return { ok: false, message: result.error ?? `${installationId} 更新失败。` };
    default:
      return { ok: false, message: `${installationId} 的更新结果为 ${result.outcome}。` };
  }
}

/** 同一插件同时只允许一次更新，避免自动更新与手动点击相互竞争。 */
const pluginUpdateRuns = new Map<string, Promise<unknown>>();

export async function serializePluginUpdate<Result>(
  installationId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous = pluginUpdateRuns.get(installationId) ?? Promise.resolve();
  const run = previous.then(operation, operation);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  pluginUpdateRuns.set(installationId, settled);
  try {
    return await run;
  } finally {
    if (pluginUpdateRuns.get(installationId) === settled) {
      pluginUpdateRuns.delete(installationId);
    }
  }
}

export async function updatePlugin(
  installationId: string,
  isSelf: boolean,
): Promise<UpdateOutcome> {
  const args = ["plugin", "update", installationId, "--yes", "--json"];
  return serializePluginUpdate(installationId, async () => {
    // 本插件更新时自身进程会被停止，因此脱手运行 CLI，由界面等待重连。
    if (isSelf) {
      try {
        await startDetachedPaseo(args);
      } catch (error) {
        return { ok: false, message: commandFailureMessage(error) };
      }
      return {
        ok: true,
        restarting: true,
        message: "正在更新插件市场，完成后会自动重启。",
      };
    }
    try {
      const { stdout } = await execPaseo(args, 120_000);
      invalidateUpdateStatusCache();
      return parseUpdateResult(stdout, installationId);
    } catch (error) {
      return { ok: false, message: commandFailureMessage(error) };
    }
  });
}