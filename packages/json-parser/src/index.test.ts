import { describe, expect, it } from "vitest";
import parseJSON from ".";

describe("json-parser", () => {
  it("can parse {}", () => {
    expect(parseJSON("{}")).toEqual({});
  });
});
