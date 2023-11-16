import { describe, expect, it } from "vitest";
import parseJSON from ".";
import fs from "node:fs";
import path from "node:path";

describe("json-parser", () => {
  function test(parsedValue: any, options?: { only?: boolean }) {
    const jsonString = JSON.stringify(parsedValue);
    const itFunction = options?.only ? it.only : it;
    itFunction(`can parse - ${jsonString}`, () => {
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
      console.log("found files", fileNames);
      expect(fileNames.length).toBeGreaterThan(0);
    });

    fileNames.forEach((fileName) => {
      const filePath = path.join(standardTestsDir, fileName);
      const fileContents = fs.readFileSync(filePath, "utf8");
      // if (fileName === "fail18.json") {
      //   // JSON array depth is subjective and can be set by the parser, so ignoring this test, we assume our parser allows as much as the system allows
      //   // https://stackoverflow.com/questions/42116718/is-there-an-array-depth-limitation-in-json
      //   return;
      // }

      if (fileName.startsWith("fail")) {
        it(`can fail to parse file "${fileName}": ${fileContents}`, () => {
          expect(() => parseJSON(fileContents)).toThrow();
        });
      } else {
        it(`can parse file "${fileName}": ${fileContents}`, () => {
          expect(parseJSON(fileContents)).toEqual(JSON.parse(fileContents));
        });
      }
    });
  });
});
