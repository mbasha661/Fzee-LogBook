-- ============================================================================
-- FzeeLog Phase 6 Migration: Google Drive Backup Sync & Restore Vault Ledger
-- Currency: INR (₹) | Distance: km | Timezone: Asia/Kolkata
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.drive_backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  drive_file_id VARCHAR(160) NOT NULL,
  drive_folder_id VARCHAR(160),
  file_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT 'application/json',
  target_drive_email VARCHAR(160) NOT NULL DEFAULT 'mbasha661@gmail.com',
  vehicles_count INTEGER NOT NULL DEFAULT 0,
  drivers_count INTEGER NOT NULL DEFAULT 0,
  logbook_entries_count INTEGER NOT NULL DEFAULT 0,
  service_records_count INTEGER NOT NULL DEFAULT 0,
  compliance_docs_count INTEGER NOT NULL DEFAULT 0,
  net_business_earnings_inr NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  web_view_link TEXT,
  action_type VARCHAR(40) NOT NULL DEFAULT 'UPLOAD_SNAPSHOT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

CREATE INDEX IF NOT EXISTS idx_drive_backup_logs_owner_created
  ON public.drive_backup_logs (owner_id, created_at DESC);

ALTER TABLE public.drive_backup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drive_backup_logs_owner_policy ON public.drive_backup_logs;
CREATE POLICY drive_backup_logs_owner_policy
  ON public.drive_backup_logs
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
