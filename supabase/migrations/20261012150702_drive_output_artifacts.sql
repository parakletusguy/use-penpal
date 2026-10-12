-- Keep Drive delivery metadata on the private artefact record. The original
-- Drive source is never updated or moved by PenPal.

alter table public.document_artifacts
  add column external_provider text,
  add column external_file_id text,
  add column external_url text,
  add column externally_delivered_at timestamptz,
  add constraint document_artifacts_external_delivery_check check (
    (external_provider is null and external_file_id is null and external_url is null and externally_delivered_at is null)
    or (external_provider = 'google_drive' and external_file_id is not null)
  );

create unique index document_artifacts_external_file_unique
  on public.document_artifacts (editor_id, external_provider, external_file_id)
  where external_provider is not null and external_file_id is not null;
