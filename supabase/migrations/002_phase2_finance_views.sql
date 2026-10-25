-- =============================================================================
-- FzeeLog — Phase 2 Supabase PostgreSQL Views & Indexes for Financial Summaries
-- =============================================================================

-- 1. Daily Summary Aggregation View (owner-scoped via security_invoker)
CREATE OR REPLACE VIEW public.daily_logbook_summaries
WITH (security_invoker = true) AS
SELECT
  owner_id,
  entry_date AS period_date,
  COUNT(id) AS shifts_count,
  COUNT(DISTINCT vehicle_id) AS active_vehicles_count,
  SUM(km_day) AS total_km_day,
  SUM(earnings) AS total_earnings,
  CASE WHEN SUM(km_day) > 0 THEN ROUND(SUM(earnings) / SUM(km_day), 2) ELSE 0.00 END AS avg_unit_price,
  SUM(driver_share) AS total_driver_share,
  SUM(gas_fuel) AS total_gas_fuel,
  SUM(red_taxi) AS total_red_taxi,
  SUM(toll) AS total_toll,
  SUM(maintenance) AS total_maintenance,
  SUM(other_expenses) AS total_other_expenses,
  SUM(total_expenses) AS total_operating_expenses,
  SUM(net_business_earnings) AS total_net_business_earnings
FROM public.daily_logbook_entries
GROUP BY owner_id, entry_date
ORDER BY entry_date DESC;

-- 2. Monthly Summary Aggregation View (owner-scoped via security_invoker)
CREATE OR REPLACE VIEW public.monthly_logbook_summaries
WITH (security_invoker = true) AS
SELECT
  owner_id,
  TO_CHAR(entry_date, 'YYYY-MM') AS period_month,
  COUNT(id) AS shifts_count,
  COUNT(DISTINCT vehicle_id) AS active_vehicles_count,
  SUM(km_day) AS total_km_day,
  SUM(earnings) AS total_earnings,
  CASE WHEN SUM(km_day) > 0 THEN ROUND(SUM(earnings) / SUM(km_day), 2) ELSE 0.00 END AS avg_unit_price,
  SUM(driver_share) AS total_driver_share,
  SUM(gas_fuel) AS total_gas_fuel,
  SUM(red_taxi) AS total_red_taxi,
  SUM(toll) AS total_toll,
  SUM(maintenance) AS total_maintenance,
  SUM(other_expenses) AS total_other_expenses,
  SUM(total_expenses) AS total_operating_expenses,
  SUM(net_business_earnings) AS total_net_business_earnings
FROM public.daily_logbook_entries
GROUP BY owner_id, TO_CHAR(entry_date, 'YYYY-MM')
ORDER BY period_month DESC;

-- 3. Driver Settlement Summary View
CREATE OR REPLACE VIEW public.driver_settlement_summaries
WITH (security_invoker = true) AS
SELECT
  d.owner_id,
  d.id AS driver_id,
  d.full_name,
  d.default_share_pct,
  d.status,
  COUNT(l.id) AS total_shifts,
  COALESCE(SUM(l.km_day), 0) AS total_km_driven,
  COALESCE(SUM(l.earnings), 0) AS gross_earnings_generated,
  COALESCE(SUM(l.driver_share), 0) AS total_driver_share_earned,
  COALESCE(SUM(l.net_business_earnings), 0) AS net_fleet_contribution
FROM public.drivers d
LEFT JOIN public.daily_logbook_entries l
  ON l.driver_id = d.id AND l.owner_id = d.owner_id
GROUP BY d.owner_id, d.id, d.full_name, d.default_share_pct, d.status;
