Plugin market is a screen inside Paseo for browsing several plugin directories at once and managing the plugins you installed from them. A sidebar item opens the market, where you can search, filter by source, category and install state, switch between plugins and themes, and open any listing to read its overview, see its screenshots and review exactly which artifact it would install. A second sidebar item opens the list of installed plugins.

Themes have their own tab, shown as a grid of screenshots. Plugins show an icon, a short description, the author and the install count reported by the directory, with a badge when you already have them installed or an update is waiting. Each listing is tagged with the source it came from, so plugins with the same name from different sources stay distinct.

## Sources

The market aggregates any number of sources into one list. Two are built in and enabled by default:

- **Paseo registry** — `https://plugins.paseo.sh`, the official Paseo registry protocol v1 (`index.json`). Listings install as `owner/slug`.
- **Paseo Cafe** — `https://paseo.cafe`, the Cafe directory API (`api/plugins`). Listings install from the npm package or Git repository they declare.

You can add your own sources in Settings, under Plugins and then Plugin market. A custom source can be either kind, or let the market auto-detect the shape from what it fetches. Every source must use HTTPS, or HTTP on localhost. The directory entry for a plugin decides what gets installed, so only use a source you trust. For a source the daemon cannot install from directly, such as one served under a path prefix, the market shows the command to run yourself instead of an install button.

If a source cannot be reached, the market keeps showing the listings from the sources that did load and reports the failure for that source.

## How it works

The daemon downloads each enabled source and caches it for five minutes. A listing's overview is fetched from the same source when you open it. Screenshots and icons are loaded by your Paseo app straight from the URLs each listing declares, which are usually GitHub or a package CDN, so those hosts see your request.

Installing, updating, enabling, disabling, reloading and uninstalling run the `paseo` command line on the daemon host. Before an install, the app shows the pinned npm version or Git commit and the repository it comes from, and you confirm. The daemon then installs exactly that reviewed artifact. If the directory moves the pin after you opened the review, the install is refused.

## Setup

Plugin market needs Paseo 0.11.0-beta.4 or later and the `paseo` command on the daemon's path.

## Capabilities and limits

- Automatic updates are on by default for every installed plugin, including Plugin market. The daemon checks 30 seconds after it starts and then every six hours, moves each plugin to its current directory pin, or to the latest release of the npm package or Git source it was installed from, and keeps going if one plugin fails. Turn them off for a single plugin from its detail page, or run the check immediately from Plugin market's settings.
- The market sidebar item shows the number of plugins with an update available.
- The installed plugins screen lists everything you installed, with enable, disable, reload, update and uninstall actions and the state each plugin reported.
- A composer attachment source lets you attach a plugin's listing to a prompt, so an agent can review it before you install.
- Plugin market stores your sources, your last search and filters, the list of plugins excluded from automatic updates and the plugins you disabled in its Paseo settings. It contacts only the sources you enabled; installs and updates fetch the artifact from npm or Git the way the `paseo` command normally does.
- Plugins installed from npm or Git before the directory existed are recognized by package name or repository, and shown as installed when they match a listing.
- Listed plugins are community submissions. They still run unsandboxed on your daemon host, so read a plugin's source before installing it.

## Fork

Plugin market is a modified fork of Paseo Cafe, licensed under the Apache License, Version 2.0. See `NOTICE` for the changes made in this fork.