import type { PluginSurfaceProps } from "@getpaseo/plugin/client"
import type { PluginTheme } from "@getpaseo/plugin"
import { useRpc } from "@getpaseo/plugin/client"
import { FlatList, useToast } from "@getpaseo/plugin/client/react-native"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import {
  countAvailableUpdates,
  directoryListRpc,
  directoryReloadRpc,
  directorySetEnabledRpc,
  directoryUninstallRpc,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
  type InstalledPlugin,
  type PluginUpdate,
} from "../shared/directory"
import { UPDATE_STATUS_QUERY_KEY } from "./update-status"
import { radius, space } from "./visual"

const INSTALLED_QUERY_KEY = "paseo-market-installed"

const STATUS_LABELS: Record<InstalledPlugin["status"], string> = {
  running: "Running",
  disabled: "Disabled",
  failed: "Failed",
}

function StatusPill({
  label,
  theme,
  tone,
}: {
  label: string
  theme: PluginTheme
  tone: "success" | "danger" | "neutral" | "accent"
}) {
  const color = {
    success: theme.colors.statusSuccess,
    danger: theme.colors.statusDanger,
    neutral: theme.colors.foregroundMuted,
    accent: theme.colors.accent,
  }[tone]
  return (
    <View
      style={{
        borderColor: color,
        borderWidth: 1,
        borderRadius: radius.sm,
        paddingHorizontal: 8,
        paddingVertical: 1,
      }}
    >
      <Text style={{ color, fontSize: 11 }}>{label}</Text>
    </View>
  )
}

function Action({
  label,
  theme,
  onPress,
  disabled,
  tone = "neutral",
}: {
  label: string
  theme: PluginTheme
  onPress: () => void
  disabled?: boolean
  tone?: "neutral" | "danger" | "accent"
}) {
  const color =
    tone === "danger"
      ? theme.colors.statusDanger
      : tone === "accent"
        ? theme.colors.accent
        : theme.colors.foreground
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        borderColor: tone === "neutral" ? theme.colors.border : color,
        borderWidth: 1,
        borderRadius: radius.sm,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: theme.colors.surface2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color, fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function InstalledSurface({ theme, layout }: PluginSurfaceProps) {
  const listDirectory = useRpc(directoryListRpc)
  const listUpdateStatus = useRpc(directoryUpdateStatusRpc)
  const uninstall = useRpc(directoryUninstallRpc)
  const setEnabled = useRpc(directorySetEnabledRpc)
  const reload = useRpc(directoryReloadRpc)
  const update = useRpc(directoryUpdateRpc)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)

  const installedQuery = useQuery({
    queryKey: [INSTALLED_QUERY_KEY],
    queryFn: () => listDirectory({ force: false }),
    staleTime: 30_000,
  })
  const updateStatusQuery = useQuery({
    queryKey: UPDATE_STATUS_QUERY_KEY,
    queryFn: () => listUpdateStatus({ force: true }),
    staleTime: 60_000,
  })

  const updates = new Map(
    (updateStatusQuery.data?.updates ?? []).map((entry) => [entry.id, entry])
  )
  const installations = installedQuery.data?.installations ?? []
  const updateCount = countAvailableUpdates(updateStatusQuery.data?.updates ?? [])

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [INSTALLED_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY }),
    ])
  }

  const run = async (
    id: string,
    operation: () => Promise<{ ok: boolean; message: string }>
  ) => {
    setBusyId(id)
    try {
      const result = await operation()
      if (result.ok) toast.show(result.message, { variant: "success" })
      else toast.error(result.message)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 16 : 24,
      }}
    >
      {installedQuery.data && !installedQuery.data.installSupported ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: theme.colors.statusWarning,
            fontSize: 12,
            paddingBottom: space.sm,
          }}
        >
          The `paseo` CLI on the daemon is unavailable or too old; install,
          uninstall, and update may fail.
        </Text>
      ) : null}

      <FlatList
        data={installations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: space.sm, paddingBottom: 24 }}
        ListHeaderComponent={
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 12,
              paddingBottom: space.sm,
            }}
          >
            {installations.length} installed
            {updateCount > 0 ? ` · ${updateCount} update${updateCount === 1 ? "" : "s"} available` : ""}
          </Text>
        }
        ListEmptyComponent={
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              textAlign: "center",
              padding: space.lg,
            }}
          >
            {installedQuery.isLoading
              ? "Reading installed plugins…"
              : installedQuery.isError
                ? "Couldn't read installed plugins."
                : "No plugins are installed yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <InstalledRow
            item={item}
            update={updates.get(item.id)}
            theme={theme}
            busy={busyId === item.id}
            onToggle={() =>
              void run(item.id, () =>
                setEnabled({ installationId: item.id, enabled: !item.enabled })
              )
            }
            onReload={() =>
              void run(item.id, () => reload({ installationId: item.id }))
            }
            onUninstall={() =>
              void run(item.id, () => uninstall({ installationId: item.id }))
            }
            onUpdate={() =>
              void run(item.id, () => update({ installationId: item.id }))
            }
          />
        )}
      />
    </View>
  )
}

function InstalledRow({
  item,
  update,
  theme,
  busy,
  onToggle,
  onReload,
  onUninstall,
  onUpdate,
}: {
  item: InstalledPlugin
  update?: PluginUpdate
  theme: PluginTheme
  busy: boolean
  onToggle: () => void
  onReload: () => void
  onUninstall: () => void
  onUpdate: () => void
}) {
  const hasUpdate = update?.outcome === "update"
  const statusTone =
    item.status === "running"
      ? "success"
      : item.status === "failed"
        ? "danger"
        : "neutral"
  return (
    <View
      style={{
        gap: space.sm,
        padding: space.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
            {item.id}
          </Text>
          <StatusPill label={STATUS_LABELS[item.status]} theme={theme} tone={statusTone} />
          <StatusPill label={item.kind} theme={theme} tone="neutral" />
          {hasUpdate ? <StatusPill label="Update available" theme={theme} tone="accent" /> : null}
        </View>
        {item.revision ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {item.revision.slice(0, 12)}
          </Text>
        ) : null}
        {item.registryId ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            From the market: {item.registryId}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Action label={item.enabled ? "Disable" : "Enable"} theme={theme} onPress={onToggle} disabled={busy} />
        <Action label="Reload" theme={theme} onPress={onReload} disabled={busy} />
        {hasUpdate ? (
          <Action label="Update" theme={theme} tone="accent" onPress={onUpdate} disabled={busy} />
        ) : null}
        <Action label="Uninstall" theme={theme} tone="danger" onPress={onUninstall} disabled={busy} />
      </View>
    </View>
  )
}