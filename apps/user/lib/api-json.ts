export async function readApiJson<T>(
  response: Response,
  fallbackMessage = "ระบบตอบกลับผิดรูปแบบ กรุณาลองใหม่อีกครั้ง",
): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
