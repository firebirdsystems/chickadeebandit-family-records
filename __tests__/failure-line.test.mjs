import { describe, it, expect } from "vitest";
import { failureLine, uploadFailureLine } from "../src/logic.js";

const err = (status, code, message = "hub text") => Object.assign(new Error(message), { status, code });
const words = { action: "save the record", thing: "record" };

describe("failureLine", () => {
  it("names a duplicate by code, or by the text as a fallback", () => {
    expect(failureLine(err(400, "UNIQUE_CONSTRAINT"), words)).toBe("That record already exists.");
    expect(failureLine(err(400, undefined, "UNIQUE constraint failed: records.id"), words)).toBe("That record already exists.");
  });

  it("says what a refusal was, not try again", () => {
    expect(failureLine(err(403), words)).toBe("You don’t have permission to save the record.");
    expect(failureLine(err(507), words)).toBe("The household’s storage is full — free up space first.");
    expect(failureLine(err(404), words)).toBe("This record has been removed.");
    expect(failureLine(err(409), words)).toBe("This record was changed by someone else — check it first.");
    expect(failureLine(err(429), words)).toBe("Too many tries — wait a minute and try again.");
  });

  it("says try again for no answer, a 5xx or another 400", () => {
    for (const e of [new TypeError("Failed to fetch"), err(400), err(500), err(503)]) {
      expect(failureLine(e, words)).toBe("Couldn’t save the record — try again.");
    }
  });

  it("never shows the hub's text, only an app-worded message", () => {
    expect(failureLine(err(409, undefined, "This record changed since you opened it."), words)).not.toContain("opened");
    expect(failureLine(Object.assign(new Error("Pick a title."), { forUser: true }), words)).toBe("Pick a title.");
  });
});

describe("uploadFailureLine", () => {
  it("gives the upload's refusals their own lines", () => {
    expect(uploadFailureLine(err(413))).toBe("That file is too large.");
    expect(uploadFailureLine(err(415))).toBe("That kind of file can’t be uploaded.");
    expect(uploadFailureLine(err(429))).toBe("Too many tries — wait a minute and try again.");
    expect(uploadFailureLine(err(507))).toBe("The household’s storage is full — free up space first.");
    expect(uploadFailureLine(err(503))).toBe("Couldn’t attach that file — try again.");
  });
});
