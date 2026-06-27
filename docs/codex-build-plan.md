# Codex Build Plan

Use this plan to continue building the Rentals2 market intelligence system.

## Product intent

Turn the existing static dashboard into a rental fleet intelligence system for Las Vegas. The system should help with:

- pricing decisions
- utilization monitoring
- competitor tracking
- profit/loss clarity
- event-based demand spikes
- buy-next-car decisions
- action alerts

## Guardrails

- Do not bypass Turo protections, login controls, private APIs, rate limits, or anti-bot systems.
- Prefer first-party host data, manual/authorized competitor research, and public event calendars.
- Keep the current static dashboard working while new architecture is added.
- Separate raw data, normalized data, analysis, and presentation.

## Current repo state

- `index.html` is the static dashboard.
- `data.json` is the dashboard data source.
- `scripts/validate-data.mjs` validates `data.json`.
- `scripts/pricing-engine.mjs` generates `intelligence-report.json`.
- `docs/database-schema.sql` is the planned Supabase schema.

## Phase 1 tasks

1. Run `npm run validate` and fix any validation errors.
2. Run `npm run analyze` and review `intelligence-report.json`.
3. Add `intelligence-report.json` rendering to the dashboard, preferably as a new card below Action Items.
4. Add missing cost categories to `data.json`:
   - car payment
   - charging/fuel
   - maintenance
   - tires
   - registration
   - depreciation reserve
   - cleaning labor
5. Add an `events` section to `data.json` and include event demand in recommendations.

## Phase 2 tasks

1. Create a Supabase project.
2. Apply `docs/database-schema.sql`.
3. Write import script: `scripts/import-json-to-supabase.mjs`.
4. Write export script: `scripts/export-supabase-to-json.mjs` so the static dashboard can still run.
5. Add `.env.example` with Supabase variables.

## Phase 3 tasks

1. Convert dashboard to Next.js.
2. Add Supabase Auth or Clerk.
3. Add admin forms for vehicles, costs, bookings, events, and competitor entries.
4. Add server-side pricing recommendations.
5. Add weekly summary page.

## Phase 4 tasks

1. Add scheduled jobs for allowed data updates.
2. Add Twilio SMS or email alerts.
3. Add event demand alerts 30/14/7 days before major Vegas events.
4. Add buy-next-car ranking from acquisition cost, expected utilization, expected rate, and operating costs.

## Definition of done for MVP

- Dashboard still works.
- Data validates.
- Pricing report generates.
- Action plan is produced from data, not written only by hand.
- Manual competitor updates can be entered safely.
- Repo docs clearly explain architecture and next steps.
