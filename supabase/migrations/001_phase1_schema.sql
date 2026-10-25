-- =============================================================================
-- FzeeLog — Phase 1 Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Currency: INR (₹) | Distance: kilometres (km) | Timezone: Asia/Kolkata
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(256) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  business_name VARCHAR(160) NOT NULL DEFAULT 'FzeeLog Fleet Operations',
  default_driver_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 30.00 CHECK (default_driver_share_pct >= 0 AND default_driver_share_pct <= 100),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  distance_unit VARCHAR(10) NOT NULL DEFAULT 'km' CHECK (distance_unit = 'km'),
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  intended_drive_email VARCHAR(256) NOT NULL DEFAULT 'mbasha661@gmail.com',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DRIVERS TABLE
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL DEFAULT '',
  license_number VARCHAR(64) NOT NULL DEFAULT '',
  license_expiry DATE,
  default_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 30.00 CHECK (default_share_pct >= 0 AND default_share_pct <= 100),
  assigned_vehicle_id UUID,
  status VARCHAR(24) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'On Leave', 'Inactive', 'Archived')),
  joining_date DATE,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. VEHICLES TABLE
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registration_number VARCHAR(32) NOT NULL,
  make VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  variant VARCHAR(64) NOT NULL DEFAULT '',
  manufacturing_year INTEGER NOT NULL CHECK (manufacturing_year >= 1980 AND manufacturing_year <= 2100),
  colour VARCHAR(40) NOT NULL DEFAULT '',
  fuel_type VARCHAR(32) NOT NULL CHECK (fuel_type IN ('Petrol', 'Diesel', 'CNG', 'LPG', 'Petrol+CNG', 'Electric', 'Hybrid')),
  transmission VARCHAR(32) NOT NULL CHECK (transmission IN ('Manual', 'Automatic', 'AMT', 'CVT')),
  vehicle_type VARCHAR(32) NOT NULL CHECK (vehicle_type IN ('Sedan', 'SUV', 'Hatchback', 'MPV', 'Commercial Van', 'Truck')),
  ownership_type VARCHAR(32) NOT NULL CHECK (ownership_type IN ('Commercial', 'Personal', 'Leased', 'Attached')),
  purchase_date DATE,
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (purchase_price >= 0),
  current_odometer_km NUMERIC(10, 1) NOT NULL DEFAULT 0.0 CHECK (current_odometer_km >= 0),
  assigned_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  assigned_driver_name VARCHAR(120) NOT NULL DEFAULT '',
  insurance_provider VARCHAR(120) NOT NULL DEFAULT '',
  insurance_expiry DATE,
  fc_number VARCHAR(64) NOT NULL DEFAULT '',
  fc_expiry DATE,
  permit_type VARCHAR(64) NOT NULL DEFAULT '',
  permit_number VARCHAR(64) NOT NULL DEFAULT '',
  permit_expiry DATE,
  pollution_expiry DATE,
  last_service_date DATE,
  last_service_odometer_km NUMERIC(10, 1) NOT NULL DEFAULT 0.0 CHECK (last_service_odometer_km >= 0),
  next_service_date DATE,
  next_service_odometer_km NUMERIC(10, 1) NOT NULL DEFAULT 0.0 CHECK (next_service_odometer_km >= 0),
  service_interval_km NUMERIC(10, 1) NOT NULL DEFAULT 10000.0 CHECK (service_interval_km >= 0),
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'Inactive', 'Archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, registration_number)
);

-- 4. DAILY LOGBOOK ENTRIES TABLE (15 User-Facing Columns + Audit Metadata)
CREATE TABLE IF NOT EXISTS public.daily_logbook_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  vehicle_reg_no VARCHAR(32) NOT NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver_name VARCHAR(120) NOT NULL DEFAULT '',
  entry_date DATE NOT NULL,
  shift_number INTEGER NOT NULL DEFAULT 1 CHECK (shift_number >= 1 AND shift_number <= 10),
  starting_km NUMERIC(10, 1) NOT NULL CHECK (starting_km >= 0),
  ending_km NUMERIC(10, 1) NOT NULL CHECK (ending_km >= starting_km),
  km_day NUMERIC(10, 1) NOT NULL CHECK (km_day = ending_km - starting_km),
  attendance VARCHAR(24) NOT NULL CHECK (attendance IN ('Present', 'Half Day', 'Absent', 'Leave')),
  earnings NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (earnings >= 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
  driver_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 30.00 CHECK (driver_share_pct >= 0 AND driver_share_pct <= 100),
  driver_share NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (driver_share >= 0),
  gas_fuel NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gas_fuel >= 0),
  red_taxi NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (red_taxi >= 0),
  toll NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (toll >= 0),
  maintenance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (maintenance >= 0),
  other_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (other_expenses >= 0),
  total_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_expenses >= 0),
  net_business_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  source_remarks VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, vehicle_id, entry_date, shift_number)
);

-- 5. AUDIT LOGS TABLE (Immutable Financial & Vehicle Change History)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL CHECK (entity_type IN ('vehicle', 'driver', 'logbook', 'profile')),
  entity_id VARCHAR(128) NOT NULL,
  action VARCHAR(24) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'ARCHIVE', 'DELETE')),
  summary VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_vehicles_owner_status ON public.vehicles(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_drivers_owner_status ON public.drivers(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_logbook_owner_date ON public.daily_logbook_entries(owner_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_logbook_vehicle_date ON public.daily_logbook_entries(vehicle_id, entry_date DESC);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Drivers RLS
CREATE POLICY "Users can view own drivers" ON public.drivers
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own drivers" ON public.drivers
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own drivers" ON public.drivers
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Vehicles RLS (No hard delete policy — use Archive status to preserve financial records)
CREATE POLICY "Users can view own vehicles" ON public.vehicles
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own vehicles" ON public.vehicles
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own vehicles" ON public.vehicles
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Daily Logbook Entries RLS
CREATE POLICY "Users can view own logbook entries" ON public.daily_logbook_entries
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own logbook entries" ON public.daily_logbook_entries
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own logbook entries" ON public.daily_logbook_entries
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can delete own logbook entries" ON public.daily_logbook_entries
  FOR DELETE USING (auth.uid() = owner_id);

-- Audit Logs RLS (Append-only)
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
