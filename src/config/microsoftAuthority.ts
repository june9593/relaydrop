export const MICROSOFT_CONSUMERS_AUTHORITY =
  "https://login.microsoftonline.com/consumers";

export function normalizeMicrosoftAuthority(
  value: string | undefined
): string | undefined {
  const candidate = value?.trim() || MICROSOFT_CONSUMERS_AUTHORITY;

  try {
    const url = new URL(candidate);
    const path = url.pathname.replace(/\/+$/, "");
    if (
      url.protocol !== "https:" ||
      url.hostname !== "login.microsoftonline.com" ||
      path !== "/consumers" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return MICROSOFT_CONSUMERS_AUTHORITY;
  } catch {
    return undefined;
  }
}
