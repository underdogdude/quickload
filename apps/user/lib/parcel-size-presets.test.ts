import { describe, expect, it } from "vitest";
import {
  PARCEL_SIZE_PRESETS,
  PARCEL_SIZE_CUSTOM_PRESET_ID,
  findMatchingParcelSizePreset,
  formatParcelSizePresetOptionLabel,
  isParcelSizePresetWithinAppLimits,
  isCustomParcelSizePreset,
  resolveParcelSizePresetFromQuery,
  dimensionsFromParcelSizePreset,
  findParcelSizePreset,
} from "./parcel-size-presets";

describe("parcel-size-presets", () => {
  it("every preset except custom is within app dimension limits", () => {
    for (const preset of PARCEL_SIZE_PRESETS) {
      expect(isParcelSizePresetWithinAppLimits(preset)).toBe(true);
    }
  });

  it("formats box labels consistently", () => {
    const boxB = PARCEL_SIZE_PRESETS.find((preset) => preset.id === "box-b");
    expect(boxB).toBeDefined();
    expect(formatParcelSizePresetOptionLabel(boxB!)).toBe("กล่องไปรษณีย์ 17×25×9 ซม. (B)");
  });

  it("matches decimal preset dimensions", () => {
    const matched = findMatchingParcelSizePreset("9.7", "14", "6");
    expect(matched?.id).toBe("box-00");
  });

  it("includes envelope and custom options", () => {
    expect(PARCEL_SIZE_PRESETS.some((preset) => preset.id === "envelope-mail-doc")).toBe(true);
    expect(PARCEL_SIZE_PRESETS.some((preset) => isCustomParcelSizePreset(preset.id))).toBe(true);
  });
});

describe("resolveParcelSizePresetFromQuery", () => {
  const empty = () => null;
  const q = (record: Record<string, string>) => (key: string) => record[key] ?? null;

  it("returns preset id when parcelSizePreset param is a valid id", () => {
    const result = resolveParcelSizePresetFromQuery(q({ parcelSizePreset: "box-b" }), "", "", "");
    expect(result).toBe("box-b");
  });

  it("ignores invalid parcelSizePreset param and falls back to dimension match", () => {
    const result = resolveParcelSizePresetFromQuery(q({ parcelSizePreset: "BOGUS" }), "17", "25", "9");
    expect(result).toBe("box-b");
  });

  it("returns custom when dimensions are provided but match no preset", () => {
    const result = resolveParcelSizePresetFromQuery(empty, "21", "21", "21");
    expect(result).toBe(PARCEL_SIZE_CUSTOM_PRESET_ID);
  });

  it("returns empty string when no param and no dimensions given", () => {
    const result = resolveParcelSizePresetFromQuery(empty, "", "", "");
    expect(result).toBe("");
  });

  it("matches decimal box-00 from dimensions", () => {
    const result = resolveParcelSizePresetFromQuery(empty, "9.7", "14", "6");
    expect(result).toBe("box-00");
  });
});

describe("dimensionsFromParcelSizePreset", () => {
  it("returns string dimensions for a named preset", () => {
    const preset = findParcelSizePreset("box-b")!;
    const dims = dimensionsFromParcelSizePreset(preset);
    expect(dims).toEqual({ widthCm: "17", lengthCm: "25", heightCm: "9" });
  });

  it("returns null for the custom preset", () => {
    const preset = findParcelSizePreset(PARCEL_SIZE_CUSTOM_PRESET_ID)!;
    expect(dimensionsFromParcelSizePreset(preset)).toBeNull();
  });

  it("returns decimal string for box-00", () => {
    const preset = findParcelSizePreset("box-00")!;
    const dims = dimensionsFromParcelSizePreset(preset);
    expect(dims?.widthCm).toBe("9.7");
  });
});
