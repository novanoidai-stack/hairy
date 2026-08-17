# Project: Mecha OS Complete Overhaul & Zero-Defect Hardening

## Architecture
Mecha OS is an all-in-one SaaS platform and booking engine for modern hair salons and barbershops.
- **Web Landing & Marketplace (`web/`)**: Vanilla HTML5/CSS3/ES6 static landing, GEO/SEO engines, salon directory (`web/salones.html`), and salon profile landing (`web/salon.html`).
- **SaaS Application & Public Booking Portal (`app/`, `components/`, `lib/`)**: React Native for Web (Expo Router) app with Agenda Calendar, CRM (Clients, Appointments), Staff & Shift Clocking (Art. 34.9 ET), Commissions, Financials, and Public Booking Portal (`app/r/[slug].web.tsx`).
- **Database & Edge Functions (`supabase/`, `migrations/`)**: PostgreSQL with RLS, pg_net, Supabase Auth, and Edge Functions for notifications, Stripe, and Cloudflare Turnstile captcha validation.
- **E2E Testing Suite (`tests/`, `playwright.config.ts`)**: Playwright test suites covering landing, config, marketplace, portal-reserva, agenda-jornada, and staff-jornada.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | WhatsApp Touch Unblocking | Fix `.wa-input-row, .wa-input-row * { pointer-events: auto !important; }` in `mecha-sections.css` | M1 | ORIGINAL_REQUEST R1 |
| 2 | Direct 1-Click WhatsApp & Phone CTAs | Add `https://wa.me/34690792975` & `tel:+34690792975` to `#contacto`, `#opcionesAccesoModal`, `#equipo`, and footer | M1 | ORIGINAL_REQUEST R1 |
| 3 | Access Modal Lead Capture Optimization | Maximize instant conversion in `#opcionesAccesoModal` | M1 | ORIGINAL_REQUEST R1 |
| 4 | Schema.org JSON-LD Enrichment | Add/enrich SoftwareApplication, FAQPage, Product, Organization, and aggregateRating in `web/index.html` | M2 | ORIGINAL_REQUEST R2 |
| 5 | GEO AI Engine Knowledge Base | Update `web/llms.txt` and `web/llms-full.txt` with direct factual Q&A on tint rest times, no-show reduction, and 0% commission | M2 | ORIGINAL_REQUEST R2 |
| 6 | Timeline Timer Isolation | Isolate 30s timer to `TimelineNowIndicator` and reference-stabilize `checkVencidas` (60s timer) in `AgendaCalendar.web.tsx` | M3 | ORIGINAL_REQUEST R3 |
| 7 | Appointment Card Strict Memoization | Wrap `DayTimelineAppointmentCard` with strict comparator `areCardPropsEqual` | M3 | ORIGINAL_REQUEST R3 |
| 8 | Professional Column Memoization | Precompute `citasByProf` and memoize `DayTimelineProfessionalColumn` | M3 | ORIGINAL_REQUEST R3 |
| 9 | 200ms Search Debouncing | Create `lib/hooks/useDebounce.ts` and apply to Agenda Topbar, NewCitaModal, CRM Citas, CRM Clientes | M3 | ORIGINAL_REQUEST R3 |
| 10 | Staff Panel Visual Polish | Polish team cards, role badges, commission breakdowns, monthly goal progress in `equipo.web.tsx` & `RendimientoEquipo.web.tsx` | M4 | ORIGINAL_REQUEST R4 |
| 11 | Mobile Shift Clocking & Color Formulas | Verify Art. 34.9 ET shift clocking and fast access to client technical color formulas in `mi-jornada.web.tsx` | M4 | ORIGINAL_REQUEST R4 |
| 12 | Marketplace 360px-390px Responsiveness | Ensure clean responsive layout without horizontal scrolling in `web/salones.html` and `web/salon.html` | M5 | ORIGINAL_REQUEST R5 |
| 13 | Public Booking Rest Phase Breakdown | Friendly explanatory breakdowns for chemical rest phases in `app/r/[slug].web.tsx` | M5 | ORIGINAL_REQUEST R5 |
| 14 | Turnstile Captcha Validation | Cloudflare Turnstile token validation on public appointment reservations | M5 | ORIGINAL_REQUEST R5 |
| 15 | Zero-Defect E2E Test Verification | Ensure `npx tsc --noEmit` and 100% of Playwright suites pass cleanly | M6 | ORIGINAL_REQUEST R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Landing & Conversion | Features 1, 2, 3 (`web/assets/mecha-sections.css`, `web/index.html`) | None | IN_PROGRESS |
| 2 | M2: SEO & GEO | Features 4, 5 (`web/index.html`, `web/llms.txt`, `web/llms-full.txt`, `llms.txt`, `llms-full.txt`) | None | IN_PROGRESS |
| 3 | M3: Agenda Performance | Features 6, 7, 8, 9 (`components/agenda/*`, `lib/hooks/useDebounce.ts`, CRM search) | None | IN_PROGRESS |
| 4 | M4: Staff & Mi Jornada | Features 10, 11 (`app/(tabs)/equipo.web.tsx`, `app/(tabs)/mi-jornada.web.tsx`, `components/equipo/*`) | None | IN_PROGRESS |
| 5 | M5: Marketplace & Booking | Features 12, 13, 14 (`web/salones.html`, `web/salon.html`, `app/r/[slug].web.tsx`) | None | IN_PROGRESS |
| 6 | M6: E2E Verification & Hardening | Feature 15 (`tests/*`, `playwright.config.ts`, TypeScript compilation & full test suite pass) | M1-M5 | PLANNED |

## Interface Contracts
### Search Debounce Hook (`lib/hooks/useDebounce.ts`)
- `export function useDebounce<T>(value: T, delayMs: number = 200): T`
### Appointment Card Comparator (`components/agenda/AgendaCalendar.web.tsx`)
- `function areCardPropsEqual(prev: CardProps, next: CardProps): boolean` comparing `cita.id`, `cita.estado`, `cita.inicio`, `cita.fin`, `cita._lane`, `cita._totalLanes`, `cita._nested`, `isSelected`, `isDragging`, `startHour`, `rowHeight`.
### Public Booking Slot Payload (`lib/reservaPublica.ts` & `tests/portal-reserva.spec.ts`)
- `SlotDisponible`: `{ slot: string; profesional_id: string; profesional_nombre: string; en_reposo: boolean; reposo_disponible_min: number | null }`

## Code Layout
- `web/assets/mecha-sections.css` — Landing sections styles & touch handling
- `web/index.html` — Landing page with CTAs, modals, Schema.org JSON-LD
- `web/llms.txt`, `web/llms-full.txt`, `llms.txt`, `llms-full.txt` — LLM GEO knowledge
- `components/agenda/AgendaCalendar.web.tsx` — Agenda calendar view
- `components/agenda/TimelineNowIndicator.web.tsx` — Dedicated isolated now-indicator
- `lib/hooks/useDebounce.ts` — Generic debouncing hook
- `app/(tabs)/citas.web.tsx` — CRM Appointments tab
- `app/(tabs)/clientes.web.tsx` — CRM Clients tab & Color Formulas modal
- `app/(tabs)/equipo.web.tsx` — Staff & Stylists tab
- `app/(tabs)/mi-jornada.web.tsx` — Staff shift clocking (Art. 34.9 ET) & personal dashboard
- `components/equipo/RendimientoEquipo.web.tsx` — Staff commission & performance component
- `web/salones.html`, `web/salon.html` — Marketplace directory & profile
- `app/r/[slug].web.tsx` — Public booking portal with chemical rest indicator & Turnstile captcha
- `tests/` — Playwright end-to-end test suites
