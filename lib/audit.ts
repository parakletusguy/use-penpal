import type { Json } from "@/types/database";
import type { createClient } from "@/utils/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type AuditEvent = {
  editorId: string;
  entityId?: number | null;
  entityType: string;
  eventData?: Json;
  eventType: string;
  manuscriptId?: number | null;
};

export async function recordAuditEvent(supabase: SupabaseClient, event: AuditEvent) {
  const { error } = await supabase.from("audit_events").insert({
    editor_id: event.editorId,
    entity_id: event.entityId ?? null,
    entity_type: event.entityType,
    event_data: event.eventData ?? {},
    event_type: event.eventType,
    manuscript_id: event.manuscriptId ?? null,
  });

  if (error) throw new Error("PenPal could not record its audit event.");
}
