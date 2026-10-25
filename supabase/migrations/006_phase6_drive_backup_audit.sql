-- ============================================================================
-- FzeeLog Phase 6 Migration: Google Drive Backup Manifests & Audit Ledger
-- Currency: INR (₹) | Distance: km | Timezone: Asia/Kolkata
-- Target Google Drive Integration Account: mbasha661@gmail.com
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.drive_backup_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_file_id VARCHAR(160) NOT NULL,
  drive_folder_id VARCHAR(160) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/json',
  intended_drive_email VARCHAR(254) NOT NULL DEFAULT 'mbasha661@gmail.com',
  vehicles_count INTEGER NOT NULL DEFAULT 0 CHECK (vehicles_count >= 0),
  drivers_count INTEGER NOT NULL DEFAULT 0 CHECK (drivers_count >= 0),
  logbook_entries_count INTEGER NOT NULL DEFAULT 0 CHECK (logbook_entries_count >= 0),
  net_earnings_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  web_view_link VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drive_backups_owner_created
  ON public.drive_backup_manifests(owner_id, created_at DESC);

ALTER TABLE public.drive_backup_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can select own drive backup manifests"
  ON public.drive_backup_manifests
  FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert own drive backup manifests"
  ON public.drive_backup_manifests
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete own drive backup manifests"
  ON public.drive_backup_manifests
  FOR DELETE
  USING (auth.uid() = owner_id);
