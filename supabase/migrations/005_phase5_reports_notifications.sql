-- =============================================================================
-- FzeeLog — Phase 5 Supabase PostgreSQL Schema & Row Level Security
-- Module: Reports, Notification Logs & Alert Dispatch History
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (
    alert_type IN (
      'StatutoryExpiry',
      'ServiceOdometer',
      'ServiceDate',
      'DriverLicense',
      'FinancialDigest',
      'ReportExport'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
  target_label TEXT NOT NULL CHECK (char_length(target_label) BETWEEN 1 AND 120),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 800),
  recipient_email TEXT NOT NULL DEFAULT 'mbasha661@gmail.com' CHECK (char_length(recipient_email) BETWEEN 3 AND 160),
  channel TEXT NOT NULL CHECK (channel IN ('InApp', 'EmailDigest', 'PDFReport')),
  status TEXT NOT NULL DEFAULT 'Unread' CHECK (
    status IN ('Unread', 'Acknowledged', 'Dispatched', 'Archived')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_owner_created
  ON public.notification_logs(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_owner_status
  ON public.notification_logs(owner_id, status);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_logs_select_own" ON public.notification_logs;
CREATE POLICY "notification_logs_select_own"
  ON public.notification_logs
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "notification_logs_insert_own" ON public.notification_logs;
CREATE POLICY "notification_logs_insert_own"
  ON public.notification_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "notification_logs_update_own" ON public.notification_logs;
CREATE POLICY "notification_logs_update_own"
  ON public.notification_logs
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "notification_logs_delete_own" ON public.notification_logs;
CREATE POLICY "notification_logs_delete_own"
  ON public.notification_logs
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
