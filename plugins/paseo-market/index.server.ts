import type { PluginServerContext } from "@getpaseo/plugin/server"
import {
  getDirectoryDetail,
  installDirectoryPlugin,
  listDirectory,
  listDirectoryUpdateStatus,
  reloadDirectoryPlugin,
  runAutomaticPluginUpdates,
  searchDirectory,
  setDirectoryPluginEnabled,
  uninstallDirectoryPlugin,
  updateDirectoryPlugin,
} from "./server/directory"
import {
  DEFAULT_SOURCES,
  directoryDetailRpc,
  directoryInstallRpc,
  directoryListRpc,
  directoryReloadRpc,
  directoryRunAutomaticUpdatesRpc,
  directorySearchRpc,
  directorySetEnabledRpc,
  directorySettings,
  directoryUninstallRpc,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
  type MarketSource,
} from "./shared/directory"

interface DirectorySettingsValues {
  sources: MarketSource[]
  autoUpdateOptOuts?: string[]
}
interface DirectorySettingsReader {
  read(): Promise<
    | { status: "ready"; values: DirectorySettingsValues }
    | { status: "invalid" }
  >
}

async function readDirectorySettings(
  settings: DirectorySettingsReader | undefined
): Promise<DirectorySettingsValues | undefined> {
  if (!settings) return undefined
  try {
    const current = await settings.read()
    return current.status === "ready" ? current.values : undefined
  } catch {
    return undefined
  }
}

interface AutomaticUpdateLifecycleDependencies {
  run: typeof runAutomaticPluginUpdates
}

export default function contribute(
  server: PluginServerContext,
  dependencies: AutomaticUpdateLifecycleDependencies = {
    run: runAutomaticPluginUpdates,
  }
) {
  const settings = server.registerSettings(directorySettings)
  // Unreadable or invalid settings fall back to the built-in sources so the
  // market still shows something; a readable empty list stays empty.
  const readSources = async (): Promise<MarketSource[]> =>
    (await readDirectorySettings(settings))?.sources ?? DEFAULT_SOURCES
  let disposed = false
  const automaticUpdateAbort = new AbortController()

  const readAutomaticUpdateSettings = async () => {
    if (disposed) return undefined
    const current = await readDirectorySettings(settings)
    if (!current || disposed) return undefined
    return { autoUpdateOptOuts: current.autoUpdateOptOuts ?? [] }
  }
  const runAutomaticUpdates = () =>
    dependencies.run(
      readAutomaticUpdateSettings,
      undefined,
      automaticUpdateAbort.signal
    )

  const runScheduledAutomaticUpdates = () => {
    void runAutomaticUpdates().catch(() => undefined)
  }
  const startup = setTimeout(runScheduledAutomaticUpdates, 30_000)
  const interval = setInterval(runScheduledAutomaticUpdates, 6 * 60 * 60_000)

  server.handle(directoryListRpc, async (input) =>
    listDirectory(input, await readSources())
  )
  server.handle(directoryDetailRpc, async (input) =>
    getDirectoryDetail(input, await readSources())
  )
  server.handle(directoryUpdateStatusRpc, (input) =>
    listDirectoryUpdateStatus(input)
  )
  server.handle(directoryRunAutomaticUpdatesRpc, async () => ({
    outcomes: await runAutomaticUpdates(),
  }))
  server.handle(directorySearchRpc, async (input) =>
    searchDirectory(input, await readSources())
  )
  server.handle(directoryInstallRpc, async (input) =>
    installDirectoryPlugin(input, await readSources())
  )
  server.handle(directoryUninstallRpc, (input) =>
    uninstallDirectoryPlugin(input)
  )
  server.handle(directorySetEnabledRpc, (input) =>
    setDirectoryPluginEnabled(input)
  )
  server.handle(directoryReloadRpc, (input) => reloadDirectoryPlugin(input))
  server.handle(directoryUpdateRpc, (input) => updateDirectoryPlugin(input))
  return () => {
    disposed = true
    automaticUpdateAbort.abort()
    clearTimeout(startup)
    clearInterval(interval)
  }
}