export function normalizeMobileWebUrl(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    const isLocalDevelopment =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if ((url.protocol !== "https:" && !isLocalDevelopment) || url.username || url.password) {
      return undefined;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function mobileWebHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
