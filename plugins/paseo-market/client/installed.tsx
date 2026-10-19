import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { FlatList, useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  countAvailableUpdates,
  type InstalledPlugin,
  type PluginUpdate,
} from "../shared/model";
import {
  marketReloadRpc,
  marketSetEnabledRpc,
  marketUninstallRpc,
  marketUpdateRpc,
} from "../shared/rpc";
import { useInstalledQuery, useInvalidateMarket } from "./queries";
import { ActionButton, Badge, EmptyState, EntryIcon, SPACE } from "./ui";

const STATUS_LABELS: Record<InstalledPlugin["status"], string> = {
  running: "运行中",
  disabled: "已禁用",
  failed: "失败",
};

export function MarketInstalledScreen({ theme, layout }: PluginScreenProps) {
  const installedQuery = useInstalledQuery();
  const invalidate = useInvalidateMarket();
  const setEnabledRpc = useRpc(marketSetEnabledRpc);
  const reloadRpc = useRpc(marketReloadRpc);
  const uninstallRpc = useRpc(marketUninstallRpc);
  const updateRpc = useRpc(marketUpdateRpc);
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const data = installedQuery.data;
  const updatesById = useMemo(() => {
    const map = new Map<string, PluginUpdate>();
    for (const update of data?.updates ?? []) map.set(update.id, update);
    return map;
  }, [data]);
  const updateCount = countAvailableUpdates(data?.updates ?? []);

  function report(result: { ok: boolean; message: string }) {
    if (result.ok) toast.show(result.message, { variant: "success" });
    else toast.error(result.message);
    invalidate();
  }

  async function run(id: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusyId(id);
    try {
      report(await fn());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 12 : 20,
      }}
    >
      {data && !data.installSupported ? (
        <Text style={{ color: theme.colors.statusWarning, fontSize: 12, paddingBottom: SPACE }}>
          daemon 上的 `paseo` CLI 不可用或版本过低，安装/更新操作可能失败。
        </Text>
      ) : null}
      {data?.installationsError ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingBottom: SPACE }}>
          读取已安装插件失败：{data.installationsError}
        </Text>
      ) : null}

      <FlatList
        data={data?.installations ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: SPACE, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ paddingBottom: SPACE }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              共 {data?.installations.length ?? 0} 个已安装插件
              {updateCount > 0 ? ` · ${updateCount} 个可更新` : ""}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            theme={theme}
            text={installedQuery.isLoading ? "正在读取…" : "还没有安装任何插件。"}
          />
        }
        renderItem={({ item }) => {
          const update = updatesById.get(item.id);
          const hasUpdate = update?.outcome === "update";
          const busy = busyId === item.id;
          return (
            <InstalledRow
              item={item}
              theme={theme}
              hasUpdate={hasUpdate}
              busy={busy}
              onToggle={() =>
                void run(item.id, () => setEnabledRpc({ installationId: item.id, enabled: !item.enabled }))
              }
              onReload={() => void run(item.id, () => reloadRpc({ installationId: item.id }))}
              onUninstall={() => void run(item.id, () => uninstallRpc({ installationId: item.id }))}
              onUpdate={() =>
                void run(item.id, () => updateRpc({ installationId: item.id }))
              }
            />
          );
        }}
      />
    </View>
  );
}

function InstalledRow({
  item,
  theme,
  hasUpdate,
  busy,
  onToggle,
  onReload,
  onUninstall,
  onUpdate,
}: {
  item: InstalledPlugin;
  theme: PluginTheme;
  hasUpdate: boolean;
  busy: boolean;
  onToggle: () => void;
  onReload: () => void;
  onUninstall: () => void;
  onUpdate: () => void;
}) {
  const statusTone =
    item.status === "running" ? "success" : item.status === "failed" ? "danger" : "neutral";
  return (
    <View
      style={{
        gap: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <EntryIcon name={item.name ?? item.id} theme={theme} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
              {item.name ?? item.id}
            </Text>
            <Badge label={STATUS_LABELS[item.status]} theme={theme} tone={statusTone} />
            <Badge label={item.kind} theme={theme} />
            {hasUpdate ? <Badge label="可更新" theme={theme} tone="accent" /> : null}
          </View>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {item.id}
            {item.revision ? ` · ${item.revision.slice(0, 12)}` : ""}
          </Text>
          {item.registryId ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              来自市场：{item.registryId}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <ActionButton
          label={item.enabled ? "禁用" : "启用"}
          theme={theme}
          kind="secondary"
          disabled={busy}
          onPress={onToggle}
        />
        <ActionButton label="重载" theme={theme} kind="secondary" disabled={busy} onPress={onReload} />
        {hasUpdate ? (
          <ActionButton label="更新" theme={theme} disabled={busy} onPress={onUpdate} />
        ) : null}
        <ActionButton label="卸载" theme={theme} kind="danger" disabled={busy} onPress={onUninstall} />
      </View>
    </View>
  );
}