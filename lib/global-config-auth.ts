/** 全局配置页解锁（httpOnly，仅服务端读写） */
export const GLOBAL_CONFIG_UNLOCK_COOKIE = "worksprout-global-config-unlock";

export function getExpectedGlobalConfigPassword() {
  return process.env.GLOBAL_CONFIG_PASSWORD?.trim() || "admin";
}

export function isValidGlobalConfigPassword(password: string) {
  return password === getExpectedGlobalConfigPassword();
}
