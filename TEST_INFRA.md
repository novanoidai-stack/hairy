# E2E Test Infra: Mecha OS SEO Optimization & GSC Indexing

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinations + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| F1 | Meta Robots & Indexability Configuration | R1 | 5 | 5 | ✓ | ✓ |
| F2 | Canonical Links Integration | R3 | 5 | 5 | ✓ | ✓ |
| F3 | Dynamic Sitemap Generator & XML Structure | R2 | 5 | 5 | ✓ | ✓ |
| F4 | Robots.txt Crawler Directives & Sitemap | R2 | 5 | 5 | ✓ | ✓ |
| F5 | JSON-LD Structured Data Schemas | R3 | 5 | 5 | ✓ | ✓ |
| F6 | Interactive Google Search Console Guide | R4 | 3 | 3 | ✓ | ✓ |
| F7 | Automated Verification Script | R5 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Node.js ESM script (`scripts/test-e2e-seo.mjs` / `scripts/audit-seo-indexing.mjs`)
- **Invocation**: `node scripts/test-e2e-seo.mjs`
- **Pass/Fail Semantics**: Exit code 0 on 100% test pass; Exit code 1 on any test failure.
- **Directory Layout**:
  - `web/`: HTML pages, `sitemap.xml`, `robots.txt`
  - `scripts/test-e2e-seo.mjs`: Comprehensive E2E test runner executing Tiers 1-4
  - `scripts/generate-sitemap.mjs`: Sitemap generator
  - `scripts/audit-seo-indexing.mjs`: Continuous audit script

## Detailed Test Case Matrix

### Tier 1: Feature Coverage (≥5 per feature)
- **T1.1.1 - Meta Robots Public Pages**: Verify `<meta name="robots" content="index, follow">` in `index.html`, `especificaciones.html`, `calculadora-comisiones.html`, `salones.html`, `salon.html`.
- **T1.1.2 - Meta Robots Private Pages**: Verify `<meta name="robots" content="noindex, nofollow">` in `admin.html`, `restablecer.html`, and `web/app/index.html`.
- **T1.2.1 - Canonical Links Domain**: Verify `<link rel="canonical">` tags point to canonical HTTPS domain (`https://www.mechaa.es/...`) for all 5 public pages.
- **T1.3.1 - Sitemap XML Structure**: Verify `sitemap.xml` is valid XML with `<urlset>`, `<url>`, `<loc>`, `<priority>`, and `<changefreq>`.
- **T1.4.1 - Robots.txt Directives**: Verify `robots.txt` contains `Allow: /`, `Disallow: /admin.html`, `Disallow: /restablecer.html`, `Disallow: /app/`, and `Sitemap: https://www.mechaa.es/sitemap.xml`.
- **T1.5.1 - JSON-LD Syntax Validation**: Extract and `JSON.parse()` all `<script type="application/ld+json">` elements across all 5 public HTML files.
- **T1.5.2 - JSON-LD Schema Types**: Verify presence of `@type` declarations: `SoftwareApplication`, `Organization`, `LocalBusiness` / `HairSalon`, `BreadcrumbList`, `WebApplication` across target pages.

### Tier 2: Boundary & Corner Cases (≥5 per feature)
- **T2.1.1 - Noindex Contamination Guard**: Ensure no public HTML page accidentally contains `noindex`.
- **T2.2.1 - Missing Canonical Attribute Guard**: Ensure all public HTML files explicitly contain `rel="canonical"` and non-empty `href`.
- **T2.2.2 - HTTP vs HTTPS Protocol Guard**: Verify canonical URLs explicitly use `https://` protocol and `www.mechaa.es` domain (no `http://` or raw IP or localhost).
- **T2.3.1 - Sitemap Trailing / Formatting Guard**: Verify no invalid trailing slashes or malformed URLs in `sitemap.xml`.
- **T2.5.1 - Invalid JSON-LD Syntax Guard**: Ensure no trailing commas, unescaped characters, or malformed JSON blocks exist in script tags.
- **T2.5.2 - Mandatory Schema Properties**: Validate schema objects contain `@context: "https://schema.org"` and mandatory fields (e.g. `name`, `url`, `itemListElement`).

### Tier 3: Cross-Feature Combinations
- **T3.1.1 - Sitemap & Canonical URL Parity**: Every URL listed in `sitemap.xml` MUST match the exact canonical URL of the corresponding HTML page/route.
- **T3.1.2 - Robots.txt & Sitemap URL Parity**: The `Sitemap:` directive in `robots.txt` MUST match the exact URL location where `sitemap.xml` is served (`https://www.mechaa.es/sitemap.xml`).
- **T3.1.3 - Private Route Exclusion Parity**: Routes disallowed in `robots.txt` (`/app/`, `/admin.html`) MUST NOT be present in `sitemap.xml` and MUST have `noindex` in HTML meta tags.

### Tier 4: Real-World Application Scenarios
- **T4.1.1 - Complete Site Crawler Simulation**: Simulate Googlebot crawling public URLs (`/`, `/especificaciones.html`, `/calculadora-comisiones`, `/salones`, `/salon/:slug`) verifying HTTP headers, meta robots, canonical links, and schema parsing in one unified pipeline.
- **T4.1.2 - Dynamic Salon Slug Resolution**: Test dynamic salon slug injection (`/salon/florent-suarez-peluqueros`) ensuring dynamic JSON-LD injection script constructs valid Schema.org `LocalBusiness` data.

## Pass/Fail Criteria
- 100% of tests across Tiers 1, 2, 3, and 4 must pass. Zero errors, zero malformed JSON-LD, zero missing canonicals or bad robots directives.
