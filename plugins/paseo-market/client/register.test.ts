import type { PluginClientContext } from "@getpaseo/plugin/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("./PluginsSurface", () => ({ PluginsSurface: () => null }))
vi.mock("./SidebarItem", () => ({
  DIRECTORY_SCREEN_ID: "directory",
  INSTALLED_VIEW_PARAM: "view",
  PluginsSidebarItem: () => null,
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
  it("registers one Plugins screen and one sidebar item that can carry the badge", () => {
    const { client, addScreen, addSidebarHeaderItem } = fakeClient()
    registerDirectory(client)
    expect(addScreen).toHaveBeenCalledTimes(1)
    expect(addScreen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "directory", title: "Plugins" })
    )
    expect(addSidebarHeaderItem).toHaveBeenCalledTimes(1)
    expect(addSidebarHeaderItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "directory", title: "Plugins" })
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

  it("opens the same screen on the installed list from the command center", () => {
    const { client, addCommandCenterItem } = fakeClient()
    registerDirectory(client)
    const [{ onSelect }] = addCommandCenterItem.mock.calls[1] as [
      { onSelect(context: unknown): void },
    ]
    const openScreen = vi.fn()
    onSelect({ openScreen })
    expect(openScreen).toHaveBeenCalledWith({
      screenId: "directory",
      params: { view: "installed" },
    })
  })
})
