"use client";

import { useState } from "react";

import type { EntitledGuide } from "@/lib/access";

type DownloadGuideListProps = {
  guides: EntitledGuide[];
  token: string;
};

type DownloadState = "idle" | "loading" | "error";

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes < 1) {
    return "File size available after download starts";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileType(mediaType: string) {
  if (mediaType === "application/pdf") {
    return "PDF";
  }

  if (mediaType === "application/zip") {
    return "ZIP archive";
  }

  if (mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return "Excel workbook";
  }

  return "Download file";
}

export function DownloadGuideList({ guides, token }: DownloadGuideListProps) {
  const [states, setStates] = useState<Record<string, DownloadState>>({});
  const [error, setError] = useState<string | null>(null);

  async function requestDownload(guideId: string, assetId: string) {
    setError(null);
    setStates((current) => ({ ...current, [assetId]: "loading" }));

    try {
      const response = await fetch("/api/access/download", {
        body: JSON.stringify({ assetId, guideId, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: unknown = await response.json().catch(() => null);
      const url = typeof data === "object" && data !== null && "url" in data
        && typeof data.url === "string"
        ? data.url
        : null;

      if (!response.ok || !url) {
        const message = typeof data === "object" && data !== null && "error" in data
          && typeof data.error === "string"
          ? data.error
          : "We could not prepare this download. Please try again.";
        throw new Error(message);
      }

      window.location.assign(url);
    } catch (requestError) {
      setStates((current) => ({ ...current, [assetId]: "error" }));
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not prepare this download. Please try again.",
      );
    }
  }

  return (
    <section aria-labelledby="your-guides-heading" className="mt-8">
      <h2 id="your-guides-heading" className="text-2xl font-semibold tracking-tight text-stone-950">
        Your guides
      </h2>
      <p className="mt-2 text-pretty text-base text-stone-700">
        Select each file when you are ready. Each download link is prepared for one file and expires shortly after it is created.
      </p>
      {error ? (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-5 space-y-3">
        {guides.map((guide) => {
          return (
            <li key={guide.guideId} className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-stone-950">{guide.title}</h3>
              <p className="mt-2 text-pretty text-sm text-stone-700">{guide.shortDescription}</p>
              <p className="mt-3 text-sm text-stone-700">Version {guide.version}</p>
              <ul className="mt-4 space-y-3">
                {guide.assets.map((asset) => {
                  const state = states[asset.assetId] ?? "idle";
                  const isLoading = state === "loading";

                  return (
                    <li key={asset.assetId} className="flex flex-col gap-3 rounded-md bg-stone-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-stone-700">
                        {asset.displayName} · {formatFileType(asset.mediaType)} · {formatFileSize(asset.fileSizeBytes)}
                      </p>
                      <button
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-stone-800 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-500"
                        disabled={isLoading}
                        onClick={() => void requestDownload(guide.guideId, asset.assetId)}
                        type="button"
                      >
                        {isLoading ? "Preparing download" : "Download file"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
