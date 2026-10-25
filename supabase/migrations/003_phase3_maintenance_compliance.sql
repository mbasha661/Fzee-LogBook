-- =============================================================================
-- FzeeLog — Phase 3 Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Module: Preventive Maintenance, Service Records, Statutory Compliance Documents & Expiry Alerts
-- Currency: INR (₹) | Distance: kilometres (km) | Timezone: Asia/Kolkata
-- =============================================================================

-- 1. Extend profiles table with configurable alert thresholds
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expiry_warning_days INTEGER NOT NULL DEFAULT 30
    CHECK (expiry_warning_days >= 1 AND expiry_warning_days <= 365),
  ADD COLUMN IF NOT EXISTS service_warning_km NUMERIC(10, 1) NOT NULL DEFAULT 1000.0
    CHECK (service_warning_km >= 100 AND service_warning_km <= 20000);

-- 2. Service & Maintenance Records Table
CREATE TABLE IF NOT EXISTS public.service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  vehicle_reg_no VARCHAR(32) NOT NULL,
  service_date DATE NOT NULL,
  service_type VARCHAR(40) NOT NULL CHECK (
    service_type IN (
      'Preventive Service',
      'Major Overhaul',
      'Tyre & Alignment',
      'Brake & Clutch',
      'CNG / Fuel System',
      'Electrical & Battery',
      'Body & Accident Repair',
      'Other'
    )
  ),
  odometer_km NUMERIC(12, 1) NOT NULL CHECK (odometer_km >= 0),
  next_service_odometer_km NUMERIC(12, 1) NOT NULL CHECK (next_service_odometer_km >= odometer_km),
  next_service_date DATE,
  workshop_name VARCHAR(120) NOT NULL,
  invoice_reference VARCHAR(64) NOT NULL DEFAULT '',
  parts_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (parts_cost >= 0),
  labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (labor_cost >= 0),
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
  notes VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'Completed' CHECK (
    status IN ('Completed', 'Scheduled', 'In Workshop')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_records_owner_vehicle
  ON public.service_records(owner_id, vehicle_id, service_date DESC);

-- 3. Statutory Compliance Documents & Upload History Table
CREATE TABLE IF NOT EXISTS public.compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type VARCHAR(16) NOT NULL CHECK (entity_type IN ('vehicle', 'driver')),
  entity_id UUID NOT NULL,
  entity_label VARCHAR(64) NOT NULL,
  document_category VARCHAR(48) NOT NULL CHECK (
    document_category IN (
      'Insurance Policy',
      'Fitness Certificate (FC)',
      'Commercial Permit',
      'Pollution Certificate (PUC)',
      'Registration Certificate (RC)',
      'Tax Token',
      'Driver License (DL)',
      'Service Invoice'
    )
  ),
  document_number VARCHAR(64) NOT NULL,
  issuing_authority VARCHAR(120) NOT NULL DEFAULT '',
  issue_date DATE,
  expiry_date DATE NOT NULL,
  renewal_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (renewal_cost >= 0),
  file_name VARCHAR(160) NOT NULL DEFAULT '',
  file_mime_type VARCHAR(64) NOT NULL DEFAULT '',
  file_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0 AND file_size_bytes <= 5242880),
  verification_digest VARCHAR(128) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'Active' CHECK (
    status IN ('Active', 'Superseded', 'Archived')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_docs_owner_expiry
  ON public.compliance_documents(owner_id, expiry_date ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;

-- Service Records RLS Policies
CREATE POLICY "Owners can select their own service records"
  ON public.service_records FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their own service records"
  ON public.service_records FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own service records"
  ON public.service_records FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their own service records"
  ON public.service_records FOR DELETE
  USING (auth.uid() = owner_id);

-- Compliance Documents RLS Policies
CREATE POLICY "Owners can select their own compliance documents"
  ON public.compliance_documents FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their own compliance documents"
  ON public.compliance_documents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own compliance documents"
  ON public.compliance_documents FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their own compliance documents"
  ON public.compliance_documents FOR DELETE
  USING (auth.uid() = owner_id);
