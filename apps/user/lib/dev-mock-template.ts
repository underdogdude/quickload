/** Replace `{{token}}` in strings recursively (mock JSON templates under lib/dev-mock/payloads). */
export function applyDevMockTemplate(obj: unknown, vars: Record<string, string>): unknown {
  if (typeof obj === "string") {
    let s = obj;
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(v);
    }
    return s;
  }
  if (Array.isArray(obj)) {
    return obj.map((x) => applyDevMockTemplate(x, vars));
  }
  if (obj !== null && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = applyDevMockTemplate(v, vars);
    }
    return out;
  }
  return obj;
}
