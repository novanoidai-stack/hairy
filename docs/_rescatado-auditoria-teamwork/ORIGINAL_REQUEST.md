# Original User Request

## 2026-08-07T14:59:46Z

# Teamwork Project Prompt

Build a comprehensive End-to-End (E2E) automated test suite that navigates through the production Mecha platform (Landing Page, Marketplace, and Software configuration), clicks every interactive element (buttons, dropdowns, config toggles), and verifies that no errors occur.

Working directory: C:/Users/carli/teamwork_projects/mecha_qa_audit
Integrity mode: development

## Requirements

### R1. Automated UI Crawler
Develop a robust automated test suite (using Playwright, Cypress, or similar) that systematically explores the production website (e.g., `https://www.mechaa.es` o la URL de producción).

### R2. Authenticated Deep Audit
The test suite must authenticate into the internal software dashboard using the provided credentials:
- **Email:** `carlitosocanamartinez@gmail.com`
- **Password:** `minicharlie2007`
Once logged in, it must thoroughly explore and interact with all settings and configuration panels.

### R3. Exhaustive Interaction
The script must not just "visit" pages; it must simulate a human by clicking every discoverable button, expanding every dropdown, and toggling every configuration switch to ensure the UI does not crash or throw unhandled exceptions.

## Acceptance Criteria

### Execution & Authenticity
- [ ] The test suite can be run with a single command from the working directory.
- [ ] The suite successfully authenticates into the production application using the provided credentials.

### Coverage
- [ ] The test suite covers the Landing Page.
- [ ] The test suite covers the Marketplace.
- [ ] The test suite covers the internal Software configuration menus.
- [ ] The tests actively click/interact with all discoverable UI elements in these sections.

### Reporting
- [ ] The team executes the test suite and provides a final QA report summarizing any broken buttons, dead links, or UI crashes encountered during the run.

## Follow-up — 2026-08-07T15:51:22Z

CRITICAL CORRECTION FROM USER: Please update your working directory. Do NOT use `C:/Users/carli/teamwork_projects/mecha_qa_audit`. Instead, you must use the following working directory for all tests and scripts: `C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy`

