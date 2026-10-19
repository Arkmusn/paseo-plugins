import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginServerContext, PluginSettings } from "@getpaseo/plugin/server";
import {
  isTrustedSourceUrl,
  isValidDirectSource,
  type MarketSource,
  marketSettings,
  SELF_INSTALLATION_ID,
  sameArtifact,
  sourceBase,
} from "../shared/model";
import {
  marketCatalogRpc,
  marketCheckSourceRpc,
  marketDetailRpc,
  marketInstallDirectRpc,
  marketInstallRpc,
  marketInstalledRpc,
  marketReloadRpc,
  marketSetEnabledRpc,
  marketUninstallRpc,
  marketUpdatesRpc,
  marketUpdateRpc,
} from "../shared/rpc";
import { buildCatalog, checkSource, fetchDetail, findEntry } from "./catalog";
import {
  checkPluginUpdates,
  commandFailureMessage,
  getUpdateStatus,
  installPluginSource,
  listInstalledPlugins,
  probeInstallSupport,
  reloadPlugin,
  removePlugin,
  setPluginEnabled,
  updatePlugin,
} from "./cli";

type Settings = PluginSettings<(typeof marketSettings)["schema"]>;

/** 跑一个可能失败的异步步骤，把错误收敛为可展示的字符串。 */
async function attempt<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: commandFailureMessage(error) };
  }
}

export function registerMarketHandlers(
  server: PluginServerContext,
  settings: Settings,
): void {
  const readSources = async (): Promise<MarketSource[]> => {
    const state = await settings.read();
    return state.status === "ready" ? state.values.sources : [];
  };
  const resolveSource = async (sourceId: string): Promise<MarketSource | undefined> => {
    return (await readSources()).find((source) => source.id === sourceId);
  };

  server.handle(marketCatalogRpc, async (input: RpcInput<typeof marketCatalogRpc>) => {
    const [catalog, installed, updates, installSupported] = await Promise.all([
      buildCatalog(await readSources(), input.force),
      attempt(listInstalledPlugins),
      attempt(() => getUpdateStatus(input.force)),
      probeInstallSupport(),
    ]);
    return {
      ...catalog,
      installSupported,
      installations: installed.value ?? [],
      installationsError: installed.error,
      updates: updates.value ?? [],
      updatesError: updates.error,
    };
  });

  server.handle(marketInstalledRpc, async () => {
    const [installed, updates, installSupported] = await Promise.all([
      attempt(listInstalledPlugins),
      attempt(checkPluginUpdates),
      probeInstallSupport(),
    ]);
    return {
      installations: installed.value ?? [],
      installationsError: installed.error,
      updates: updates.value ?? [],
      updatesError: updates.error,
      installSupported,
    };
  });

  server.handle(
    marketInstallRpc,
    async (
      input: RpcInput<typeof marketInstallRpc>,
    ): Promise<RpcOutput<typeof marketInstallRpc>> => {
      const source = await resolveSource(input.sourceId);
      if (!source) {
        return { ok: false, message: `未找到市场源 ${input.sourceId}。` };
      }
      const found = await attempt(() => findEntry(source, input.entryId));
      if (found.error) {
        return { ok: false, message: found.error };
      }
      if (!found.value) {
        return { ok: false, message: `${input.entryId} 已不在该源中。` };
      }
      const { entry, install } = found.value;
      if (!install) {
        return { ok: false, message: entry.installNote ?? "该条目不可安装。" };
      }
      // 用户确认的是一个具体产物；源上的锚点若已变动则拒绝安装。
      if (input.expected && entry.artifact && !sameArtifact(entry.artifact, input.expected)) {
        return {
          ok: false,
          message: `${input.entryId} 在源上已变动，请刷新列表后重新确认。`,
        };
      }
      const result = await attempt(() => installPluginSource(install));
      if (result.error) {
        return { ok: false, message: result.error };
      }
      return { ok: true, message: `已安装 ${entry.name}。` };
    },
  );

  server.handle(
    marketInstallDirectRpc,
    async (
      input: RpcInput<typeof marketInstallDirectRpc>,
    ): Promise<RpcOutput<typeof marketInstallDirectRpc>> => {
      const source = input.source.trim();
      if (!isValidDirectSource(source)) {
        return {
          ok: false,
          message:
            "来源格式无法识别。支持 owner/slug、host/owner/slug、git:owner/repo、npm:包@版本、HTTPS Git URL，或绝对目录路径。",
        };
      }
      const result = await attempt(() =>
        installPluginSource({ source, ref: input.ref, path: input.path }),
      );
      if (result.error) {
        return { ok: false, message: result.error };
      }
      return { ok: true, message: `已安装 ${source}。` };
    },
  );

  server.handle(
    marketUninstallRpc,
    async (
      input: RpcInput<typeof marketUninstallRpc>,
    ): Promise<RpcOutput<typeof marketUninstallRpc>> => {
      const result = await attempt(() => removePlugin(input.installationId));
      if (result.error) {
        return { ok: false, message: result.error };
      }
      return { ok: true, message: `已卸载 ${input.installationId}。` };
    },
  );

  server.handle(
    marketSetEnabledRpc,
    async (
      input: RpcInput<typeof marketSetEnabledRpc>,
    ): Promise<RpcOutput<typeof marketSetEnabledRpc>> => {
      const result = await attempt(() =>
        setPluginEnabled(input.installationId, input.enabled),
      );
      if (result.error) {
        return { ok: false, message: result.error };
      }
      return {
        ok: true,
        message: `${input.enabled ? "已启用" : "已禁用"} ${input.installationId}。`,
      };
    },
  );

  server.handle(
    marketReloadRpc,
    async (
      input: RpcInput<typeof marketReloadRpc>,
    ): Promise<RpcOutput<typeof marketReloadRpc>> => {
      const result = await attempt(() => reloadPlugin(input.installationId));
      if (result.error) {
        return { ok: false, message: result.error };
      }
      return { ok: true, message: `已重载 ${input.installationId}。` };
    },
  );

  server.handle(
    marketUpdatesRpc,
    async (_input: RpcInput<typeof marketUpdatesRpc>) => {
      const result = await attempt(checkPluginUpdates);
      return { updates: result.value ?? [], error: result.error };
    },
  );

  server.handle(
    marketUpdateRpc,
    async (
      input: RpcInput<typeof marketUpdateRpc>,
    ): Promise<RpcOutput<typeof marketUpdateRpc>> => {
      return updatePlugin(input.installationId, input.installationId === SELF_INSTALLATION_ID);
    },
  );

  server.handle(
    marketCheckSourceRpc,
    async (
      input: RpcInput<typeof marketCheckSourceRpc>,
    ): Promise<RpcOutput<typeof marketCheckSourceRpc>> => {
      if (!isTrustedSourceUrl(input.url)) {
        return {
          ok: false,
          name: "",
          count: 0,
          invalidCount: 0,
          message: "源地址必须使用 HTTPS，或 localhost 上的 HTTP。",
        };
      }
      const result = await attempt(() => checkSource(input.kind, sourceBase(input.url)));
      if (result.error || !result.value) {
        return {
          ok: false,
          name: "",
          count: 0,
          invalidCount: 0,
          message: result.error ?? "源检查失败。",
        };
      }
      return {
        ok: true,
        name: result.value.name,
        count: result.value.count,
        invalidCount: result.value.invalidCount,
        message: `可用：${result.value.name}，共 ${result.value.count} 个条目。`,
      };
    },
  );

  server.handle(marketDetailRpc, async (input: RpcInput<typeof marketDetailRpc>) => {
    const source = await resolveSource(input.sourceId);
    if (!source) {
      throw new Error(`未找到市场源 ${input.sourceId}。`);
    }
    const found = await findEntry(source, input.entryId);
    if (!found) {
      throw new Error(`${input.entryId} 已不在该源中。`);
    }
    const readme = await fetchDetail(source, input.entryId).catch(() => "");
    return { entry: found.entry, readme };
  });
}