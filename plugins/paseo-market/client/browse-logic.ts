import {
  type BrowseSettings,
  findInstallations,
  type InstalledPlugin,
  type MarketEntry,
  type PluginUpdate,
  sourceBase,
} from "../shared/model";

export interface EntryRow {
  entry: MarketEntry;
  installations: InstalledPlugin[];
  update?: PluginUpdate;
  installed: boolean;
  hasUpdate: boolean;
  sourceUrl: string;
}

export function buildRows(
  entries: readonly MarketEntry[],
  installations: readonly InstalledPlugin[],
  updates: readonly PluginUpdate[],
  sourceUrlById: ReadonlyMap<string, string>,
): EntryRow[] {
  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return entries.map((entry) => {
    const sourceUrl = sourceUrlById.get(entry.sourceId) ?? "";
    const matches = sourceUrl ? findInstallations(entry, installations, sourceUrl) : [];
    const update = matches.map((item) => updatesById.get(item.id)).find((item) => item !== undefined);
    return {
      entry,
      installations: matches,
      update,
      installed: matches.length > 0,
      hasUpdate: update?.outcome === "update",
      sourceUrl,
    };
  });
}

function matchesQuery(row: EntryRow, query: string): boolean {
  if (!query) return true;
  const haystack = [
    row.entry.name,
    row.entry.id,
    row.entry.description,
    row.entry.author ?? "",
    row.entry.sourceName,
    ...row.entry.categories,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

export function filterRows(rows: readonly EntryRow[], browse: BrowseSettings): EntryRow[] {
  const query = browse.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (browse.sourceIds.length > 0 && !browse.sourceIds.includes(row.entry.sourceId)) return false;
    if (browse.categories.length > 0) {
      const has = row.entry.categories.some((category) => browse.categories.includes(category));
      if (!has) return false;
    }
    if (browse.status === "installed" && !row.installed) return false;
    if (browse.status === "not-installed" && row.installed) return false;
    if (browse.status === "updates" && !row.hasUpdate) return false;
    return matchesQuery(row, query);
  });
}

export function sortRows(rows: readonly EntryRow[], browse: BrowseSettings): EntryRow[] {
  const sorted = [...rows];
  if (browse.sort === "a-z") {
    sorted.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  } else if (browse.sort === "recent") {
    sorted.sort((a, b) => (b.entry.updatedAt ?? "").localeCompare(a.entry.updatedAt ?? ""));
  } else {
    sorted.sort((a, b) => (b.entry.installs ?? 0) - (a.entry.installs ?? 0) || a.entry.name.localeCompare(b.entry.name));
  }
  return sorted;
}

export function applyBrowse(rows: readonly EntryRow[], browse: BrowseSettings): EntryRow[] {
  return sortRows(filterRows(rows, browse), browse);
}

export function sourceUrlMap(
  sources: readonly { id: string; url: string }[],
): Map<string, string> {
  return new Map(sources.map((source) => [source.id, sourceBase(source.url)]));
}