"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiRequest, jsonBody } from "@/lib/api-client";
import type {
  AnnualRecapInput,
  AnnualRecapSetting,
  GoldTransaction,
  GoldTransactionInput,
  GoldValuation,
  GoldValuationInput,
  PortfolioRecapSummary,
  PortfolioSnapshot,
  SnapshotInput,
  SnapshotPrefill,
  WorkbookImportPreview,
  WorkbookUploadSession,
} from "./types";

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "Request failed.";
}

export interface UsePortfolioRecap {
  data?: PortfolioRecapSummary;
  loading: boolean;
  error?: string;
  reload: () => Promise<void>;
  prefill: (asOf: string) => Promise<SnapshotPrefill>;
  saveSnapshot: (input: SnapshotInput, id?: string) => Promise<PortfolioSnapshot>;
  deleteSnapshot: (id: string) => Promise<void>;
}

/** Loads the full recap read model (PRD §9.2) and exposes snapshot CRUD against the contract. */
export function usePortfolioRecap(): UsePortfolioRecap {
  const [data, setData] = useState<PortfolioRecapSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await apiRequest<PortfolioRecapSummary>("/api/portfolio-recap"));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const prefill = useCallback(
    (asOf: string) => apiRequest<SnapshotPrefill>(`/api/portfolio-recap/prefill?asOf=${asOf}`),
    [],
  );

  const saveSnapshot = useCallback(
    async (input: SnapshotInput, id?: string) => {
      const result = id
        ? await apiRequest<PortfolioSnapshot>(`/api/portfolio-recap/snapshots/${id}`, {
            method: "PATCH",
            body: jsonBody(input),
          })
        : await apiRequest<PortfolioSnapshot>("/api/portfolio-recap/snapshots", {
            method: "POST",
            body: jsonBody(input),
          });
      await reload();
      return result;
    },
    [reload],
  );

  const deleteSnapshot = useCallback(
    async (id: string) => {
      await apiRequest<void>(`/api/portfolio-recap/snapshots/${id}`, { method: "DELETE" });
      await reload();
    },
    [reload],
  );

  return { data, loading, error, reload, prefill, saveSnapshot, deleteSnapshot };
}

/** Gold transaction + valuation mutations (PRD §9.4). */
export async function saveGoldTransaction(input: GoldTransactionInput, id?: string) {
  return id
    ? apiRequest<GoldTransaction>(`/api/portfolio-recap/gold/transactions/${id}`, {
        method: "PATCH",
        body: jsonBody(input),
      })
    : apiRequest<GoldTransaction>("/api/portfolio-recap/gold/transactions", {
        method: "POST",
        body: jsonBody(input),
      });
}

export async function deleteGoldTransaction(id: string) {
  await apiRequest<void>(`/api/portfolio-recap/gold/transactions/${id}`, { method: "DELETE" });
}

export async function saveGoldValuation(input: GoldValuationInput, id?: string) {
  return id
    ? apiRequest<GoldValuation>(`/api/portfolio-recap/gold/valuations/${id}`, {
        method: "PATCH",
        body: jsonBody(input),
      })
    : apiRequest<GoldValuation>("/api/portfolio-recap/gold/valuations", {
        method: "POST",
        body: jsonBody(input),
      });
}

export async function deleteGoldValuation(id: string) {
  await apiRequest<void>(`/api/portfolio-recap/gold/valuations/${id}`, { method: "DELETE" });
}

/** Annual recap settings (PRD §9.5). */
export async function saveAnnualRecap(year: number, input: AnnualRecapInput) {
  return apiRequest<AnnualRecapSetting>(`/api/portfolio-recap/annual/${year}`, {
    method: "PUT",
    body: jsonBody(input),
  });
}

/** Chunked workbook upload + import flow (PRD §9.6). */
export async function createWorkbookUpload(input: {
  filename: string;
  byteSize: number;
  sha256: string;
  totalChunks: number;
}) {
  return apiRequest<WorkbookUploadSession>("/api/portfolio-recap/workbook/uploads", {
    method: "POST",
    body: jsonBody(input),
  });
}

export async function uploadWorkbookChunk(
  uploadId: string,
  index: number,
  body: ArrayBuffer,
  sha256: string,
) {
  await fetch(`/api/portfolio-recap/workbook/uploads/${uploadId}/chunks/${index}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream", "x-chunk-sha256": sha256 },
    body,
    credentials: "same-origin",
    cache: "no-store",
  });
}

export async function previewWorkbookUpload(uploadId: string) {
  return apiRequest<WorkbookImportPreview>(
    `/api/portfolio-recap/workbook/uploads/${uploadId}/preview`,
    { method: "POST" },
  );
}

export async function confirmWorkbookImport(
  batchId: string,
  resolutions: Array<{ rowId: string; resolution: string }>,
) {
  return apiRequest<{ confirmed: true }>(
    `/api/portfolio-recap/workbook/imports/${batchId}/confirm`,
    { method: "POST", body: jsonBody({ resolutions }) },
  );
}

/** Streamed XLSX backup download (PRD §9.7). Uses a same-origin anchor click for the binary stream. */
export function downloadRecapExport() {
  const anchor = document.createElement("a");
  anchor.href = "/api/portfolio-recap/export";
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
