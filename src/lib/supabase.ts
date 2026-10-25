import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnvironmentStatus {
  isConfigured: boolean;
  supabaseUrlProvided: boolean;
  supabaseAnonKeyProvided: boolean;
  missingVariables: string[];
  activePersistenceEngine: 'firebase-cloud' | 'supabase-postgres';
}

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isValidSupabaseUrl =
  rawSupabaseUrl.length > 0 &&
  rawSupabaseUrl !== 'MY_SUPABASE_URL' &&
  rawSupabaseUrl.startsWith('https://');

const isValidAnonKey =
  rawSupabaseAnonKey.length > 20 &&
  rawSupabaseAnonKey !== 'MY_SUPABASE_ANON_KEY';

export function getSupabaseEnvironmentStatus(): SupabaseEnvironmentStatus {
  const missingVariables: string[] = [];
  if (!isValidSupabaseUrl) {
    missingVariables.push('VITE_SUPABASE_URL');
  }
  if (!isValidAnonKey) {
    missingVariables.push('VITE_SUPABASE_ANON_KEY');
  }

  const isConfigured = missingVariables.length === 0;
  return {
    isConfigured,
    supabaseUrlProvided: isValidSupabaseUrl,
    supabaseAnonKeyProvided: isValidAnonKey,
    missingVariables,
    activePersistenceEngine: isConfigured
      ? 'supabase-postgres'
      : 'firebase-cloud',
  };
}

export const supabase: SupabaseClient | null =
  isValidSupabaseUrl && isValidAnonKey
    ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
