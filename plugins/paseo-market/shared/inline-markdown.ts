/**
 * The rendered form of the inline markdown authors put in catalog text —
 * plugin descriptions and registry caveats are full of
 * `[Paseo](https://paseo.sh)`, `**bold**`, and `` `code` ``.
 *
 * Nobody parses markdown at render time. The catalog scan
 * (scripts/scan.ts) runs the source through remark once, in
 * src/lib/inline-markdown.ts, and projects it onto this small allowlisted
 * model; the model is what the generated catalog and the /api/plugins
 * response carry. The paseo.cafe website
 * (src/components/inline-markdown.tsx) and this Paseo plugin
 * (../client/InlineMarkdown.tsx) then render identical nodes with their
 * own primitives, and neither ships a markdown parser. Like ./catalog.ts
 * this module stays free of React, the Paseo SDK, Zod, DOM globals, and
 * Node APIs so both sides can import it directly.
 */

export interface InlineMarkdownTextNode {
  type: "text"
  /** Visible text; markdown syntax is already gone. */
  text: string
  code?: boolean
  strong?: boolean
  emphasis?: boolean
}

/**
 * One link, however many styled runs its label holds — so a renderer emits
 * a single anchor (or a single press target) per link rather than one per
 * run, which would multiply tab stops and screen-reader announcements.
 * `href` is always an absolute `http(s)` URL with a host or a non-empty
 * `mailto:` address; both the scan and directory consumer validate it.
 */
export interface InlineMarkdownLinkNode {
  type: "link"
  href: string
  children: InlineMarkdownTextNode[]
}

export type InlineMarkdownNode = InlineMarkdownTextNode | InlineMarkdownLinkNode

const INVISIBLE_INLINE_TEXT = /[\p{White_Space}\p{Cc}\p{Cf}]/gu

/** Whether text contains something visible enough to label an interactive link. */
export function hasVisibleInlineText(text: string): boolean {
  return text.replace(INVISIBLE_INLINE_TEXT, "").length > 0
}

/** The destination an inline link may carry, or nothing when it is unsafe. */
export function safeInlineHref(value: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return undefined
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return parsed.hostname ? value : undefined
  }
  if (parsed.protocol !== "mailto:") return undefined

  try {
    return hasVisibleInlineText(decodeURIComponent(parsed.pathname))
      ? value
      : undefined
  } catch {
    return undefined
  }
}

/** The nodes' text with no formatting, for surfaces that can't show any. */
export function inlineMarkdownToPlainText(
  nodes: readonly InlineMarkdownNode[]
): string {
  return nodes
    .map((node) =>
      node.type === "link"
        ? inlineMarkdownToPlainText(node.children)
        : node.text
    )
    .join("")
}

/**
 * Plain text as nodes, for a catalog that predates the model — an older
 * paseo.cafe deployment, or a staging build — where only the raw string
 * exists. It renders verbatim, exactly as it did before the model existed.
 */
export function inlineMarkdownFromPlainText(
  text: string
): InlineMarkdownNode[] {
  return text ? [{ type: "text", text }] : []
}
