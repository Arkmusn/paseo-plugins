# paseo-plugins

Arkmusn 的 Paseo 插件市场。单仓多插件，并附带一个可被 Paseo「插件市场」直接浏览的目录。

## 结构

```
index.json                     市场目录（Paseo 注册表协议 v1）
plugins/<id>.json              每个插件的详情（README），按 <owner>/<slug>.json 存放
plugins/paseo-market/          插件「插件市场」的源码
```

## 作为市场源加入

在 Paseo 里打开 **设置 → 插件市场**，添加一个源：

- 类型：`Paseo 注册表`
- 源地址：`https://raw.githubusercontent.com/Arkmusn/paseo-plugins/main`

抓取会读取 `<源地址>/index.json`。由于 raw 地址带路径，daemon 无法把它解析成 `owner/slug`，因此安装会回退到条目里写明的 Git 产物（远端 + commit + 子路径），无需额外操作。

## 现有插件

| id | 名称 | 说明 |
| --- | --- | --- |
| `Arkmusn/paseo-market` | 插件市场 | 聚合多个 Paseo 插件市场源，统一浏览、安装、卸载、启停与更新插件 |

## 新增插件

1. 把插件源码放到 `plugins/<插件-id>/`。
2. 在 `index.json` 的 `plugins` 数组里加一条，`artifact.kind` 为 `git`，写清 `remote`、`commit` 与 `pluginPath`。
3. 在 `plugins/Arkmusn/<插件-id>.json` 放该插件的 README（`{"id": "...", "readme": "..."}`）。

安装锚点使用固定 commit，便于复现；`paseo plugin update <id>` 会跟踪默认分支 HEAD。

## 安全

本目录里的插件都会在 daemon 上以受信任、无沙箱代码运行，可访问该机器的文件、进程与凭据。只添加你信任的来源。

## 版本要求

插件市场需要 Paseo 0.11.4 或更高版本。

## 许可

`plugins/paseo-market/` 是 Paseo Cafe（<https://github.com/paseo-cafe/paseo-cafe>）的修改版分支，采用 Apache License 2.0；改动说明见 `plugins/paseo-market/NOTICE`。