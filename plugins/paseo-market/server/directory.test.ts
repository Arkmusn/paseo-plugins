import { describe, expect, it } from "vitest"
import { noUpdateMessage, parseUpdateResult } from "./directory"

function output(rows: unknown): string {
  return JSON.stringify(rows)
}

describe("parseUpdateResult", () => {
  it("reports a real update", () => {
    const result = parseUpdateResult(
      output([{ id: "acme/example", outcome: "updated" }]),
      "acme/example"
    )
    expect(result).toEqual({
      ok: true,
      updated: true,
      message: "Updated acme/example.",
    })
  })

  it("reports a local directory install as nothing to download, not a failure", () => {
    const result = parseUpdateResult(
      output([{ id: "example", outcome: "local" }]),
      "example"
    )
    expect(result.ok).toBe(true)
    expect(result.updated).toBe(false)
    expect(result.message).toBe(
      "example is installed from a local directory, so there is nothing to download."
    )
  })

  it("reports current and newer-than-the-source installs as up to date", () => {
    for (const outcome of ["current", "installed-newer"]) {
      const result = parseUpdateResult(
        output([{ id: "example", outcome }]),
        "example"
      )
      expect(result).toEqual({
        ok: true,
        updated: false,
        message: "example is already up to date.",
      })
    }
  })

  it("keeps the CLI warning on a no-op result", () => {
    const result = parseUpdateResult(
      output([{ id: "example", outcome: "current", warning: "branch moved" }]),
      "example"
    )
    expect(result.message).toBe("example is already up to date. branch moved")
  })

  it("surfaces an error outcome and an unknown outcome", () => {
    expect(
      parseUpdateResult(
        output([{ id: "example", outcome: "error", error: "boom" }]),
        "example"
      )
    ).toEqual({ ok: false, message: "boom" })
    expect(
      parseUpdateResult(output([{ id: "example", outcome: "wat" }]), "example")
    ).toEqual({
      ok: false,
      message: "Update result for example is wat.",
    })
  })

  it("rejects a missing result for the requested installation", () => {
    expect(parseUpdateResult(output([]), "example")).toEqual({
      ok: false,
      message: "No update result for example.",
    })
  })
})

describe("noUpdateMessage", () => {
  it("only names the no-op outcomes", () => {
    expect(noUpdateMessage("example", "update")).toBeUndefined()
    expect(noUpdateMessage("example", "error")).toBeUndefined()
    expect(noUpdateMessage("example", "local")).toContain("local directory")
  })
})
