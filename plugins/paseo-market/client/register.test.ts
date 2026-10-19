import type { PluginClientContext } from "@getpaseo/plugin/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("./DirectorySurface", () => ({ DirectorySurface: () => null }))
vi.mock("./InstalledSurface", () => ({ InstalledSurface: () => null }))
vi.mock("./SidebarItem", () => ({
  DIRECTORY_SCREEN_ID: "directory",
  INSTALLED_SCREEN_ID: "installed",
  DirectorySidebarItem: () => null,
  InstalledSidebarItem: () => null,
}))

import { registerDirectory } from "./register"

function fakeClient() {
  const client = {
    addScreen: vi.fn(),
    addSidebarHeaderItem: vi.fn(),
    addCommandCenterItem: vi.fn(),
  }
  return {
    client: client as unknown as PluginClientContext,
    ...client,
  }
}

describe("registerDirectory", () => {
  it("registers the market screen and a sidebar header item that can carry the badge", () => {
    const { client, addScreen, addSidebarHeaderItem } = fakeClient()
    registerDirectory(client)
    expect(addScreen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "directory", title: "Plugin market" })
    )
    expect(addSidebarHeaderItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "directory", title: "Plugin market" })
    )
  })

  it("registers the installed plugins screen and its sidebar item", () => {
    const { client, addScreen, addSidebarHeaderItem } = fakeClient()
    registerDirectory(client)
    expect(addScreen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "installed", title: "Installed plugins" })
    )
    expect(addSidebarHeaderItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "installed", title: "Installed plugins" })
    )
  })

  it("opens the market screen from the command center", () => {
    const { client, addCommandCenterItem } = fakeClient()
    registerDirectory(client)
    const [{ onSelect }] = addCommandCenterItem.mock.calls[0] as [
      { onSelect(context: unknown): void },
    ]
    const openScreen = vi.fn()
    onSelect({ openScreen })
    expect(openScreen).toHaveBeenCalledWith({ screenId: "directory" })
  })

  it("opens the installed screen from the command center", () => {
    const { client, addCommandCenterItem } = fakeClient()
    registerDirectory(client)
    const [{ onSelect }] = addCommandCenterItem.mock.calls[1] as [
      { onSelect(context: unknown): void },
    ]
    const openScreen = vi.fn()
    onSelect({ openScreen })
    expect(openScreen).toHaveBeenCalledWith({ screenId: "installed" })
  })
})
