import type { PluginClientContext } from "@getpaseo/plugin/client"
import { DirectorySettings } from "./client/DirectorySettings"
import { registerDirectory } from "./client/register"
import { directoryAttachments } from "./shared/directory"

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(directoryAttachments)
  client.addSettingsScreen({
    id: "settings",
    title: "Plugin market",
    icon: "Settings",
    Component: DirectorySettings,
  })
  registerDirectory(client)
  client.addCommandCenterItem({
    id: "configure-directory",
    title: "Configure the plugin market",
    icon: "Settings",
    context: "global",
    onSelect({ openSettings }) {
      openSettings("settings")
    },
  })
  return () => {}
}
