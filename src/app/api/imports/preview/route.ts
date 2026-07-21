import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, enforceRateLimit, json, withUser } from "@/server/api";
import { previewImport } from "@/server/import-service";

const mappingSchema = z.record(z.string(), z.string());

export const runtime = "nodejs";

export const POST = withUser(async (request: NextRequest, user) => {
  await enforceRateLimit(`import-preview:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  const mappingValue = form.get("mapping");
  const reportMonth = form.get("reportMonth");
  if (!(file instanceof File) || (kind !== "spending" && kind !== "portfolio")) {
    throw new ApiError(422, "File and import kind are required.", "VALIDATION_ERROR");
  }
  let mappingJson: unknown;
  try {
    mappingJson = JSON.parse(String(mappingValue ?? "{}"));
  } catch {
    throw new ApiError(422, "Mapping must be valid JSON.", "VALIDATION_ERROR");
  }
  const mapping = mappingSchema.safeParse(mappingJson);
  if (!mapping.success) {
    throw new ApiError(422, "Mapping is invalid.", "VALIDATION_ERROR", mapping.error.flatten());
  }
  return json(await previewImport({ userId: user.id, kind, file, mapping: mapping.data, reportMonth: reportMonth ? String(reportMonth) : undefined }), {
    status: 201,
  });
});
