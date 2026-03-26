/** 从自定义 auth cookie 中解析 access_token（供 Route Handler 使用） */
export function parseAccessTokenFromAuthCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const data = JSON.parse(decoded) as Record<string, unknown>;
    if (typeof data.access_token === "string" && data.access_token.length > 0) {
      return data.access_token;
    }
    const nested = data as { currentSession?: { access_token?: string } };
    if (typeof nested.currentSession?.access_token === "string" && nested.currentSession.access_token.length > 0) {
      return nested.currentSession.access_token;
    }
    return null;
  } catch {
    return null;
  }
}
