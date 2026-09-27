import { describe, expect, test } from "bun:test";
import { parseMedicationNames } from "../../src/lib/rx-parse";

describe("parseMedicationNames()", () => {
  test("strict MEDICATIONS: line (semicolon-separated)", () => {
    const out = parseMedicationNames(
      "MEDICATIONS: Panadol Extra; Augmentin; Ventolin inhaler\nDOSAGES: 500mg; 1g; as needed\nNOTES: 7 days",
    );
    expect(out).toEqual(["Panadol Extra", "Augmentin", "Ventolin inhaler"]);
  });

  test("strict line with commas and numbering noise", () => {
    const out = parseMedicationNames(
      "MEDICATIONS: 1. Panadol Extra, 2. Concor 5mg",
    );
    expect(out).toEqual(["Panadol Extra", "Concor 5mg"]);
  });

  test("narrative markdown-bold output (kilo omni style)", () => {
    const out = parseMedicationNames(
      "Based on the image provided, here are the medicines:\n\n1. **Panadol Extra**: 500mg — 1 tab every 8h\n2. **Augmentin**: 1g — twice daily, 7 days\n3. **Ventolin inhaler**: as needed",
    );
    expect(out).toEqual(["Panadol Extra", "Augmentin", "Ventolin inhaler"]);
  });

  test("numbered plain lines without bold (loose #2)", () => {
    const out = parseMedicationNames(
      "The prescription contains:\n1. Panadol Extra: 500mg\n2. Augmentin: 1g",
    );
    expect(out).toEqual(["Panadol Extra", "Augmentin"]);
  });

  test("safety-classifier garbage yields no medications", () => {
    const out = parseMedicationNames("User Safety: safe\nResponse Safety: safe");
    expect(out).toEqual([]);
  });

  test("empty input", () => {
    expect(parseMedicationNames("")).toEqual([]);
  });
});
