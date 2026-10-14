import { describe, it, expect } from "vitest";
import { childInfoLanded, outcomeUnknown } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);

describe("outcomeUnknown", () => {
  it("is unknown with no status, a 400, or a 5xx other than 507", () => {
    for (const e of [new TypeError("Failed to fetch"), err({ status: 0 }), err({ status: 200 }), err({ status: 400 }), err({ status: 500 }), err({ status: 503 })]) {
      expect(outcomeUnknown(e)).toBe(true);
    }
  });
  it("is unknown for a UNIQUE_CONSTRAINT answer, which a retry of a landed create gets", () => {
    expect(outcomeUnknown(err({ code: "UNIQUE_CONSTRAINT" }))).toBe(true);
    expect(outcomeUnknown(err({}, "UNIQUE constraint failed: t.id"))).toBe(true);
  });
  it("is a known refusal for any other 4xx and for 507", () => {
    for (const status of [403, 404, 409, 413, 415, 429, 507]) expect(outcomeUnknown(err({ status }))).toBe(false);
  });
});

describe("childInfoLanded", () => {
  it("finds a new card this member stored, and a replace one version on", () => {
    expect(childInfoLanded({ version: 1, updated_by: "me" }, 0, "me")).toBe(true);
    expect(childInfoLanded({ version: 4, updated_by: "me" }, 3, "me")).toBe(true);
  });
  it("is not ours when the replace never landed", () => {
    expect(childInfoLanded({ version: 3, updated_by: "me" }, 3, "me")).toBe(false);
    expect(childInfoLanded(null, 0, "me")).toBe(false);
  });
  it("is not ours when another adult wrote the card, or wrote over ours since", () => {
    expect(childInfoLanded({ version: 1, updated_by: "other" }, 0, "me")).toBe(false);
    expect(childInfoLanded({ version: 5, updated_by: "me" }, 3, "me")).toBe(false);
    expect(childInfoLanded({ version: 1, updated_by: null }, 0, null)).toBe(false);
  });
});
