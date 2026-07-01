// Edge function: Validar token de reCAPTCHA v3
// POST /functions/v1/validate-captcha
// Body: { token: string }
// Returns: { valid: boolean, score: number, error?: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RECAPTCHA_SECRET_KEY = Deno.env.get('RECAPTCHA_SECRET_KEY') || '';

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
