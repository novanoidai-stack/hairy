// components/onboarding/OnboardingAgentOverlay.tsx
// Paridad nativa fuera de alcance (spec 2026-07-03, seccion 7): el asistente
// de onboarding con IA es web-only por ahora. La version real vive en
// OnboardingAgentOverlay.web.tsx; Metro elige el fichero correcto segun
// plataforma porque app/_layout.tsx importa sin sufijo de plataforma.
export function OnboardingAgentOverlay() {
  return null;
}
