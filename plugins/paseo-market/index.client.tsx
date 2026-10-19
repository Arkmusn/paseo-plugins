import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { MarketBrowseScreen } from "./client/browse";
import { MarketInstalledScreen } from "./client/installed";
import { MarketSourcesScreen } from "./client/sources";

const BROWSE_ID = "market";
const INSTALLED_ID = "installed";
const SOURCES_ID = "sources";

const BROWSE_TITLE = "插件市场";
const INSTALLED_TITLE = "已装插件";

function BrowseSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Store"
      active={currentScreen?.screenId === BROWSE_ID}
      onPress={() => openScreen({ screenId: BROWSE_ID })}
    />
  );
}

function InstalledSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="PackageCheck"
      active={currentScreen?.screenId === INSTALLED_ID}
      onPress={() => openScreen({ screenId: INSTALLED_ID })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: BROWSE_ID, title: BROWSE_TITLE, Component: MarketBrowseScreen });
  client.addScreen({ id: INSTALLED_ID, title: INSTALLED_TITLE, Component: MarketInstalledScreen });
  client.addSettingsScreen({
    id: SOURCES_ID,
    title: "插件市场",
    icon: "Settings",
    Component: MarketSourcesScreen,
  });

  client.addSidebarHeaderItem({ id: BROWSE_ID, title: BROWSE_TITLE, Component: BrowseSidebarItem });
  client.addSidebarHeaderItem({
    id: INSTALLED_ID,
    title: INSTALLED_TITLE,
    Component: InstalledSidebarItem,
  });

  client.addCommandCenterItem({
    id: "open-market",
    title: "打开插件市场",
    icon: "Store",
    keywords: ["plugin", "market", "marketplace", "插件", "市场", "安装"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: BROWSE_ID });
    },
  });
  client.addCommandCenterItem({
    id: "open-installed",
    title: "管理已安装插件",
    icon: "PackageCheck",
    keywords: ["plugin", "installed", "已安装", "卸载", "更新"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: INSTALLED_ID });
    },
  });
  client.addCommandCenterItem({
    id: "configure-market",
    title: "配置插件市场源",
    icon: "Settings",
    keywords: ["plugin", "source", "registry", "市场源", "注册表"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings(SOURCES_ID);
    },
  });

  return () => {};
}