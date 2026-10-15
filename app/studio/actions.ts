"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthor } from "@/lib/editor-access";

const starterChecks = [
  ["scope", "Journal scope and article type", "Confirm the journal's scope and article type from its current author guidance."],
  ["ethics", "Ethics and declarations", "Record applicable ethics, conflicts, funding, and AI-use disclosures from verified project facts."],
  ["sources", "Citation traceability", "Keep every source used for a claim in the project source ledger for author review."],
  ["reporting", "Methods and reporting guidance", "Identify the reporting guidance that applies to the study design; do not infer missing methods or results."],
] as const;

function textField(formData: FormData, name: string, maximum: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function positiveInteger(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function createAuthorProject(formData: FormData) {
  const title = textField(formData, "title", 240);
  if (!title) return;

  const { ownerId, supabase } = await requireAuthor();
  const { data: project, error } = await supabase
    .from("author_projects")
    .insert({
      intended_journal: textField(formData, "intendedJournal", 400) || null,
      owner_id: ownerId,
      research_area: textField(formData, "researchArea", 400) || null,
      title,
    })
    .select("id")
    .single();
  if (error || !project) throw new Error("PenPal could not create this project.");

  const { error: checklistError } = await supabase.from("readiness_checks").insert(
    starterChecks.map(([criterionKey, criterionLabel, guidance]) => ({
      criterion_key: criterionKey,
      criterion_label: criterionLabel,
      guidance,
      owner_id: ownerId,
      project_id: project.id,
    })),
  );
  if (checklistError) throw new Error("PenPal could not prepare the readiness checklist.");
  await supabase.from("author_audit_events").insert({ event_data: { title }, event_type: "project_created", owner_id: ownerId, project_id: project.id });
  redirect(`/studio/${project.id}`);
}

export async function addProjectSource(formData: FormData) {
  const projectId = positiveInteger(formData, "projectId");
  const citation = textField(formData, "citation", 4000);
  if (!projectId || !citation) return;

  const approved = formData.get("approveForSynthesis") === "on";
  const { ownerId, supabase } = await requireAuthor();
  const { error } = await supabase.from("project_sources").insert({
    approval_recorded_at: approved ? new Date().toISOString() : null,
    approved_for_synthesis: approved,
    citation,
    doi: textField(formData, "doi", 512) || null,
    owner_id: ownerId,
    project_id: projectId,
    source_url: textField(formData, "sourceUrl", 2048) || null,
    verification_status: approved ? "author_confirmed" : "unverified",
  });
  if (error) throw new Error("PenPal could not add this source.");
  await supabase.from("author_audit_events").insert({ event_data: { approvedForSynthesis: approved }, event_type: "source_added", owner_id: ownerId, project_id: projectId });
  revalidatePath(`/studio/${projectId}`);
}

export async function addResearchTask(formData: FormData) {
  const projectId = positiveInteger(formData, "projectId");
  const prompt = textField(formData, "prompt", 4000);
  if (!projectId || !prompt) return;

  const { ownerId, supabase } = await requireAuthor();
  const { count, error: sourceError } = await supabase
    .from("project_sources")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .eq("approved_for_synthesis", true);
  if (sourceError) throw new Error("PenPal could not confirm the source ledger.");

  const taskStatus = (count ?? 0) > 0 ? "ready_for_grounded_draft" : "needs_sources";
  const { error } = await supabase.from("research_tasks").insert({
    owner_id: ownerId,
    project_id: projectId,
    prompt,
    target_section: textField(formData, "targetSection", 240) || null,
    task_status: taskStatus,
  });
  if (error) throw new Error("PenPal could not save this research task.");
  await supabase.from("author_audit_events").insert({ event_data: { taskStatus }, event_type: "research_task_created", owner_id: ownerId, project_id: projectId });
  revalidatePath(`/studio/${projectId}`);
}

export async function updateReadinessCheck(formData: FormData) {
  const projectId = positiveInteger(formData, "projectId");
  const checkId = positiveInteger(formData, "checkId");
  const status = formData.get("status");
  if (!projectId || !checkId || typeof status !== "string" || !new Set(["not_started", "needs_author_input", "ready"]).has(status)) return;

  const { ownerId, supabase } = await requireAuthor();
  const { error } = await supabase.from("readiness_checks").update({ check_status: status }).eq("id", checkId).eq("owner_id", ownerId).eq("project_id", projectId);
  if (error) throw new Error("PenPal could not update this readiness item.");
  await supabase.from("author_audit_events").insert({ event_data: { checkId, status }, event_type: "readiness_check_updated", owner_id: ownerId, project_id: projectId });
  revalidatePath(`/studio/${projectId}`);
}
