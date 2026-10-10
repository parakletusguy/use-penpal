"use server";

import { revalidatePath } from "next/cache";
import {
  IJSDS_INITIAL_FOLDER,
  IJSDS_INITIAL_MANUSCRIPTS,
  manuscriptTitle,
  WORD_DOCUMENT_MIME,
} from "@/lib/initial-ijsds-batch";
import { requireEditor } from "@/lib/editor-access";

export type ImportState = {
  message: string | null;
  status: "error" | "idle" | "success";
};

export async function importVerifiedIJSDSBatch(
  _previousState: ImportState,
  _formData: FormData,
): Promise<ImportState> {
  void _previousState;
  void _formData;
  const { editorId, supabase } = await requireEditor();
  const sourceFileIds = IJSDS_INITIAL_MANUSCRIPTS.map(([fileId]) => fileId);

  const { count: existingCount, error: existingError } = await supabase
    .from("manuscripts")
    .select("id", { count: "exact", head: true })
    .eq("editor_id", editorId)
    .in("source_file_id", sourceFileIds);

  if (existingError) return { message: "PenPal could not check this batch. Please try again.", status: "error" };
  if ((existingCount ?? 0) > 0) {
    return { message: "This verified batch has already been imported.", status: "success" };
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      attention_file_count: 0,
      completed_at: new Date().toISOString(),
      editor_id: editorId,
      import_notes: "Verified IJSDS Drive batch. AI consent recorded for all 20 manuscripts.",
      import_status: "complete",
      imported_file_count: IJSDS_INITIAL_MANUSCRIPTS.length,
      source_folder_id: IJSDS_INITIAL_FOLDER.id,
      source_folder_name: IJSDS_INITIAL_FOLDER.name,
      total_files: IJSDS_INITIAL_MANUSCRIPTS.length,
      valid_file_count: IJSDS_INITIAL_MANUSCRIPTS.length,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return { message: "PenPal could not create the import batch. Please try again.", status: "error" };
  }

  const consentRecordedAt = new Date().toISOString();
  const { error: manuscriptsError } = await supabase.from("manuscripts").insert(
    IJSDS_INITIAL_MANUSCRIPTS.map(([sourceFileId, sourceFileName, modifiedAt]) => ({
      batch_id: batch.id,
      consent_recorded_at: consentRecordedAt,
      consent_status: "recorded",
      consent_verified_by: editorId,
      editor_id: editorId,
      source_file_id: sourceFileId,
      source_file_modified_at: modifiedAt,
      source_file_name: sourceFileName,
      source_mime_type: WORD_DOCUMENT_MIME,
      title: manuscriptTitle(sourceFileName),
      workflow_status: "imported",
    })),
  );

  if (manuscriptsError) {
    await supabase
      .from("import_batches")
      .update({ import_notes: "Import did not complete. No manuscript records were created.", import_status: "failed" })
      .eq("id", batch.id);
    return { message: "PenPal could not import the manuscript records. Please try again.", status: "error" };
  }

  revalidatePath("/");
  revalidatePath("/import");
  revalidatePath("/manuscripts");
  return { message: "20 manuscripts are ready in your workspace.", status: "success" };
}
