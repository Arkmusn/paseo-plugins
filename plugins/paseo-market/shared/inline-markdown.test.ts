import { describe, expect, it } from "vitest"
import {
  inlineMarkdownFromPlainText,
  inlineMarkdownToPlainText,
} from "./inline-markdown"

describe("inlineMarkdownToPlainText", () => {
  it("flattens styled runs and link labels to their text", () => {
    expect(
      inlineMarkdownToPlainText([
        { type: "text", text: "A " },
        {
          type: "link",
          href: "https://paseo.sh",
          children: [
            { type: "text", text: "Paseo" },
            { type: "text", text: " docs", emphasis: true },
          ],
        },
        { type: "text", text: " plugin with " },
        { type: "text", text: "code", code: true },
      ])
    ).toBe("A Paseo docs plugin with code")
  })

  it("is empty for no nodes", () => {
    expect(inlineMarkdownToPlainText([])).toBe("")
  })
})

describe("inlineMarkdownFromPlainText", () => {
  it("wraps a string verbatim, and yields nothing for an empty one", () => {
    expect(
      inlineMarkdownFromPlainText("A [Paseo](https://paseo.sh) plugin")
    ).toEqual([{ type: "text", text: "A [Paseo](https://paseo.sh) plugin" }])
    expect(inlineMarkdownFromPlainText("")).toEqual([])
  })
})
