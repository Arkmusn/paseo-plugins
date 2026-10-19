import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";

export const RADIUS = 10;
export const SPACE = 8;

export function useCardStyle(theme: PluginTheme) {
  return useMemo(
    () => ({
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: RADIUS,
      padding: 12,
      gap: 6,
    }),
    [theme],
  );
}

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: PluginTheme;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** 过滤/选项用的胶囊按钮：选中用 accent 填充，否则用 surface2。 */
export function Chip({ label, selected, onPress, theme, disabled, accessibilityLabel }: ChipProps) {
  const styles = useMemo(
    () => ({
      chip: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface2,
        opacity: disabled ? 0.5 : 1,
      },
      text: {
        color: selected ? theme.colors.accentForeground : theme.colors.foreground,
        fontSize: 13,
      },
    }),
    [theme, selected, disabled],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.chip}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  theme: PluginTheme;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function ActionButton({
  label,
  onPress,
  theme,
  kind = "primary",
  disabled = false,
  accessibilityLabel,
}: ActionButtonProps) {
  const palette = {
    primary: { bg: theme.colors.accent, fg: theme.colors.accentForeground, border: theme.colors.accent },
    secondary: { bg: theme.colors.surface2, fg: theme.colors.foreground, border: theme.colors.border },
    danger: { bg: theme.colors.surface2, fg: theme.colors.statusDanger, border: theme.colors.statusDanger },
  }[kind];
  const styles = useMemo(
    () => ({
      button: {
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: RADIUS,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        opacity: disabled ? 0.5 : 1,
      },
      text: { color: palette.fg, fontSize: 13, fontWeight: "600" as const },
    }),
    [palette, disabled],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.button}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

export function Badge({
  label,
  theme,
  tone = "neutral",
}: {
  label: string;
  theme: PluginTheme;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const color = {
    neutral: theme.colors.foregroundMuted,
    success: theme.colors.statusSuccess,
    warning: theme.colors.statusWarning,
    danger: theme.colors.statusDanger,
    accent: theme.colors.accent,
  }[tone];
  const styles = useMemo(
    () => ({
      badge: {
        borderColor: color,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 2,
        paddingHorizontal: 8,
      },
      text: { color, fontSize: 11 },
    }),
    [color],
  );
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function EntryIcon({
  name,
  icon,
  theme,
  size = 40,
}: {
  name: string;
  icon?: string;
  theme: PluginTheme;
  size?: number;
}) {
  const styles = useMemo(
    () => ({
      box: {
        width: size,
        height: size,
        borderRadius: RADIUS,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface2,
      },
      image: { width: size, height: size },
      initial: {
        color: theme.colors.foreground,
        fontSize: Math.round(size * 0.45),
        fontWeight: "600" as const,
      },
    }),
    [theme, size],
  );
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.box}>
      {icon ? (
        <Image accessible={false} source={{ uri: icon }} style={styles.image} />
      ) : (
        <Text style={styles.initial}>{initial}</Text>
      )}
    </View>
  );
}

export function SectionLabel({ text, theme }: { text: string; theme: PluginTheme }) {
  return (
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const }}>
      {text}
    </Text>
  );
}

export function EmptyState({
  text,
  theme,
  children,
}: {
  text: string;
  theme: PluginTheme;
  children?: ReactNode;
}) {
  return (
    <View style={{ padding: 24, gap: 12, alignItems: "center" as const }}>
      <Text style={{ color: theme.colors.foregroundMuted, textAlign: "center" as const }}>{text}</Text>
      {children}
    </View>
  );
}