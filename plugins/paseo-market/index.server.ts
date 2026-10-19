import type { PluginServerContext } from "@getpaseo/plugin/server";
import { marketSettings } from "./shared/model";
import { probeInstallSupport } from "./server/cli";
import { registerMarketHandlers } from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(marketSettings);
  registerMarketHandlers(server, settings);

  // 启动时探测一次 `paseo` CLI，便于在日志里排查安装/卸载为何不可用。
  void probeInstallSupport()
    .then((available) => {
      if (available) {
        console.log("[paseo-market] paseo CLI 可用");
      } else {
        console.error(
          `[paseo-market] 无法调用 paseo CLI，安装/卸载将失败。PATH=${process.env.PATH ?? ""}`,
        );
      }
    })
    .catch((error) => {
      console.error("[paseo-market] paseo CLI 探测异常", error);
    });

  return () => {};
}