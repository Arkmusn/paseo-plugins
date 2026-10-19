import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { useState, type ReactNode } from "react";
import { Text, TextInput, View } from "react-native";
import {
  DEFAULT_SOURCES,
  isTrustedSourceUrl,
  type MarketSource,
  marketSettings,
  SOURCE_KIND_LABELS,
  SOURCE_KINDS,
  type SourceKind,
} from "../shared/model";
import { marketCheckSourceRpc } from "../shared/rpc";
import { ActionButton, Chip, SPACE } from "./ui";

const KIND_DESCRIPTIONS: Record<SourceKind, string> = {
  "paseo-registry":
    "Paseo 注册表协议 v1。读取 <地址>/index.json 与 <地址>/plugins/<owner>/<slug>.json；条目按 owner/slug 安装。官方源即此类型。",
  "paseo-cafe":
    "paseo.cafe 目录 API。读取 <地址>/api/plugins 与 <地址>/api/plugin/<id>.json；条目按声明的 npm 包或 Git 仓库安装。社区目录 paseo.cafe 即此类型。",
  "custom-json":
    "任意返回 JSON 的地址。自动识别上面两种形状，也接受裸数组。安装来源按条目自带的 npm/Git 声明推导。",
};

const SOURCES_INFO =
  "市场源决定浏览哪些插件目录，可同时启用多个。源地址必须使用 HTTPS，或 localhost 上的 HTTP；抓取会拒绝重定向。";

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "source";
}

function Field({
  label,
  hint,
  error,
  theme,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  theme: PluginTheme;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{hint}</Text>
      ) : null}
      {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{error}</Text> : null}
    </View>
  );
}

function TextField({
  value,
  onChangeText,
  placeholder,
  theme,
  disabled,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  theme: PluginTheme;
  disabled: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.foregroundMuted}
      editable={!disabled}
      style={{
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface2,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

export function MarketSourcesScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(marketSettings);
  const checkSource = useRpc(marketCheckSourceRpc);
  const toast = useToast();

  const [draftKind, setDraftKind] = useState<SourceKind>("paseo-registry");
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [busy, setBusy] = useState(false);

  if (settings.status === "loading") return null;
  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <SettingsSection title="插件市场源">
        <SettingsCard>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{settings.error}</Text>
          <SettingsAction label="重试" actionLabel="重新加载" onPress={settings.reload} />
          {settings.status === "invalid" ? (
            <SettingsAction
              label="恢复默认设置"
              actionLabel="重置"
              onPress={() => void settings.reset()}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  }

  const { values, revision, saving, save } = settings;

  async function persist(sources: MarketSource[]): Promise<boolean> {
    setBusy(true);
    try {
      const ok = await save({ ...values, sources }, revision);
      if (!ok) toast.error("保存市场源失败。");
      return ok;
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(kind: SourceKind, url: string) {
    if (!url.trim()) {
      toast.error("请先填写源地址。");
      return;
    }
    setBusy(true);
    try {
      const result = await checkSource({ kind, url });
      if (result.ok) toast.show(result.message, { variant: "success" });
      else toast.error(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "源检查失败。");
    } finally {
      setBusy(false);
    }
  }

  async function addSource() {
    const url = draftUrl.trim();
    if (!url) {
      toast.error("请填写源地址。");
      return;
    }
    if (!isTrustedSourceUrl(url)) {
      toast.error("源地址必须使用 HTTPS，或 localhost 上的 HTTP。");
      return;
    }
    const baseId = slugify(draftName || url);
    const used = new Set(values.sources.map((source) => source.id));
    let id = baseId;
    let suffix = 2;
    while (used.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    const next: MarketSource[] = [
      ...values.sources,
      { id, name: draftName.trim() || id, kind: draftKind, url, enabled: true },
    ];
    if (await persist(next)) {
      setDraftName("");
      setDraftUrl("");
      toast.show("已添加市场源。", { variant: "success" });
    }
  }

  const disabled = busy || saving;
  const urlError = draftUrl.trim() && !isTrustedSourceUrl(draftUrl) ? "必须是 HTTPS 或 localhost 上的 HTTP 地址。" : null;

  return (
    <SettingsSection title="插件市场源" info={SOURCES_INFO}>
      {values.sources.length === 0 ? (
        <SettingsCard>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            尚未配置任何市场源，请在下方添加，或恢复默认。
          </Text>
        </SettingsCard>
      ) : null}

      {values.sources.map((source) => (
        <SettingsCard key={source.id}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>
              {source.name || source.id}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              {SOURCE_KIND_LABELS[source.kind]} · {source.url}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: SPACE, flexWrap: "wrap" }}>
            <ActionButton
              label={source.enabled ? "禁用" : "启用"}
              theme={theme}
              kind="secondary"
              disabled={disabled}
              onPress={() =>
                void persist(
                  values.sources.map((item) =>
                    item.id === source.id ? { ...item, enabled: !item.enabled } : item,
                  ),
                )
              }
            />
            <ActionButton
              label={busy ? "测试中…" : "测试连接"}
              theme={theme}
              kind="secondary"
              disabled={busy}
              onPress={() => void testConnection(source.kind, source.url)}
            />
            <ActionButton
              label="删除"
              theme={theme}
              kind="danger"
              disabled={disabled}
              onPress={() => void persist(values.sources.filter((item) => item.id !== source.id))}
            />
          </View>
        </SettingsCard>
      ))}

      <SettingsCard>
        <Field label="类型" hint={KIND_DESCRIPTIONS[draftKind]} theme={theme}>
          <View style={{ flexDirection: "row", gap: SPACE, flexWrap: "wrap" }}>
            {SOURCE_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={SOURCE_KIND_LABELS[kind]}
                theme={theme}
                selected={draftKind === kind}
                disabled={disabled}
                onPress={() => setDraftKind(kind)}
              />
            ))}
          </View>
        </Field>

        <Field label="名称" hint="仅用于界面显示，可留空。" theme={theme}>
          <TextField
            value={draftName}
            onChangeText={setDraftName}
            placeholder="例如：公司私有源"
            theme={theme}
            disabled={disabled}
          />
        </Field>

        <Field
          label="源地址"
          hint="HTTPS，或 localhost 上的 HTTP。不要带末尾路径，除自定义 JSON 外。"
          error={urlError}
          theme={theme}
        >
          <TextField
            value={draftUrl}
            onChangeText={setDraftUrl}
            placeholder="https://example.com"
            theme={theme}
            disabled={disabled}
          />
        </Field>

        <View style={{ flexDirection: "row", gap: SPACE, flexWrap: "wrap" }}>
          <ActionButton
            label={busy ? "测试中…" : "测试该地址"}
            theme={theme}
            kind="secondary"
            disabled={busy}
            onPress={() => void testConnection(draftKind, draftUrl)}
          />
          <ActionButton
            label={busy || saving ? "添加中…" : "添加到市场源列表"}
            theme={theme}
            disabled={disabled || !draftUrl.trim()}
            onPress={() => void addSource()}
          />
        </View>
      </SettingsCard>

      <SettingsCard>
        <SettingsAction
          label="恢复内置的官方与 Cafe 源"
          actionLabel="恢复默认"
          disabled={disabled}
          onPress={() => void persist(DEFAULT_SOURCES)}
        />
      </SettingsCard>
    </SettingsSection>
  );
}