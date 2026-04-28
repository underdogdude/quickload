import fs from "node:fs";
import path from "node:path";

/** JSON files under `lib/dev-mock/payloads/<key>.json` (cwd = apps/user). */
export function loadDevMockPayload(key: string): unknown | null {
  const dir = path.join(process.cwd(), "lib/dev-mock/payloads");
  const file = path.join(dir, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}
