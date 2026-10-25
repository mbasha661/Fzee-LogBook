-- =============================================================================
-- FzeeLog — Phase 4 Supabase PostgreSQL Schema, Storage Buckets & RLS
-- Module: 3D Vehicle Viewer, Multi-Angle Photographs & GLB/glTF Assets
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  registration_number VARCHAR(25) NOT NULL,
  media_category VARCHAR(30) NOT NULL CHECK (media_category IN ('AnglePhoto', 'Model3D', 'AICalibration')),
  angle_label VARCHAR(30) NOT NULL CHECK (angle_label IN (
    '0_Front',
    '45_FrontLeft',
    '90_Left',
    '135_RearLeft',
    '180_Rear',
    '225_RearRight',
    '270_Right',
    '315_FrontRight',
    'Custom'
  )),
  angle_degrees NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (angle_degrees >= 0 AND angle_degrees <= 360),
  file_name VARCHAR(160) NOT NULL,
  mime_type VARCHAR(60) NOT NULL CHECK (mime_type IN (
    'image/jpeg',
    'image/png',
    'image/webp',
    'model/gltf-binary',
    'model/gltf+json',
    'application/json'
  )),
  file_size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0 AND file_size_bytes <= 52428800),
  data_url TEXT NOT NULL DEFAULT '',
  storage_path VARCHAR(300) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_media_owner_vehicle
  ON public.vehicle_media(owner_id, vehicle_id, media_category);

ALTER TABLE public.vehicle_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vehicle media"
  ON public.vehicle_media FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own vehicle media"
  ON public.vehicle_media FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own vehicle media"
  ON public.vehicle_media FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own vehicle media"
  ON public.vehicle_media FOR DELETE
  USING (auth.uid() = owner_id);

-- Supabase Storage Bucket for Vehicle Photographs & 3D GLB/glTF Models
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vehicle-assets',
  'vehicle-assets',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'model/gltf-binary', 'model/gltf+json']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vehicle assets owner select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vehicle assets owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vehicle-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Vehicle assets owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'vehicle-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
