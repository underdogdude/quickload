import {
  MAX_PARCEL_DIMENSIONS_SUM_CM,
  MAX_PARCEL_SIDE_CM,
  validateParcelDimensionsCm,
} from "@/lib/parcel-dimensions";

export const PARCEL_SIZE_CUSTOM_PRESET_ID = "custom";

export const SELECT_PARCEL_SIZE_ERROR = "กรุณาเลือกขนาดพัสดุ";

export type ParcelSizePreset = {
  id: string;
  label: string;
  widthCm?: number;
  lengthCm?: number;
  heightCm?: number;
};

function formatCm(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function boxPreset(
  id: string,
  widthCm: number,
  lengthCm: number,
  heightCm: number,
  code: string,
): ParcelSizePreset {
  return {
    id,
    label: `กล่องไปรษณีย์ ${formatCm(widthCm)}×${formatCm(lengthCm)}×${formatCm(heightCm)} ซม. (${code})`,
    widthCm,
    lengthCm,
    heightCm,
  };
}

/** Thailand Post parcel size options within app limits (≤60 cm per side, sum ≤120 cm). */
const PARCEL_SIZE_PRESET_DEFINITIONS: readonly ParcelSizePreset[] = [
  {
    id: "envelope-mail-doc",
    label: "ซองจดหมายและซองเอกสาร",
    widthCm: 32,
    lengthCm: 23,
    heightCm: 2,
  },
  boxPreset("box-00", 9.7, 14, 6, "00"),
  boxPreset("box-0", 11, 17, 6, "0"),
  boxPreset("box-0-plus-4", 11, 17, 10, "0+4"),
  boxPreset("box-a", 14, 20, 6, "A"),
  boxPreset("box-aa", 13, 17, 7, "AA"),
  boxPreset("box-2a", 14, 20, 12, "2A"),
  boxPreset("box-b", 17, 25, 9, "B"),
  boxPreset("box-2b", 17, 25, 18, "2B"),
  boxPreset("box-c", 20, 30, 11, "C"),
  boxPreset("box-c-plus-8", 20, 30, 19, "C+8"),
  boxPreset("box-2c", 20, 30, 22, "2C"),
  boxPreset("box-d", 22, 35, 14, "D"),
  boxPreset("box-e", 24, 40, 17, "E"),
  boxPreset("box-f", 30, 45, 20, "F"),
  boxPreset("box-chor", 30, 45, 22, "ฉ"),
  boxPreset("box-g", 31, 36, 26, "G"),
  boxPreset("box-h", 40, 45, 35, "H"),
  { id: PARCEL_SIZE_CUSTOM_PRESET_ID, label: "ระบุเอง" },
];

export function isParcelSizePresetWithinAppLimits(preset: ParcelSizePreset): boolean {
  if (isCustomParcelSizePreset(preset.id)) return true;
  if (preset.widthCm == null || preset.lengthCm == null || preset.heightCm == null) return false;
  return (
    validateParcelDimensionsCm({
      widthCm: preset.widthCm,
      lengthCm: preset.lengthCm,
      heightCm: preset.heightCm,
    }) === null
  );
}

function assertPresetsWithinAppLimits(presets: readonly ParcelSizePreset[]): void {
  const invalid = presets.filter((preset) => !isParcelSizePresetWithinAppLimits(preset));
  if (invalid.length === 0) return;

  const details = invalid
    .map((preset) => {
      const dims =
        preset.widthCm != null && preset.lengthCm != null && preset.heightCm != null
          ? `${preset.widthCm}×${preset.lengthCm}×${preset.heightCm} ซม.`
          : "ไม่มีขนาด";
      return `${preset.label} (${dims})`;
    })
    .join("; ");

  throw new Error(
    `Parcel size preset exceeds app limits (ด้านละ ≤${MAX_PARCEL_SIDE_CM} ซม., รวม ≤${MAX_PARCEL_DIMENSIONS_SUM_CM} ซม.): ${details}`,
  );
}

assertPresetsWithinAppLimits(PARCEL_SIZE_PRESET_DEFINITIONS);

export const PARCEL_SIZE_PRESETS: readonly ParcelSizePreset[] = PARCEL_SIZE_PRESET_DEFINITIONS;

export type ParcelSizePresetId = (typeof PARCEL_SIZE_PRESETS)[number]["id"];

const PRESET_BY_ID = new Map(PARCEL_SIZE_PRESETS.map((preset) => [preset.id, preset]));

export function isParcelSizePresetId(value: string): value is ParcelSizePresetId {
  return PRESET_BY_ID.has(value);
}

export function findParcelSizePreset(id: string): ParcelSizePreset | undefined {
  return PRESET_BY_ID.get(id);
}

export function isCustomParcelSizePreset(id: string): boolean {
  return id === PARCEL_SIZE_CUSTOM_PRESET_ID;
}

export function formatParcelSizePresetOptionLabel(preset: ParcelSizePreset): string {
  return preset.label;
}

function dimensionsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export function findMatchingParcelSizePreset(
  widthCm: string,
  lengthCm: string,
  heightCm: string,
): ParcelSizePreset | undefined {
  const width = Number(widthCm);
  const length = Number(lengthCm);
  const height = Number(heightCm);
  if (!Number.isFinite(width) || !Number.isFinite(length) || !Number.isFinite(height)) return undefined;

  return PARCEL_SIZE_PRESETS.find(
    (preset) =>
      !isCustomParcelSizePreset(preset.id) &&
      preset.widthCm != null &&
      preset.lengthCm != null &&
      preset.heightCm != null &&
      dimensionsMatch(preset.widthCm, width) &&
      dimensionsMatch(preset.lengthCm, length) &&
      dimensionsMatch(preset.heightCm, height),
  );
}

export function resolveParcelSizePresetFromQuery(
  get: (key: string) => string | null,
  widthCm: string,
  lengthCm: string,
  heightCm: string,
): string {
  const fromQuery = get("parcelSizePreset");
  if (fromQuery && isParcelSizePresetId(fromQuery)) return fromQuery;

  const matched = findMatchingParcelSizePreset(widthCm, lengthCm, heightCm);
  if (matched) return matched.id;

  if (widthCm.trim() || lengthCm.trim() || heightCm.trim()) {
    return PARCEL_SIZE_CUSTOM_PRESET_ID;
  }

  return "";
}

export function dimensionsFromParcelSizePreset(preset: ParcelSizePreset): {
  widthCm: string;
  lengthCm: string;
  heightCm: string;
} | null {
  if (isCustomParcelSizePreset(preset.id)) return null;
  if (preset.widthCm == null || preset.lengthCm == null || preset.heightCm == null) return null;
  return {
    widthCm: formatCm(preset.widthCm),
    lengthCm: formatCm(preset.lengthCm),
    heightCm: formatCm(preset.heightCm),
  };
}
