import type { PluginClientContext } from "@getpaseo/plugin/client"
import { PluginsSurface } from "./PluginsSurface"
import {
  DIRECTORY_SCREEN_ID,
  INSTALLED_VIEW_PARAM,
  PluginsSidebarItem,
} from "./SidebarItem"

const PLUGINS_TITLE = "Plugins"

/**
 * One screen and one sidebar item for the whole plugin: the market and the
 * installed list swap inside the screen, and the sidebar item carries the
 * update badge. The screen id stays `directory` so saved sidebar order
 * survives.
 */
export function registerDirectory(client: PluginClientContext): void {
  client.addScreen({
    id: DIRECTORY_SCREEN_ID,
    title: PLUGINS_TITLE,
    Component: PluginsSurface,
  })
  client.addSidebarHeaderItem({
    id: DIRECTORY_SCREEN_ID,
    title: PLUGINS_TITLE,
    Component: PluginsSidebarItem,
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
      context.openScreen({
        screenId: DIRECTORY_SCREEN_ID,
        params: { [INSTALLED_VIEW_PARAM]: "installed" },
      })
    },
  })
}
