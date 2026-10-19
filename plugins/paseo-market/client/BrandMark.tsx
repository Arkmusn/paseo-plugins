import { Image } from "react-native"
import { BRAND_MARK_PNG } from "../shared/brand-mark"

/**
 * The paseo.cafe mark, tinted to a theme color. Mirrors the website's inline
 * `currentColor` SVG: the plugin cannot load SVG, so it tints a monochrome
 * PNG generated from the same source (see scripts/build-icons.ts).
 */
export function BrandMark({ size, color }: { size: number; color: string }) {
  return (
    <Image
      source={{ uri: BRAND_MARK_PNG }}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, tintColor: color }}
    />
  )
}
