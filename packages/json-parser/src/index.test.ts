import { describe, expect, it } from "vitest";
import parseJSON from ".";
import fs from "node:fs";
import path from "node:path";

describe("json-parser", () => {
  function test(parsedValue: any, options?: { only?: boolean }) {
    const jsonString = JSON.stringify(parsedValue);
    const testIt = options?.only ? it.only : it;
    testIt(`can parse - ${jsonString}`, () => {
      expect(parseJSON(jsonString)).toEqual(parsedValue);
    });
  }

  test({});

  test({ key: "value" });

  test({
    key1: true,
    key2: false,
    key3: null,
    key4: "value",
    key5: 101,
  });

  test({
    key: "value",
    "key-n": 101,
    "key-o": {},
    "key-l": [],
  });

  test([["foo"]]);

  // eslint-disable-next-line
  test({ key: `\"` });

  describe("standard tests", () => {
    const standardTestsDir = path.join(__dirname, "../standard-test-data");
    const fileNames = fs.readdirSync(standardTestsDir);

    it("has files", () => {
      expect(fileNames.length).toBeGreaterThan(10);
    });

    fileNames.forEach((fileName) => {
      const filePath = path.join(standardTestsDir, fileName);
      const fileContents = fs.readFileSync(filePath, "utf8");
      if (fileName.startsWith("fail")) {
        it(`fails to parse file "${fileName}"`, () => {
          expect(
            () => parseJSON(fileContents),
            `fails to parse file "${fileName}": ${fileContents}`,
          ).toThrow();
        });
      } else {
        it(`can parse file "${fileName}"`, () => {
          expect(parseJSON(fileContents), `can parse file "${fileName}": ${fileContents}`).toEqual(
            JSON.parse(fileContents),
          );
        });
      }
    });
  });
});
