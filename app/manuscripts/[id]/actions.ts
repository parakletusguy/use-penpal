"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit";
import { requireEditor } from "@/lib/editor-access";

const allowedDecisions = new Set(["approved", "rejected", "modified"]);

function positiveInteger(value: FormDataEntryValue | null) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function decideSuggestion(formData: FormData) {
  const suggestionId = positiveInteger(formData.get("suggestionId"));
  const manuscriptId = positiveInteger(formData.get("manuscriptId"));
  const decision = formData.get("decision");
  if (!suggestionId || !manuscriptId || typeof decision !== "string" || !allowedDecisions.has(decision)) return;

  const { editorId, supabase } = await requireEditor();
  const { data: suggestion, error } = await supabase
    .from("edit_suggestions")
    .update({ decided_at: new Date().toISOString(), decided_by: editorId, suggestion_status: decision })
    .eq("id", suggestionId)
    .eq("manuscript_id", manuscriptId)
    .eq("editor_id", editorId)
    .select("suggestion_type")
    .maybeSingle();
  if (error || !suggestion) return;

  await recordAuditEvent(supabase, {
    editorId,
    entityId: suggestionId,
    entityType: "edit_suggestion",
    eventData: { decision, suggestionType: suggestion.suggestion_type },
    eventType: "suggestion_decided",
    manuscriptId,
  });

  revalidatePath(`/manuscripts/${manuscriptId}`);
  revalidatePath("/manuscripts");
}
