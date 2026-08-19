import type { AlbionFetchResponse } from "./types.ts";

export class AlbionApiError extends Error {
  public readonly status: number;
  public readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "AlbionApiError";
    this.status = status;
    this.url = url;
  }
}

export function toAlbionApiError(
  response: AlbionFetchResponse,
  url: string,
  service = "Albion Gameinfo API",
): AlbionApiError {
  const detail = response.statusText ? ` ${response.statusText}` : "";

  return new AlbionApiError(
    `${service} request failed with ${response.status}.${detail}`.trim(),
    response.status,
    url,
  );
}
