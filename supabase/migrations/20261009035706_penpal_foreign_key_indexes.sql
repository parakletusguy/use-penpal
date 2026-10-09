-- Cover every foreign key used by PenPal. PostgreSQL does not add these indexes automatically.

drop index if exists public.manuscripts_batch_id_idx;
create index manuscripts_batch_editor_idx
  on public.manuscripts (batch_id, editor_id);
create index manuscripts_consent_verified_by_idx
  on public.manuscripts (consent_verified_by)
  where consent_verified_by is not null;

create index review_reports_manuscript_editor_idx
  on public.review_reports (manuscript_id, editor_id);

drop index if exists public.findings_manuscript_status_severity_idx;
create index findings_manuscript_editor_status_severity_idx
  on public.findings (manuscript_id, editor_id, finding_status, severity);

drop index if exists public.edit_suggestions_manuscript_status_idx;
drop index if exists public.edit_suggestions_finding_id_idx;
create index edit_suggestions_manuscript_editor_status_idx
  on public.edit_suggestions (manuscript_id, editor_id, suggestion_status, created_at);
create index edit_suggestions_finding_editor_idx
  on public.edit_suggestions (finding_id, editor_id)
  where finding_id is not null;
create index edit_suggestions_editor_id_idx
  on public.edit_suggestions (editor_id);
create index edit_suggestions_decided_by_idx
  on public.edit_suggestions (decided_by)
  where decided_by is not null;

drop index if exists public.document_artifacts_manuscript_type_idx;
create index document_artifacts_manuscript_editor_type_idx
  on public.document_artifacts (manuscript_id, editor_id, artifact_type, created_at desc);
create index document_artifacts_editor_id_idx
  on public.document_artifacts (editor_id);
create index document_artifacts_created_by_idx
  on public.document_artifacts (created_by)
  where created_by is not null;

drop index if exists public.audit_events_manuscript_created_idx;
create index audit_events_manuscript_editor_created_idx
  on public.audit_events (manuscript_id, editor_id, created_at desc)
  where manuscript_id is not null;
