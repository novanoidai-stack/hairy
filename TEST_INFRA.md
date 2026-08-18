# TEST INFRA: Mecha Guided Demo & Interactive System

## 1. Test Strategy & Philosophy
The Mecha Guided Demo test infrastructure provides an **opaque-box, requirement-driven, zero-dependency** validation suite. The testing philosophy enforces rigorous verification of functional correctness, boundary limits, cross-module integration, and end-to-end real-world workflows without coupling tests to ephemeral internal implementations.

### Core Testing Pillars:
1. **Opaque-Box Verification**: Every test validates observable user behaviors, DOM contracts, URL routing parameters, security gating, postMessage communication schemas, and backend response payloads.
2. **Deterministic & Isolated Execution**: Tests do not rely on uncontrolled external state or random race conditions. Tests execute in a predictable environment with sub-second execution speed.
3. **4-Tier Test Pyramid**:
   - **Tier 1: Feature Coverage** (≥5 test cases per feature across R1, R2, R3, R4, R5, R6)
   - **Tier 2: Boundary & Corner Cases** (≥5 test cases per feature: malformed email/phone, empty inputs, rapid step skipping, extreme screen sizes, session token absence)
   - **Tier 3: Cross-Feature Interactions** (pairwise integration flows covering landing -> auth -> demo -> tour tracks -> appointment -> client profile -> support modal)
   - **Tier 4: Real-World Workloads** (complete end-to-end salon owner journey across all 3 tracks, 15 app screens, and 10 configuration sections)

---

## 2. Feature Inventory & Coverage Matrix

| Requirement | Feature Description | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Interactions) | Tier 4 (Workloads) | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **R1** | Landing Gate & Post-Signup Auto-Redirect to Demo | 5 cases | 5 cases | 2 flows | 1 workload | **DEFINED** |
| **R2** | Cinematic Pitch-Black Intro Screen & Auto-Play | 5 cases | 5 cases | 1 flow | 1 workload | **DEFINED** |
| **R3** | Doubts Modal & Backend Email Pipeline | 5 cases | 5 cases | 1 flow | 1 workload | **DEFINED** |
| **R4** | Deep Dive: Appointment & Client Profile Fields | 5 cases | 5 cases | 1 flow | 1 workload | **DEFINED** |
| **R5** | Complete 3-Track Structured Tour (15 Screens & 10 Configs) | 5 cases | 5 cases | 2 flows | 1 workload | **DEFINED** |
| **R6** | High-FPS Fluid Transitions & Resilient Iframe Bridge | 5 cases | 5 cases | 1 flow | 1 workload | **DEFINED** |
| **TOTALS** | **Comprehensive E2E Suite** | **30 cases** | **30 cases** | **6 flows** | **1 full workload** | **READY** |

---

## 3. Test Architecture & Runner Setup

### Test Execution Engine
- **Primary Test Runner**: Node.js Native ESM Test Runner (`tests/e2e/runner.mjs`)
- **Playwright Test Suite**: `tests/e2e/demo.spec.ts` (invocable via `npx playwright test tests/e2e/demo.spec.ts`)
- **CLI Commands**:
  - `node tests/e2e/runner.mjs` (Full 4-tier automated suite)
  - `npm run test:e2e` (Playwright suite)

### Pass / Fail Semantics
- **Exit Code 0**: 100% tests passed, zero assertions failed, zero runtime exceptions.
- **Exit Code 1**: Any test failure, assertion mismatch, syntax error, or unhandled rejection.

### Directory & File Layout
```
Hairy/
├── TEST_INFRA.md                     # Test strategy, architecture, and feature checklist (this document)
├── TEST_READY.md                     # Readiness publication with execution instructions & coverage matrix
├── tests/
│   └── e2e/
│       ├── runner.mjs                # Master E2E runner orchestrating Tiers 1-4 with clear formatted output
│       ├── tier1-features.test.mjs   # Tier 1: Feature coverage (R1 to R6, >=5 tests per feature)
│       ├── tier2-boundaries.test.mjs # Tier 2: Boundary, corner cases & input fuzzing (>=5 per feature)
│       ├── tier3-interactions.test.mjs# Tier 3: Pairwise cross-feature flows & state synchronizations
│       ├── tier4-workloads.test.mjs  # Tier 4: Real-world salon owner end-to-end journey across all 3 tracks
│       └── demo.spec.ts              # Playwright browser integration suite
```

---

## 4. Detailed Specification of Test Tiers

### 4.1 Tier 1: Feature Coverage (≥5 Tests per Feature)

#### Requirement R1: Landing Gate & Post-Signup Auto-Redirect
- `T1.R1.1`: Landing CTAs point unauthenticated users to `/acceso.html?next=demo#signup` across `index.html`, `index_v4.html`, `index_v5.html`.
- `T1.R1.2`: Marketing copy removes obsolete "sin registrarte" / "sin registro" claims in favor of "Tu cuenta gratis con datos de prueba reales".
- `T1.R1.3`: `wantsDemo()` correctly checks query param `?next=demo` and `sessionStorage.mecha_intent_demo === '1'`.
- `T1.R1.4`: `routeAfterAuth()` in `acceso.html` executes `gotoDemo()` immediately for demo intent without trapping users in `#paneComplete`.
- `T1.R1.5`: Direct navigation to `demo.html` without session presents the account creation `#gate` overlay pointing to `acceso.html?next=demo#signup`.

#### Requirement R2: Cinematic Pitch-Black Intro Screen & Fluid Start
- `T1.R2.1`: `#intro` is styled with cinematic pitch-black backdrop (`#000` with subtle vignette) and dark contrast.
- `T1.R2.2`: Glowing `#mecha-mark` badge, subtitled typography, and real sample data statement are present.
- `T1.R2.3`: Total duration and track breakdown are accurately displayed ("≈ 10 min · 3 recorridos", 42 total steps).
- `T1.R2.4`: Clicking `#introGuided` ("Empezar recorrido guiado") dismisses `#intro` smoothly and boots the tour engine.
- `T1.R2.5`: Starting the guided tour triggers instantaneous auto-play playback (`startAutoplay()`) with pause icon state (`SVG_PAUSE`).

#### Requirement R3: Doubts Modal & Backend Email Pipeline
- `T1.R3.1`: `#dudasOverlay` contains `#dudasText`, contact input (`#dudasContacto` / `#dudasEmail`), submit button, reply container, error banner, and direct WhatsApp CTA (`https://wa.me/34690792975`).
- `T1.R3.2`: Contact validation accepts both valid emails (`user@domain.com`) and phone numbers (`+34 690 79 29 75`, `612345678`).
- `T1.R3.3`: Backend edge function `chispa-dudas-demo` supports fallback between `SMTP_*` and `EMAIL_*` environment variables.
- `T1.R3.4`: SMTP client uses dynamic TLS (`port === 465`) and branded sender header `Mecha <${from}>` with `replyTo: 'contacto@mechaa.es'`.
- `T1.R3.5`: Markdown formatting in email HTML template and UI reply correctly converts bold, links, and bullet points into styled HTML.

#### Requirement R4: Deep Dive into Appointment & Client Profile Fields
- `T1.R4.1`: Appointment chaining is detailed and spotlighted in order (`cita.grupo_id`, siblings badge, order).
- `T1.R4.2`: Chemical rest phases (Activo 1, Reposo / hueco productivo para atender a otro cliente, Activo 2) are spotlighted and explained.
- `T1.R4.3`: Inventory products linked to appointments with stock deductions and ticket additions are spotlighted.
- `T1.R4.4`: Client WhatsApp confirmation, status, and direct WhatsApp launch are spotlighted.
- `T1.R4.5`: Client profile technical tabs (color formulas, photos of work, allergy alerts, notes, visit history, loyalty tier) are navigated and spotlighted.

#### Requirement R5: Complete 3-Track Structured Tour (15 Screens & 10 Configs)
- `T1.R5.1`: Track 1 (Pilares Esenciales) contains 15 steps covering Agenda, Appointment creation, Client selection, Chaining, Time selection, Appointment detail, Status, 3 Rest phases, Color formulas, Technical notes, History, Loyalty summary, and Caja/TPV.
- `T1.R5.2`: Track 2 (Todas las Funciones Avanzadas) contains 10 steps covering Mi Jornada, Presupuestos/Bonos, Bandeja IA, Lista de Espera, Campañas Marketing, Reseñas Google, Equipo/Comisiones, Inventario, Informes PDF/CSV, and Ayuda.
- `T1.R5.3`: Track 3 (Nueva Configuración) contains 10 steps covering Identidad, Horarios, Catálogo/Reposos, Reglas Reserva, Comisiones, Plantillas, Notificaciones, Reserva Online/QR, Roles/Permisos, and Plan/Facturación.
- `T1.R5.4`: All 15 application tab screens (`index`, `clientes`, `caja`, `mi-jornada`, `presupuestos`, `bandeja`, `lista-espera`, `campanas`, `resenas`, `equipo`, `inventario`, `informes`, `ayuda`, `citas`, `configuracion`) are integrated across the 3 tracks.
- `T1.R5.5`: Track selector buttons (`#tutBtnGeneral`, `#tutBtnAdvanced`, `#tutBtnConfig`) switch active tracks, sync duration badges, and update dock progress.

#### Requirement R6: High-FPS Fluid Transitions & Resilient Iframe Bridge
- `T1.R6.1`: `.gt-spot` CSS uses GPU layer acceleration (`transform: translate3d`, `will-change: top, left, width, height, transform`) with 60/120fps cubic-bezier transitions.
- `T1.R6.2`: Sequence counter (`seq`) increments on every navigation event, canceling lingering timeouts and discarding stale async callbacks.
- `T1.R6.3`: postMessage communication between parent window and iframe verifies origin and handles `mecha-nav`, `mecha-demo`, and `mecha-spotlight`.
- `T1.R6.4`: Modal grouping (`groupOf(a)`) prevents premature modal closures during internal sub-step transitions while cleanly closing modals across group changes.
- `T1.R6.5`: Keyboard navigation (ArrowRight, ArrowLeft, Escape) pauses autoplay and respects open modals (`#dudasOverlay`, `#shareModalOverlay`).

---

### 4.2 Tier 2: Boundary & Corner Cases (≥5 Tests per Feature)
- `T2.1`: Validation rejects malformed emails (`missing-at.com`, `user@.com`, `user@domain`, `spaces in@email.com`) and malformed phone numbers (`123`, `abc-def`, `+00 12345`).
- `T2.2`: Validation handles empty strings, whitespace-only inputs, single-character queries, and 5,000-character payload stress tests.
- `T2.3`: Rapid step skipping (fuzzing 20 fast-forward clicks in <100ms) maintains sequential integrity without orphaned modals or broken states.
- `T2.4`: Responsive viewport extremes (320px ultra-mobile, 375px mobile, 768px tablet, 1440px desktop, 3840px 4K wide) render without horizontal overflow.
- `T2.5`: Session token absence, corrupted session JSON, tampered `sessionStorage`, and expired JWT safely redirect or show `#gate`.
- `T2.6`: postMessage bridge handles `null` rect, negative bounds, zero dimensions, and missing payload properties gracefully.

---

### 4.3 Tier 3: Cross-Feature Interactions (Pairwise Integration Flows)
- `T3.1`: **Landing CTA -> Registration Flow -> Auto-Redirect -> Demo Shell**: Unauthenticated user clicks demo CTA on landing, completes registration with `?next=demo`, and is immediately redirected to `demo.html`.
- `T3.2`: **Direct Demo Access -> Gate Overlay -> Signup -> Demo Entry**: Direct visit to `demo.html` without session presents `#gate`, and clicking signup leads to `acceso.html?next=demo#signup`.
- `T3.3`: **Cinematic Intro -> Guided Start -> Auto-Play Track 1**: User enters demo, interacts with pitch-black intro, clicks start, and Track 1 begins autoplay autonomously.
- `T3.4`: **Track 1 Appointment Flow -> Client Profile Deep Dive -> Caja Checkout**: Sequential traversal through appointment creation, rest time scheduling, linked inventory, color formulation, and POS payment.
- `T3.5`: **In-Tour Doubt Modal Submission -> AI Response -> Seamless Tour Resume**: Open doubt modal during playback, submit question with phone contact, receive AI reply, close modal, and resume tour without losing step position.
- `T3.6`: **Mid-Flight Track Switching -> Dynamic Chapter & Progress Resync**: Switch between Track 1, Track 2, and Track 3 during playback, verifying chapter recalculation and progress resetting.

---

### 4.4 Tier 4: Real-World Application Workloads
- `T4.1`: **Full End-to-End Salon Owner Onboarding Journey**:
  - Complete simulation of a salon owner arriving at `index.html`.
  - Navigating to `acceso.html?next=demo#signup` and registering a new account.
  - Automatically landing inside `demo.html`.
  - Dismissing the Cinematic Pitch-Black Intro and experiencing all 15 steps of Track 1 (Pilares Esenciales).
  - Experiencing all 10 steps of Track 2 (Funciones Avanzadas).
  - Experiencing all 10 steps of Track 3 (Nueva Configuración).
  - Exercising all 15 app screens and all 10 configuration sections.
  - Submitting a technical doubt via `#dudasOverlay` with Spanish phone number `+34 690 79 29 75`.
  - Receiving AI answer and completing the full tour with 100% pass verification.

---

## 5. Verification & Acceptance Criteria
- 100% of test assertions across Tiers 1-4 must execute and pass cleanly.
- Zero runtime crashes or unhandled promise rejections.
- Output from `node tests/e2e/runner.mjs` must provide clear per-tier progress, execution metrics, and an exit code of 0.
