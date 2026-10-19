import type { PluginScreenProps } from "@getpaseo/plugin/client"
import { useEffect, useState } from "react"
import { DirectorySurface } from "./DirectorySurface"
import { InstalledSurface } from "./InstalledSurface"

type PluginsView = "market" | "installed"

function viewFromParams(params: PluginScreenProps["params"]): PluginsView {
  return params.view === "installed" ? "installed" : "market"
}

/**
 * One screen for the whole plugin: the market and the installed list share it,
 * each linking to the other. A screen cannot open another screen, so the two
 * views live here; opening the screen with `params.view = "installed"` starts
 * on the installed list.
 */
export function PluginsSurface({ params, ...props }: PluginScreenProps) {
  const [view, setView] = useState<PluginsView>(() => viewFromParams(params))

  // A new params value, for example from the command center, wins over the
  // view a button switched to.
  useEffect(() => {
    setView(viewFromParams(params))
  }, [params])

  return view === "installed" ? (
    <InstalledSurface {...props} onShowMarket={() => setView("market")} />
  ) : (
    <DirectorySurface {...props} onShowInstalled={() => setView("installed")} />
  )
}
