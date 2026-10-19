import type { PluginTheme } from "@getpaseo/plugin";
import {
  openExternalUrl,
  useRpc,
  useSettings,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import { FlatList, Modal, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import {
  type BrowseSettings,
  BROWSE_SORTS,
  BROWSE_STATUS,
  DEFAULT_BROWSE,
  formatArtifactRevision,
  formatInstallCommand,
  isValidDirectSource,
  type MarketEntry,
  marketSettings,
} from "../shared/model";
import {
  marketDetailRpc,
  marketInstallDirectRpc,
  marketInstallRpc,
  marketUninstallRpc,
  marketUpdateRpc,
} from "../shared/rpc";
import { applyBrowse, buildRows, type EntryRow, sourceUrlMap } from "./browse-logic";
import { useCatalogQuery, useInvalidateMarket, useRefreshCatalog } from "./queries";
import { ActionButton, Badge, Chip, EmptyState, EntryIcon, SectionLabel, SPACE } from "./ui";

const SORT_LABELS: Record<(typeof BROWSE_SORTS)[number], string> = {
  popular: "最热",
  recent: "最近更新",
  "a-z": "名称",
};
const STATUS_LABELS: Record<(typeof BROWSE_STATUS)[number], string> = {
  all: "全部",
  installed: "已安装",
  updates: "可更新",
  "not-installed": "未安装",
};

const TRUST_WARNING =
  "插件是在 daemon 上运行的受信任、无沙箱代码，可访问该机器的文件、进程与凭据。仅安装你信任的来源。";

export function MarketBrowseScreen({ theme, layout }: PluginScreenProps) {
  const settings = useSettings(marketSettings);
  const catalogQuery = useCatalogQuery();
  const refresh = useRefreshCatalog();
  const invalidate = useInvalidateMarket();
  const installRpc = useRpc(marketInstallRpc);
  const installDirectRpc = useRpc(marketInstallDirectRpc);
  const uninstallRpc = useRpc(marketUninstallRpc);
  const updateRpc = useRpc(marketUpdateRpc);
  const toast = useToast();

  const [browse, setBrowse] = useState<BrowseSettings>(DEFAULT_BROWSE);
  const [seeded, setSeeded] = useState(false);
  const [selected, setSelected] = useState<EntryRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [directOpen, setDirectOpen] = useState(false);
  const [directSource, setDirectSource] = useState("");
  const [directRef, setDirectRef] = useState("");
  const [directPath, setDirectPath] = useState("");
  const [directBusy, setDirectBusy] = useState(false);

  // 设置就绪后，把持久化的浏览偏好灌进来一次。
  useEffect(() => {
    if (seeded || settings.status !== "ready") return;
    setBrowse(settings.values.browse);
    setSeeded(true);
  }, [seeded, settings]);

  const sources = settings.status === "ready" ? settings.values.sources : [];
  const catalog = catalogQuery.data;

  const rows = useMemo(() => {
    if (!catalog) return [];
    return buildRows(catalog.entries, catalog.installations, catalog.updates, sourceUrlMap(sources));
  }, [catalog, sources]);

  const visible = useMemo(() => applyBrowse(rows, browse), [rows, browse]);

  function persistBrowse(next: BrowseSettings) {
    setBrowse(next);
    if (settings.status === "ready") {
      void settings.save({ ...settings.values, browse: next }, settings.revision);
    }
  }

  async function doInstall(entry: MarketEntry): Promise<boolean> {
    setBusyId(entry.globalId);
    try {
      const result = await installRpc({
        sourceId: entry.sourceId,
        entryId: entry.id,
        expected: entry.artifact,
      });
      if (result.ok) {
        toast.show(result.message, { variant: "success" });
        invalidate();
      } else {
        toast.error(result.message);
      }
      return result.ok;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "安装失败。");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function doUninstall(installationId: string): Promise<boolean> {
    setBusyId(installationId);
    try {
      const result = await uninstallRpc({ installationId });
      if (result.ok) {
        toast.show(result.message, { variant: "success" });
        invalidate();
      } else {
        toast.error(result.message);
      }
      return result.ok;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "卸载失败。");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function doUpdate(installationId: string): Promise<void> {
    setBusyId(installationId);
    try {
      const result = await updateRpc({ installationId });
      toast.show(result.message, { variant: result.ok ? "success" : "warning" });
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败。");
    } finally {
      setBusyId(null);
    }
  }

  async function doInstallDirect(): Promise<void> {
    const source = directSource.trim();
    if (!isValidDirectSource(source)) {
      toast.error("来源格式无法识别。支持 owner/slug、git:owner/repo、npm:包@版本、Git URL 或目录路径。");
      return;
    }
    setDirectBusy(true);
    try {
      const result = await installDirectRpc({
        source,
        ref: directRef.trim() || undefined,
        path: directPath.trim() || undefined,
      });
      if (result.ok) {
        toast.show(result.message, { variant: "success" });
        invalidate();
        setDirectOpen(false);
        setDirectSource("");
        setDirectRef("");
        setDirectPath("");
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "安装失败。");
    } finally {
      setDirectBusy(false);
    }
  }

  const header = (
    <View style={{ gap: SPACE }}>
      <View style={{ flexDirection: "row", gap: SPACE, alignItems: "center", flexWrap: "wrap" }}>
        <TextInput
          value={browse.query}
          onChangeText={(text) => persistBrowse({ ...browse, query: text })}
          placeholder="搜索名称、作者或分类"
          placeholderTextColor={theme.colors.foregroundMuted}
          style={{
            flexGrow: 1,
            flexBasis: 180,
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface2,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        />
        <ActionButton
          label="直接安装"
          theme={theme}
          kind="secondary"
          onPress={() => setDirectOpen(true)}
        />
        <ActionButton
          label={refresh.isPending ? "刷新中…" : "刷新"}
          theme={theme}
          kind="secondary"
          disabled={refresh.isPending}
          onPress={() =>
            refresh.mutate(undefined, {
              onError: (error) =>
                toast.error(error instanceof Error ? error.message : "刷新失败。"),
            })
          }
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE }}>
        {(catalog?.sources ?? []).map((source) => {
          const selectedSource = browse.sourceIds.includes(source.sourceId);
          return (
            <Chip
              key={source.sourceId}
              label={`${source.name}${source.ok ? ` · ${source.count}` : " · 失败"}`}
              theme={theme}
              selected={selectedSource}
              onPress={() =>
                persistBrowse({
                  ...browse,
                  sourceIds: selectedSource
                    ? browse.sourceIds.filter((id) => id !== source.sourceId)
                    : [...browse.sourceIds, source.sourceId],
                })
              }
            />
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: SPACE, flexWrap: "wrap" }}>
        {BROWSE_STATUS.map((status) => (
          <Chip
            key={status}
            label={STATUS_LABELS[status]}
            theme={theme}
            selected={browse.status === status}
            onPress={() => persistBrowse({ ...browse, status })}
          />
        ))}
        {BROWSE_SORTS.map((sort) => (
          <Chip
            key={sort}
            label={SORT_LABELS[sort]}
            theme={theme}
            selected={browse.sort === sort}
            onPress={() => persistBrowse({ ...browse, sort })}
          />
        ))}
      </View>

      {(catalog?.sources ?? [])
        .filter((source) => !source.ok)
        .map((source) => (
          <Text key={source.sourceId} style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
            {source.name}：{source.error}
          </Text>
        ))}
      {catalog?.installationsError ? (
        <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
          读取已安装插件失败：{catalog.installationsError}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 12 : 20,
      }}
    >
      <FlatList
        data={visible}
        keyExtractor={(row) => row.entry.globalId}
        ListHeaderComponent={header}
        contentContainerStyle={{ gap: SPACE, paddingBottom: 24 }}
        ListEmptyComponent={
          <EmptyState
            theme={theme}
            text={
              catalogQuery.isLoading
                ? "正在加载插件目录…"
                : catalogQuery.isError
                  ? "加载插件目录失败。"
                  : "没有匹配的插件。"
            }
          />
        }
        renderItem={({ item }) => (
          <EntryRowCard
            row={item}
            theme={theme}
            busy={busyId === item.entry.globalId}
            onPress={() => setSelected(item)}
            onInstall={() => void doInstall(item.entry)}
            onUninstall={() => {
              const first = item.installations[0];
              if (first) void doUninstall(first.id);
            }}
            onUpdate={() => {
              const first = item.installations[0];
              if (first) void doUpdate(first.id);
            }}
          />
        )}
      />

      <PluginDetailModal
        row={selected}
        theme={theme}
        layout={layout}
        busy={busyId}
        onClose={() => setSelected(null)}
        onInstall={doInstall}
        onUninstall={doUninstall}
        onUpdate={doUpdate}
      />

      <DirectInstallModal
        open={directOpen}
        theme={theme}
        busy={directBusy}
        source={directSource}
        refValue={directRef}
        pathValue={directPath}
        onChangeSource={setDirectSource}
        onChangeRef={setDirectRef}
        onChangePath={setDirectPath}
        onClose={() => setDirectOpen(false)}
        onInstall={() => void doInstallDirect()}
      />
    </View>
  );
}

function DirectInstallModal({
  open,
  theme,
  busy,
  source,
  refValue,
  pathValue,
  onChangeSource,
  onChangeRef,
  onChangePath,
  onClose,
  onInstall,
}: {
  open: boolean;
  theme: PluginTheme;
  busy: boolean;
  source: string;
  refValue: string;
  pathValue: string;
  onChangeSource: (text: string) => void;
  onChangeRef: (text: string) => void;
  onChangePath: (text: string) => void;
  onClose: () => void;
  onInstall: () => void;
}) {
  if (!open) return null;
  const inputStyle = {
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  } as const;
  const ready = isValidDirectSource(source);
  return (
    <Modal open onOpenChange={(next) => (next ? undefined : onClose())} title="直接安装插件">
      <Modal.Content>
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            适用单个插件仓库，或目录里没有的来源。可选格式：owner/slug、host/owner/slug、git:owner/repo、
            npm:包@版本、HTTPS Git URL、绝对目录路径。
          </Text>
          <View style={{ gap: 4 }}>
            <SectionLabel text="来源" theme={theme} />
            <TextInput
              value={source}
              onChangeText={onChangeSource}
              placeholder="git:owner/repo"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>
          <View style={{ gap: 4 }}>
            <SectionLabel text="Git 引用（可选）" theme={theme} />
            <TextInput
              value={refValue}
              onChangeText={onChangeRef}
              placeholder="分支、标签或提交"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>
          <View style={{ gap: 4 }}>
            <SectionLabel text="仓库内子路径（可选）" theme={theme} />
            <TextInput
              value={pathValue}
              onChangeText={onChangePath}
              placeholder="单仓多插件时使用，如 plugins/my-plugin"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>
          <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>{TRUST_WARNING}</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <ActionButton
              label={busy ? "安装中…" : "安装"}
              theme={theme}
              disabled={busy || !ready}
              onPress={onInstall}
            />
            <ActionButton label="取消" theme={theme} kind="secondary" onPress={onClose} />
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function EntryRowCard({
  row,
  theme,
  busy,
  onPress,
  onInstall,
  onUninstall,
  onUpdate,
}: {
  row: EntryRow;
  theme: PluginTheme;
  busy: boolean;
  onPress: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onUpdate: () => void;
}) {
  const revision = formatArtifactRevision(row.entry.artifact);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.entry.name}，来自 ${row.entry.sourceName}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <EntryIcon name={row.entry.name} icon={row.entry.icon} theme={theme} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
            {row.entry.name}
          </Text>
          <Badge label={row.entry.sourceName} theme={theme} />
          {!row.entry.installable ? <Badge label="不可安装" theme={theme} tone="warning" /> : null}
        </View>
        <Text numberOfLines={2} style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          {row.entry.description || row.entry.id}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {row.entry.author ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{row.entry.author}</Text>
          ) : null}
          {revision ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{revision}</Text>
          ) : null}
          {typeof row.entry.installs === "number" ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              {row.entry.installs} 次安装
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ justifyContent: "center" }}>
        {row.hasUpdate ? (
          <ActionButton label="更新" theme={theme} disabled={busy} onPress={onUpdate} />
        ) : row.installed ? (
          <ActionButton label="卸载" theme={theme} kind="secondary" disabled={busy} onPress={onUninstall} />
        ) : (
          <ActionButton
            label="安装"
            theme={theme}
            disabled={busy || !row.entry.installable}
            onPress={onInstall}
          />
        )}
      </View>
    </Pressable>
  );
}

function PluginDetailModal({
  row,
  theme,
  layout,
  busy,
  onClose,
  onInstall,
  onUninstall,
  onUpdate,
}: {
  row: EntryRow | null;
  theme: PluginTheme;
  layout: PluginScreenProps["layout"];
  busy: string | null;
  onClose: () => void;
  onInstall: (entry: MarketEntry) => Promise<boolean>;
  onUninstall: (installationId: string) => Promise<boolean>;
  onUpdate: (installationId: string) => Promise<void>;
}) {
  const detailRpc = useRpc(marketDetailRpc);
  const [readme, setReadme] = useState("");
  const [confirming, setConfirming] = useState(false);

  const sourceId = row?.entry.sourceId;
  const entryId = row?.entry.id;
  useEffect(() => {
    setConfirming(false);
    setReadme("");
    if (!sourceId || !entryId) return;
    let active = true;
    detailRpc({ sourceId, entryId })
      .then((result) => {
        if (active) setReadme(result.readme);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sourceId, entryId, detailRpc]);

  if (!row) return null;

  const entry = row.entry;
  const installed = row.installations[0];
  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())} title={entry.name}>
      <Modal.Content>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <EntryIcon name={entry.name} icon={entry.icon} theme={theme} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>
                {entry.name}
              </Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {entry.sourceName} · {entry.id}
              </Text>
            </View>
          </View>

          {entry.description ? (
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{entry.description}</Text>
          ) : null}

          {entry.caveats.length > 0 ? (
            <View style={{ gap: 4 }}>
              <SectionLabel text="注意事项" theme={theme} />
              {entry.caveats.map((caveat) => (
                <Text key={caveat} style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
                  • {caveat}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 4 }}>
            <SectionLabel text="安装锚点" theme={theme} />
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {formatInstallCommand(entry)}
            </Text>
            {entry.repositoryUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="打开仓库"
                onPress={() => void openExternalUrl(entry.repositoryUrl ?? "")}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 12 }}>打开仓库</Text>
              </Pressable>
            ) : null}
            {entry.listingUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="查看源页面"
                onPress={() => void openExternalUrl(entry.listingUrl ?? "")}
              >
                <Text style={{ color: theme.colors.accent, fontSize: 12 }}>查看源页面</Text>
              </Pressable>
            ) : null}
          </View>

          {entry.media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {entry.media.map((url) => (
                <View
                  key={url}
                  style={{
                    width: layout.compact ? 200 : 260,
                    height: 150,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: theme.colors.surface2,
                  }}
                >
                  <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} />
                </View>
              ))}
            </ScrollView>
          ) : null}

          {readme ? (
            <View style={{ gap: 4 }}>
              <SectionLabel text="说明文档" theme={theme} />
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{readme}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {installed ? (
              <>
                <ActionButton
                  label="卸载"
                  theme={theme}
                  kind="danger"
                  disabled={busy === installed.id}
                  onPress={() => void onUninstall(installed.id).then((ok) => (ok ? onClose() : undefined))}
                />
                <ActionButton
                  label="更新"
                  theme={theme}
                  kind="secondary"
                  disabled={busy === installed.id}
                  onPress={() => void onUpdate(installed.id)}
                />
              </>
            ) : (
              <ActionButton
                label="安装"
                theme={theme}
                disabled={!entry.installable || busy === entry.globalId}
                onPress={() => setConfirming(true)}
              />
            )}
          </View>

          {confirming ? (
            <View
              style={{
                gap: 8,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.colors.statusWarning,
                backgroundColor: theme.colors.surface2,
              }}
            >
              <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>{TRUST_WARNING}</Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {formatInstallCommand(entry)}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <ActionButton
                  label="确认安装"
                  theme={theme}
                  disabled={busy === entry.globalId}
                  onPress={() => void onInstall(entry).then((ok) => (ok ? onClose() : undefined))}
                />
                <ActionButton
                  label="取消"
                  theme={theme}
                  kind="secondary"
                  onPress={() => setConfirming(false)}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal.Content>
    </Modal>
  );
}