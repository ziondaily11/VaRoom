alter table public.message_attachments
  add column if not exists original_mime_type text,
  add column if not exists original_file_size_bytes bigint,
  add column if not exists optimized_file_size_bytes bigint,
  add column if not exists source_storage_key text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists thumbnail_key text,
  add column if not exists thumbnail_mime_type text,
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_started_at timestamptz,
  add column if not exists optimization_status text not null default 'not_applicable',
  add column if not exists thumbnail_status text not null default 'pending';

update public.message_attachments
set original_mime_type = coalesce(original_mime_type, mime_type),
    original_file_size_bytes = coalesce(original_file_size_bytes, file_size_bytes),
    optimized_file_size_bytes = coalesce(optimized_file_size_bytes, file_size_bytes),
    processing_status = case when status = 'ready' then 'ready' else processing_status end,
    thumbnail_status = case
      when kind = 'photo' or mime_type like 'image/%' or mime_type like 'video/%' then 'pending'
      else 'not_applicable'
    end
where original_mime_type is null
   or original_file_size_bytes is null
   or optimized_file_size_bytes is null;

alter table public.message_attachments
  drop constraint if exists message_attachments_processing_status_check,
  add constraint message_attachments_processing_status_check
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  drop constraint if exists message_attachments_optimization_status_check,
  add constraint message_attachments_optimization_status_check
    check (optimization_status in ('optimized', 'unchanged', 'failed', 'not_applicable')),
  drop constraint if exists message_attachments_thumbnail_status_check,
  add constraint message_attachments_thumbnail_status_check
    check (thumbnail_status in ('pending', 'ready', 'failed', 'not_applicable'));
