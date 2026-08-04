// Edge function: Validar token de reCAPTCHA v3
// POST /functions/v1/validate-captcha
// Body: { token: string }
// Returns: { valid: boolean, score: number, error?: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RECAPTCHA_SECRET_KEY = Deno.env.get('RECAPTCHA_SECRET_KEY') || '';

// Antes esta funcion solo respondia {valid, score} al navegador y no dejaba
// rastro, asi que llamar a crear_cita_publica directamente con la clave anonima
// —que es publica— se saltaba el captcha entero. Ahora, cuando Google da el
// token por bueno, se deja constancia en la BD y el RPC la consume (un solo uso,
// caduca a los 5 min). Ver migrations/p1-020-rate-limit-y-captcha-exigible.sql.
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface ValidateRequest {
  token: string;
}

interface ValidateResponse {
  valid: boolean;
  score?: number;
  error?: string;
}

serve(async (req) => {
  // Solo POST permitido
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ valid: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { token }: ValidateRequest = await req.json();

    // Validar que se envio el token
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return new Response(
        JSON.stringify({ valid: false, error: 'TOKEN_MISSING' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar con Google API
    const validateURL = 'https://www.google.com/recaptcha/api/siteverify';
    const params = new URLSearchParams();
    params.append('secret', RECAPTCHA_SECRET_KEY);
    params.append('response', token);

    const googleResponse = await fetch(validateURL, {
      method: 'POST',
      body: params,
    });

    const googleData = await googleResponse.json();

    if (!googleData.success) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'CAPTCHA_INVALID',
          details: googleData['error-codes'] || [],
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Score threshold: 0.5 (ajustable)
    const score = googleData.score || 0;
    const SCORE_THRESHOLD = 0.5;

    const isValid = score >= SCORE_THRESHOLD;

    // Constancia para que el RPC pueda comprobarlo. Solo si el token es bueno.
    // Si esto falla NO se tumba la respuesta: el navegador ya tiene su veredicto
    // y, mientras captcha_exigido siga en false, la reserva no depende de ello.
    if (isValid) {
      const { error } = await admin.rpc('registrar_captcha_validado', {
        p_token: token,
        p_score: score,
      });
      if (error) console.error('registrar_captcha_validado fallo:', error.message);
    }

    return new Response(
      JSON.stringify({
        valid: isValid,
        score: score,
        error: isValid ? undefined : 'SCORE_TOO_LOW',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error validating CAPTCHA:', error);
    return new Response(
      JSON.stringify({ valid: false, error: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
