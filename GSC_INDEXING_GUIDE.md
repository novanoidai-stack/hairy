# Guía de configuración e indexación SEO + AIO para Mecha OS (`www.mechaa.es`)

Guía paso a paso para dar de alta Mecha en **Google Search Console (GSC)**, indexar todas las páginas (landing, marketplace, fichas de salón, páginas de nicho/módulo/comparativa y de ciudad) y aparecer como referencia en los **modelos de IA** (ChatGPT, Claude, Gemini, Perplexity).

Está alineada con el código real del repositorio (`scripts/seo/`, `scripts/generate-sitemap.mjs`, `vercel.json`, `web/`).

---

## Ficha técnica de la infraestructura SEO/AIO

- **Dominio canónico**: `https://www.mechaa.es/` (con `www`).
- **Apex** (`mechaa.es`) y **dominio técnico de Vercel** (`hairy-two.vercel.app`): redirigidos al canónico (permanente).
- **DNS / WAF**: Cloudflare. **Hosting/Edge**: Vercel. **BD de salones**: Supabase (RPC `buscar_salones_publico` y `salon_directorio_publico`).
- **Sitemap**: `https://www.mechaa.es/sitemap.xml` (dinámico, se regenera en cada deploy).
- **robots.txt**: `https://www.mechaa.es/robots.txt`.
- **Manifiestos AIO**: `https://www.mechaa.es/llms.txt` y `https://www.mechaa.es/llms-full.txt`.

### Qué páginas existen hoy (inventario)

| Tipo | Ejemplo de URL | Cómo se genera |
| :--- | :--- | :--- |
| Landing principal | `/` | `web/index.html` |
| Especificaciones | `/especificaciones.html` | `web/especificaciones.html` |
| Directorio | `/salones` | `web/salones.html` (rewrite) |
| Calculadora | `/calculadora-comisiones` | `web/calculadora-comisiones.html` (rewrite) |
| **Landings de nicho/módulo/comparativa** | `/software-barberia`, `/verifactu-peluqueria`, `/alternativa-booksy`… | `scripts/seo/generate-landing-pages.mjs` |
| **Páginas de ciudad** | `/peluquerias-en-a-coruna` | `scripts/seo/generate-city-pages.mjs` |
| **Fichas de salón** | `/salon/<slug>` | `scripts/seo/prerender-salons.mjs` (HTML estático con canonical propio) |
| Privadas (no indexar) | `/admin.html`, `/restablecer.html`, `/app/*` | bloqueadas en `robots.txt` + `noindex` |

> Las landings, ciudades y fichas son **HTML estático prerenderizado en build** (no dependen de JS para el SEO). El source-of-truth vive en `scripts/seo/`; el HTML resultante es un artefacto de build (gitignorado) que se regenera con `npm run generate:seo`.

---

## 1. Alta de la propiedad en Google Search Console

### 1.1 Propiedad de Dominio (la obligatoria)

Crea una **Propiedad de Dominio** (`mechaa.es`), no de prefijo de URL. Motivo: agrega en una sola vista `http/https`, `www`/apex y cualquier subdominio futuro, sin fragmentar métricas.

1. Entra en [Google Search Console](https://search.google.com/search-console) → desplegable de propiedades → **Añadir propiedad**.
2. Selecciona la columna **Dominio**.
3. Introduce exactamente `mechaa.es` (sin `http`, `https` ni `www`).
4. Pulsa **Continuar**. Aparecerá la cadena `google-site-verification=…`.

### 1.2 (Opcional) Propiedad de prefijo como diagnóstico secundaria

Puedes añadir además `https://www.mechaa.es/` (prefijo) verificada con la metaetiqueta/archivo HTML para diagnóstico puntual. No es necesaria para indexar.

---

## 2. Verificación DNS con registro TXT en Cloudflare

1. Entra en el [Dashboard de Cloudflare](https://dash.cloudflare.com/) → zona `mechaa.es` → **DNS → Registros**.
2. **Añadir registro**:
   - **Tipo**: `TXT`
   - **Nombre**: `@`
   - **Contenido**: el token `google-site-verification=…` completo.
   - **TTL**: `Auto` o `1 min`.
   - **Proxy status**: **Solo DNS (Nube Gris)** — **crítico**: si lo pones naranja, la verificación puede fallar.

3. Verifica que es público antes de pulsar **Verificar**:

   ```powershell
   # Windows (PowerShell/CMD)
   nslookup -type=TXT mechaa.es
   ```
   ```bash
   # Linux / macOS / Git Bash
   dig mechaa.es TXT +short
   ```

   Debes ver la cadena `"google-site-verification=…"`. Si no aparece, espera 2–5 min y reintenta.

4. Vuelve a GSC → **Verificar** → verde **"Se ha verificado la propiedad"**.

---

## 3. Dominio, redirecciones y SSL en Vercel

1. **Vercel → Proyecto → Settings → Domains**: añade `www.mechaa.es` y mácalo como **Primary Domain**.
2. **Redirecciones al canónico** (consolidación de equidad de enlaces):
   - El apex `mechaa.es` → `https://www.mechaa.es/` (gestionado en Vercel como *Primary Domain*).
   - `hairy-two.vercel.app` → `https://www.mechaa.es/:path*` (permanente, ya en `vercel.json`).

   Matriz esperada: `http://mechaa.es`, `https://mechaa.es` y `http://www.mechaa.es` → **301/308** → `https://www.mechaa.es/`.

3. **SSL/TLS**: Vercel emite y renueva automáticamente el certificado. La cabecera **HSTS** (`max-age=63072000; includeSubDomains; preload`) está en `vercel.json`, junto con CSP, `X-Content-Type-Options`, `Referrer-Policy`, etc.

---

## 4. Sitemap dinámico y pipeline de build SEO

### 4.1 Enviar el sitemap en GSC

1. GSC → propiedad `mechaa.es` → **Sitemaps** (Indexación).
2. Escribe `sitemap.xml` y pulsa **Enviar** (URL resultante: `https://www.mechaa.es/sitemap.xml`).
3. Estados esperados: **"Éxito"** en verde; **URLs detectadas** = estáticas + landings + ciudades + salones activos.

### 4.2 Cómo se genera el sitemap (alineado al código real)

El sitemap **no es estático**. Se genera en build con `scripts/generate-sitemap.mjs`, que:

- Lee la anon key pública desde `.env` (`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`); si no hay `.env` o Supabase no responde, cae a un fallback para no romper el build.
- Llama por `fetch` a la RPC `buscar_salones_publico` con `{ p_limit: 1000 }` (sin librería `createClient`; usa la anon key con RLS).
- Enumera: estáticas + las 8 landings (`scripts/seo/pages.mjs`) + páginas de ciudad (`agruparPorCiudad`) + fichas de salón (`/salon/<slug>`).

Prioridades y frecuencias reales:

| Ruta | priority | changefreq |
| :--- | :---: | :---: |
| `/` | 1.0 | weekly |
| `/salones` | 0.9 | daily |
| `/especificaciones.html` | 0.8 | monthly |
| `/calculadora-comisiones` | 0.8 | monthly |
| `/software-barberia`, `/verifactu-peluqueria`, `/alternativa-booksy`… (8) | 0.8 | monthly |
| `/peluquerias-en-<ciudad>` | 0.7 | weekly |
| `/salon/<slug>` | 0.8 | weekly |

> Nota: `lastmod` se fija a la fecha de build. Si más adelante la RPC expone `updated_at` por salón, se puede propagar para un `lastmod` más informativo.

### 4.3 Pipeline de build (`package.json`)

```
build:web = expo export -p web --output-dir web/app
            && node scripts/postbuild-web.mjs
            && node scripts/generate-seo.mjs
            && node scripts/generate-sitemap.mjs
```

- `generate-seo` genera las **fichas prerender**, las **páginas de ciudad** y las **landings** con un único fetch a Supabase.
- `generate-sitemap` enumera todas las URLs resultantes.
- Vercel ejecuta `build:web` en cada deploy, así que cada salón/ciudad/landing nuevo queda en `sitemap.xml` automáticamente.

Para regenerar todo en local sin rebuild completo:

```bash
npm run generate:seo      # fichas + ciudades + landings
npm run generate:sitemap  # sitemap.xml
```

### 4.4 Por qué las fichas de salón ahora son SEO-perfectas

Antes, `/salon/<slug>` servía siempre el mismo `salon.html` con un **canonical genérico** (`/salon`) → contenido duplicado. Ahora cada salón se **prerenderiza** como `web/salon/<slug>/index.html` con `canonical`, `title`, `meta description`, OG y `LocalBusiness/HairSalon` JSON-LD **propios**. Vercel sirve el archivo estático **antes** que el rewrite, así Google ve el HTML correcto sin esperar a JS.

Para slugs **no prerenderizados** (añadidos tras el último deploy), el rewrite sirve `salon.html` y `salon-directorio.js` actúa como **red de seguridad**: fija canonical/meta/OG por slug en runtime e inyecta `noindex` si el salón no existe (evita soft-404 indexables). En el siguiente deploy, ese salón queda prerenderizado.

---

## 5. Inspección de URLs y solicitud manual de indexación

### 5.1 Flujo por URL

Para cada URL: pégala en la barra superior de GSC → si no está indexada → **Probar URL en directo** → verifica:

- **"La URL se puede indexar"** en verde y HTTP 200.
- **HTML renderizado** (*Ver página probada*): el DOM está completo.
- **Canónica declarada** = `https://www.mechaa.es/…` exacta (sin `/salon` genérico en fichas).
- **Datos estructurados** detectados sin errores (`SoftwareApplication`, `LocalBusiness`/`HairSalon`, `Organization`, `BreadcrumbList`, `FAQPage`, `ItemList`).

Luego → **Solicitar indexación**.

### 5.2 Rutas prioritarias a inspeccionar (en este orden)

1. `/` — landing principal.
2. `/especificaciones.html` — catálogo de módulos (ahora con H1, FAQ y `ItemList`).
3. `/salones` — directorio.
4. `/alternativa-booksy` y `/alternativa-fresha` — comparativas de alto valor.
5. `/verifactu-peluqueria`, `/agenda-inteligente-peluqueria`, `/fichaje-legal-peluqueria`, `/reducir-no-shows-peluqueria` — módulos estrella.
6. `/software-barberia` y `/software-estetica` — nichos.
7. `/peluquerias-en-<ciudad>` — una ciudad representativa.
8. `/salon/<slug>` — una ficha real (verifica que la canónica lleva el slug).

> Google limita la solicitud manual de indexación a un cupo diario razonable; prioriza las 4–6 primeras y deja que el sitemap tyre del resto.

---

## 6. Monitoreo, renderizado móvil y resultados enriquecidos

### 6.1 Cobertura de indexación

- **Páginas indexadas**: debe crecer conforme se añadan salones/ciudades.
- **No indexadas (excluidas)**: solo deben aparecer `/admin.html`, `/restablecer.html` y `/app/*`. Ninguna página pública (landing/ciudad/ficha) debe estar excluida.

### 6.2 Mobile-First y Core Web Vitals

- **Usabilidad móvil**: sin avisos de texto pequeño o elementos juntos.
- **Core Web Vitals**: LCP < 2.5s, INP < 200ms, CLS < 0.1. (Las páginas generadas son ligeras y enlazan `directorio.css` cacheado 1 año.)

### 6.3 Resultados enriquecidos (JSON-LD implementados)

- `SoftwareApplication` + `Product`/Offers (landing) y `WebSite` con *SearchAction* (caja de búsqueda en sitelinks).
- `FAQPage` (landing y especificaciones) → elegible para rich results de preguntas.
- `ItemList` (especificaciones) y `CollectionPage` + `ItemList` (directorio y ciudades).
- `LocalBusiness`/`HairSalon` (fichas, con `aggregateRating` solo si hay reseñas, `geo` si hay coordenadas).
- `BreadcrumbList` (todas las páginas públicas).
- `Organization` y `speakable` (para respuestas por voz/IA).

### 6.4 Matriz de alertas comunes

| Alerta en GSC | Causa | Solución |
| :--- | :--- | :--- |
| **Soft 404** | Slug inexistente sin prerender | Ya mitigado: la red de seguridad inyecta `noindex`. Si aparece, reenvía el sitemap y reindexa tras un deploy. |
| **Canónica distinta de la indicada** | Contenido duplicado o canonical genérico | Las fichas ya tienen canonical por slug. Verifica con *Probar URL en directo*. |
| **Página bloqueada por noindex** | Un `noindex` en página pública | Solo `/admin`, `/restablecer` y `/app/*` deben llevarlo. Revisa que ninguna landing/ciudad/ficha lo tenga (`node scripts/audit-seo-indexing.mjs` lo comprueba). |
| **Error en JSON-LD** | Falta campo obligatorio | Usa el *Rich Results Test* de Google con la URL en directo. |
| **DNS / host no alcanzable** | WAF de Cloudflare bloqueando Googlebot | Asegura que los registros de verificación están en *Solo DNS* y que el WAF no bloquea los rangos IP de Google. |

---

## 7. AIO: aparecer en ChatGPT, Claude, Gemini y Perplexity

El **AIO (AI Optimization)** complementa al SEO: que los modelos de lenguaje conozcan Mecha y lo citen. La base está en dos ficheros públicos en la raíz:

- `https://www.mechaa.es/llms.txt` — resumen conciso (estándar [llmstxt.org](https://llmstxt.org/)): qué es Mecha, módulos clave, páginas y precios. Es la "carta de presentación" que los LLMs leen al indexar el dominio.
- `https://www.mechaa.es/llms-full.txt` — volcado exhaustivo en prosa de los 21 dominios de módulos, diferenciadores vs Booksy/Fresha, nichos, precios y migración. Es lo que los modelos asimilan como conocimiento.

**Cómo verificar que los LLMs te conocen** (haz estas pruebas reales, sin pagar):

1. **Perplexity** (usa búsqueda en vivo + modelos): pregunta *"¿qué es Mecha OS?"* y *"mejor alternativa a Booksy para peluquerías en España"*. Debe citar `mechaa.es` y describir los módulos.
2. **ChatGPT / Claude / Gemini**: pregunta *"¿qué software con IA recomiendas para una peluquería en España?"* y *"¿cómo cumple VeriFactu una peluquería?"*. Si aún no te citan, es normal los primeros días: los modelos refrescan su índice web periódicamente.
3. **Comprueba la indexación**: `curl https://www.mechaa.es/llms.txt` debe devolver el manifiesto; verifica que `llms.txt` y `llms-full.txt` estén accesibles (HTTP 200) y enlazados conceptualmente desde la home.

**Acelerar el conocimiento de los LLMs:**

- Que `llms.txt` y `llms-full.txt` sean públicos y estables (ya lo son).
- Mantén coherencia: lo que dicen `llms.txt`, `llms-full.txt`, el JSON-LD (`SoftwareApplication`, `featureList`) y el contenido visible debe contar **la misma historia** (así lo diseñé en este trabajo).
- Consigue menciones/enlaces externos (reseñas, foros de peluquería, directorios): los modelos ponderan mucho la mención cruzada en fuentes de terceros.
- Cuando pongas contenido nuevo relevante (un módulo, una comparativa), actualiza también `llms-full.txt` (el source-of-truth está en `scripts/seo/` y `web/llms-*.txt`).

> **Importante:** los LLMs no "envían" nada desde GSC. La indexación de IA depende de que los rastreadores de cada modelo (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) accedan a tu web. Como tu `robots.txt` es `Allow: /` para `User-agent: *`, ya los dejas entrar. No añadas reglas que los bloqueen.

---

## 8. Mantenimiento periódico

1. **Mensual**: comprueba que el nº de URLs indexadas crece con los salones/ciudades activos en Supabase.
2. **Semanal**: revisa *Cobertura* y corrige 5xx/404 no intencionados.
3. **Antes de cada release a producción**:
   ```bash
   npm run generate:seo
   npm run generate:sitemap
   node scripts/audit-seo-indexing.mjs      # debe quedar 100% verde (20/20)
   node scripts/test-sitemap-challenger.mjs # estrés de red/env del sitemap (21/21)
   ```
4. **Tras añadir un salón/ciudad nuevo**: basta con un deploy (`build:web` regenera fichas, ciudades y sitemap). El nuevo salón aparecerá prerenderizado e indexable.

---

## 9. Checklist de puesta en marcha (resumen)

- [ ] Alta de **Propiedad de Dominio** `mechaa.es` en GSC.
- [ ] Registro **TXT** en Cloudflare (Solo DNS / nube gris) y **Verificar**.
- [ ] `www.mechaa.es` como **Primary Domain** en Vercel; apex y `hairy-two.vercel.app` redirigiendo al canónico.
- [ ] Enviar **`sitemap.xml`** y confirmar "Éxito".
- [ ] **Inspeccionar y solicitar indexación** de las rutas prioritarias (§5.2).
- [ ] Verificar **`llms.txt`** y **`llms-full.txt`** responden 200 (AIO).
- [ ] Probar en **Perplexity** y **ChatGPT/Claude/Gemini** que Mecha se describe correctamente.
- [ ] `node scripts/audit-seo-indexing.mjs` en verde antes de cada release.

---
*Documento alineado con el código de Mecha OS (`www.mechaa.es`).*
