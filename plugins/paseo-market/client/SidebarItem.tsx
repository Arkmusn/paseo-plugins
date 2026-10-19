import type { PluginSidebarItemProps } from "@getpaseo/plugin/client"
import { useRpc } from "@getpaseo/plugin/client"
import { SidebarRow } from "@getpaseo/plugin/client/ui"
import { useQuery } from "@tanstack/react-query"
import { Text, View } from "react-native"
import {
  countAvailableUpdates,
  directoryUpdateStatusRpc,
} from "../shared/directory"
import { UPDATE_STATUS_QUERY_KEY } from "./update-status"
import { radius } from "./visual"

export const DIRECTORY_SCREEN_ID = "directory"
/** Screen param that opens the shared screen on the installed list. */
export const INSTALLED_VIEW_PARAM = "view"

// The check runs `paseo plugin update --all --check` on the daemon, and this
// item mounts on every app launch, so look less often than the surface does.
const SIDEBAR_STALE_MS = 5 * 60_000

function UpdateBadge({
  count,
  failed = false,
  theme,
}: {
  count: number
  /** The check itself failed: shown as "!" so it never reads as "no updates". */
  failed?: boolean
  theme: PluginSidebarItemProps["theme"]
}) {
  return (
    <View
      style={{
        minWidth: 20,
        paddingHorizontal: 6,
        paddingVertical: 1,
        alignItems: "center",
        backgroundColor: failed
          ? theme.colors.statusDanger
          : theme.colors.accent,
        borderRadius: radius.sm,
      }}
    >
      <Text
        accessibilityLabel={
          failed
            ? "Plugin update check failed"
            : `${count} plugin ${count === 1 ? "update" : "updates"} available`
        }
        style={{
          color: failed ? theme.colors.surface0 : theme.colors.accentForeground,
          fontSize: 11,
          fontWeight: "600",
        }}
      >
        {failed ? "!" : count > 99 ? "99+" : count}
      </Text>
    </View>
  )
}

/**
 * One sidebar item covers the whole plugin: the market screen links to the
 * installed list, so the row stays active on either screen and keeps carrying
 * the update badge.
 */
export function PluginsSidebarItem({
  theme,
  currentScreen,
  openScreen,
}: PluginSidebarItemProps) {
  const listUpdateStatus = useRpc(directoryUpdateStatusRpc)
  const { data, isError } = useQuery({
    queryKey: UPDATE_STATUS_QUERY_KEY,
    queryFn: () => listUpdateStatus({}),
    staleTime: SIDEBAR_STALE_MS,
  })
  const count = data ? countAvailableUpdates(data.updates) : 0
  return (
    <SidebarRow
      icon="Store"
      active={currentScreen?.screenId === DIRECTORY_SCREEN_ID}
      onPress={() => openScreen({ screenId: DIRECTORY_SCREEN_ID })}
      trailing={
        isError ? (
          <UpdateBadge count={0} failed theme={theme} />
        ) : count > 0 ? (
          <UpdateBadge count={count} theme={theme} />
        ) : null
      }
    />
  )
}
