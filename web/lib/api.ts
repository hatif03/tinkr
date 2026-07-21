const API = process.env.NEXT_PUBLIC_TINKR_API_URL || "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {})
      },
      cache: "no-store"
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("tinkr cloud could not be reached.", 0, "network_unavailable");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      typeof data.error === "string" ? data.error : "Request failed",
      response.status,
      typeof data.code === "string" ? data.code : undefined
    );
  }
  return data;
}

export function isSessionError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.code === "session_expired");
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 0) return "tinkr cloud is unavailable. Check your connection and try again.";
  if (error.status === 401) return "Your session has expired. Sign in again to continue.";
  if (error.status === 403) return "You no longer have access to this project.";
  if (error.status === 404) return "This project is no longer available.";
  if (error.status === 409) return "This project changed elsewhere. Refresh before continuing.";
  if (error.status === 413) return "This project is too large to save. Remove unused assets and try again.";
  return error.message || fallback;
}

export { API as TINKR_API_URL };
