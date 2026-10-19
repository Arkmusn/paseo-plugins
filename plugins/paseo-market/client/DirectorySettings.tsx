import { useRpc, useSettings } from "@getpaseo/plugin/client"
import { useToast } from "@getpaseo/plugin/client/react-native"
import type { PluginSurfaceProps } from "@getpaseo/plugin/client"
import type { PluginTheme } from "@getpaseo/plugin"
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui"
import { useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import {
  DEFAULT_SOURCES,
  directoryRunAutomaticUpdatesRpc,
  directorySettings,
  isTrustedRegistryUrl,
  type MarketSource,
  registryBase,
  SOURCE_KIND_LABELS,
  SOURCE_KINDS,
  type SourceKind,
} from "../shared/directory"
import { summarizeAutomaticUpdates } from "./update-status"

const SOURCES_INFO =
  "A market source is a browsable plugin directory. Paseo registry reads <url>/index.json; Paseo Cafe reads <url>/api/plugins; Custom JSON auto-detects either shape or a bare array. The URL must use HTTPS, or HTTP on localhost."

const KIND_HINTS: Record<SourceKind, string> = {
  "paseo-registry":
    "Paseo registry protocol v1: <url>/index.json. Entries install by owner/slug, or by their pinned npm/Git artifact.",
  "paseo-cafe":
    "paseo.cafe directory API: <url>/api/plugins. Entries install from their declared npm package or Git repository.",
  "custom-json":
    "Any JSON document; the shape is detected per source. Entries install from their declared npm/Git artifact.",
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "source"
}

function KindChips({
  theme,
  value,
  onChange,
  disabled,
}: {
  theme: PluginTheme
  value: SourceKind
  onChange: (kind: SourceKind) => void
  disabled: boolean
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {SOURCE_KINDS.map((kind) => {
        const selected = kind === value
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={SOURCE_KIND_LABELS[kind]}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(kind)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
              backgroundColor: selected
                ? theme.colors.accent
                : theme.colors.surface2,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: selected
                  ? theme.colors.accentForeground
                  : theme.colors.foreground,
                fontSize: 13,
              }}
            >
              {SOURCE_KIND_LABELS[kind]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function DirectorySettings({ theme: _theme }: PluginSurfaceProps) {
  const settings = useSettings(directorySettings)
  const runAutomaticUpdates = useRpc(directoryRunAutomaticUpdatesRpc)
  const toast = useToast()
  const [draftKind, setDraftKind] = useState<SourceKind>("paseo-registry")
  const [draftName, setDraftName] = useState("")
  const [draftUrl, setDraftUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  const sources = useMemo(
    () => (settings.status === "ready" ? settings.values.sources : []),
    [settings]
  )

  if (settings.status === "loading") return null

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <SettingsSection title="Plugin market">
        <SettingsRow label="Market sources" error={settings.error} />
        <SettingsAction
          label="Try again"
          actionLabel="Reload"
          onPress={settings.reload}
        />
        {settings.status === "invalid" ? (
          <SettingsAction
            label="Restore default settings"
            actionLabel="Reset"
            onPress={() => void settings.reset()}
          />
        ) : null}
      </SettingsSection>
    )
  }

  const { values, revision, saving, saveError, save } = settings
  const disabled = busy || saving

  async function persist(next: MarketSource[]): Promise<boolean> {
    setBusy(true)
    try {
      const ok = await save({ ...values, sources: next }, revision)
      if (!ok) toast.error("Failed to save market sources.")
      return ok
    } finally {
      setBusy(false)
    }
  }

  async function addSource() {
    const url = draftUrl.trim()
    if (!isTrustedRegistryUrl(url)) {
      toast.error("Source URL must use HTTPS, or HTTP on localhost.")
      return
    }
    const baseId = slugify(draftName || url)
    const used = new Set(values.sources.map((source) => source.id))
    let id = baseId
    let suffix = 2
    while (used.has(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }
    const next: MarketSource[] = [
      ...values.sources,
      {
        id,
        name: draftName.trim() || id,
        kind: draftKind,
        url: registryBase(url),
        enabled: true,
      },
    ]
    if (await persist(next)) {
      setDraftName("")
      setDraftUrl("")
      toast.show("Market source added.", { variant: "success" })
    }
  }

  async function runUpdatesNow() {
    setCheckingUpdates(true)
    try {
      const { outcomes } = await runAutomaticUpdates({})
      const summary = summarizeAutomaticUpdates(outcomes)
      if (summary.failed) toast.error(summary.message)
      else toast.show(summary.message, { variant: "success" })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Automatic update run failed."
      )
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <SettingsSection title="Plugin market" info={SOURCES_INFO}>
      {values.sources.length === 0 ? (
        <SettingsCard>
          <SettingsRow
            label="No market sources"
            hint="Add one below, or restore the defaults."
          />
        </SettingsCard>
      ) : null}

      {values.sources.map((source) => (
        <SettingsCard key={source.id}>
          <SettingsRow
            label={source.name || source.id}
            hint={`${SOURCE_KIND_LABELS[source.kind]} · ${source.url}`}
          />
          <SettingsAction
            label={source.enabled ? "Enabled" : "Disabled"}
            hint="Disabled sources are not fetched."
            actionLabel={source.enabled ? "Disable" : "Enable"}
            disabled={disabled}
            onPress={() =>
              void persist(
                values.sources.map((item) =>
                  item.id === source.id
                    ? { ...item, enabled: !item.enabled }
                    : item
                )
              )
            }
          />
          <SettingsAction
            label="Remove this source"
            actionLabel="Remove"
            disabled={disabled}
            onPress={() =>
              void persist(
                values.sources.filter((item) => item.id !== source.id)
              )
            }
          />
        </SettingsCard>
      ))}

      <SettingsSection title="Add a market source">
        <SettingsCard>
          <SettingsRow label="Type" hint={KIND_HINTS[draftKind]} />
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <KindChips
              theme={_theme}
              value={draftKind}
              onChange={setDraftKind}
              disabled={disabled}
            />
          </View>
          <SettingsInput
            label="Name"
            hint="Shown in the source filter. Optional."
            initialValue=""
            placeholder="e.g. Company registry"
            onChangeText={setDraftName}
            disabled={disabled}
          />
          <SettingsInput
            label="Source URL"
            hint="HTTPS, or HTTP on localhost. No trailing path, except Custom JSON."
            initialValue=""
            placeholder="https://example.com"
            onChangeText={setDraftUrl}
            disabled={disabled}
            error={saveError}
          />
          <SettingsAction
            label="Add to the market sources"
            actionLabel={busy || saving ? "Adding…" : "Add"}
            disabled={disabled}
            onPress={() => void addSource()}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsCard>
        <SettingsAction
          label="Restore the built-in registry and Cafe sources"
          actionLabel="Restore defaults"
          disabled={disabled}
          onPress={() => void persist(DEFAULT_SOURCES)}
        />
        <SettingsAction
          label="Run automatic updates now"
          hint="Installed plugins update on their own every 6 hours unless automatic updates are off for them."
          actionLabel={checkingUpdates ? "Running…" : "Run now"}
          disabled={checkingUpdates}
          onPress={() => void runUpdatesNow()}
        />
      </SettingsCard>
    </SettingsSection>
  )
}