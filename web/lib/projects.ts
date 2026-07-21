export function buildTinkrLaunchUrl(sourceUrl: string, projectId: string) {
  return buildTinkrSourceUrl(sourceUrl, "tinkr_project", projectId);
}

export function buildTinkrImportUrl(sourceUrl: string, token: string) {
  return buildTinkrSourceUrl(sourceUrl, "tinkr_import", token);
}

function buildTinkrSourceUrl(sourceUrl: string, key: string, value: string) {
  const url = new URL(sourceUrl);
  url.searchParams.set(key, value);
  return url.toString();
}

export function canLaunchInTinkr(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
