-- ============================================================================
-- FzeeLog Phase 7 Migration: Organization vs Individual Accounts, Multi-User
-- Login Directory, Customizable 15-Column Headers & 10d/5d/1d Email + WhatsApp Alerts
-- Currency: INR (₹) | Distance: km | Timezone: Asia/Kolkata
-- ============================================================================

-- 1. Extend profiles table with Organization/Individual mode, custom 15-col headers,
--    and 10d/5d/1d Email & WhatsApp alert recipients
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_mode TEXT NOT NULL DEFAULT 'Organization'
    CHECK (account_mode IN ('Individual', 'Organization')),
  ADD COLUMN IF NOT EXISTS organization_name TEXT NOT NULL DEFAULT 'FzeeLog Commercial Fleet Services',
  ADD COLUMN IF NOT EXISTS alert_email TEXT NOT NULL DEFAULT 'mbasha661@gmail.com',
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT NOT NULL DEFAULT '9786395076',
  ADD COLUMN IF NOT EXISTS alert_milestones_days INTEGER[] NOT NULL DEFAULT ARRAY[10, 5, 1],
  ADD COLUMN IF NOT EXISTS custom_logbook_headers JSONB DEFAULT NULL;

-- 2. Create organization_members table for multi-user organization logins
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL DEFAULT 'FzeeLog Commercial Fleet Services',
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 160),
  whatsapp_number TEXT NOT NULL DEFAULT '9786395076' CHECK (char_length(whatsapp_number) BETWEEN 5 AND 30),
  role TEXT NOT NULL DEFAULT 'FleetManager'
    CHECK (role IN ('Owner / Admin', 'OrgAdmin', 'Fleet Manager', 'FleetManager', 'Accountant', 'Dispatcher', 'Driver Operator', 'DriverViewer')),
  access_pin TEXT NOT NULL DEFAULT '1234' CHECK (char_length(access_pin) BETWEEN 4 AND 32),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_members_owner_id
  ON public.organization_members(owner_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select organization_members"
  ON public.organization_members
  FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owner can insert organization_members"
  ON public.organization_members
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can update organization_members"
  ON public.organization_members
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can delete organization_members"
  ON public.organization_members
  FOR DELETE
  USING (auth.uid() = owner_id);

-- 3. Allow WhatsApp channel in notification_logs
ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_channel_check;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_channel_check
  CHECK (channel IN ('InApp', 'EmailDigest', 'WhatsApp', 'PDFReport'));
