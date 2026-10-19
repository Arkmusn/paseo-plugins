import type { PluginClientContext } from "@getpaseo/plugin/client"
import { DirectorySurface } from "./DirectorySurface"
import { InstalledSurface } from "./InstalledSurface"
import {
  DIRECTORY_SCREEN_ID,
  DirectorySidebarItem,
  INSTALLED_SCREEN_ID,
  InstalledSidebarItem,
} from "./SidebarItem"

const MARKET_TITLE = "Plugin market"
const INSTALLED_TITLE = "Installed plugins"

/**
 * The market is a screen plus a sidebar header item, which carries the update
 * badge. The installed screen manages what is already on this daemon. The
 * directory screen id stays `directory` so saved sidebar order survives.
 */
export function registerDirectory(client: PluginClientContext): void {
  client.addScreen({
    id: DIRECTORY_SCREEN_ID,
    title: MARKET_TITLE,
    Component: DirectorySurface,
  })
  client.addSidebarHeaderItem({
    id: DIRECTORY_SCREEN_ID,
    title: MARKET_TITLE,
    Component: DirectorySidebarItem,
  })
  client.addScreen({
    id: INSTALLED_SCREEN_ID,
    title: INSTALLED_TITLE,
    Component: InstalledSurface,
  })
  client.addSidebarHeaderItem({
    id: INSTALLED_SCREEN_ID,
    title: INSTALLED_TITLE,
    Component: InstalledSidebarItem,
  })
  client.addCommandCenterItem({
    id: "open-directory",
    title: "Browse the plugin market",
    icon: "Store",
    context: "global",
    onSelect(context) {
      context.openScreen({ screenId: DIRECTORY_SCREEN_ID })
    },
  })
  client.addCommandCenterItem({
    id: "open-installed",
    title: "Manage installed plugins",
    icon: "PackageCheck",
    context: "global",
    onSelect(context) {
      context.openScreen({ screenId: INSTALLED_SCREEN_ID })
    },
  })
}
