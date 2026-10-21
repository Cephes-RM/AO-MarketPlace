"use client";

import { useState } from "react";

const ICON_SIZE = 64;

export function equipmentItemIconUrl(itemId: string, quality?: number): string | null {
  const id = itemId.trim();
  if (!id) return null;

  try {
    const parameters = new URLSearchParams({ size: String(ICON_SIZE * 2) });
    if (quality !== undefined && Number.isInteger(quality) && quality >= 1 && quality <= 5) {
      parameters.set("quality", String(quality));
    }
    return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?${parameters}`;
  } catch {
    return null;
  }
}

export function EquipmentItemIcon({
  itemId,
  quality,
  name,
}: {
  itemId: string;
  quality?: number;
  name: string;
}) {
  const src = equipmentItemIconUrl(itemId, quality);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const unavailable = src === null || failedSource === src;

  return (
    <span className="equipment-item-icon">
      {unavailable ? (
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M20 13h24v29L32 51 20 42Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M28 27a4 4 0 0 1 8 0c0 4-4 4-4 8m0 4v2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      ) : (
        // Native lazy loading keeps the shared component independent of Next.js.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={ICON_SIZE}
          height={ICON_SIZE}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSource(src)}
        />
      )}
    </span>
  );
}
