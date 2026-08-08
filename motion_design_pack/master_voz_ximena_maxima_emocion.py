#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Máxima Emoción, Expresividad y Musicalidad para Ximena.

- Micro-respiraciones humanas antes de giros emocionales.
- Entonaciones retóricas, preguntas de asombro y sonrisas en la voz.
- Cambios dinámicos de ritmo y tono según la escena (Caos vs Solución vs Triunfo).
- Masterización de audio de estudio con compresión y brillo vocal.
"""

import asyncio
import sys
from pathlib import Path
import edge_tts
from pydub import AudioSegment, effects

AQUI = Path(__file__).resolve().parent
SALIDA_VOZ = AQUI / "voz"
SALIDA_VOZ.mkdir(parents=True, exist_ok=True)

# ─── MUESTRA DE RESPIRACIÓN HUMANA SUAVE ───
BREATH = AudioSegment.from_file(str(AQUI / "soft_breath.wav")).high_pass_filter(320).low_pass_filter(2100) - 22

# ─── GUION v4 CON MÁXIMA EXPRESIVIDAD Y PROSODIA EMOCIONAL ───
# Estructura: (Texto, Pitch, Rate, Pausa_ms, Tiene_Respiracion)
GUION_EMOCIONAL = [
    # ESCENA 1 · El Dolor Real (Gancho Dramático & Pregunta Retórica)
    [
        ("A ver… te lo pinto.", "+2Hz", "-8%", 300, True),
        ("Son las once y cuarenta de un martes.", "+3Hz", "-4%", 250, False),
        ("Tienes las manos llenas de tinte,", "+4Hz", "-6%", 200, False),
        ("el teléfono sonando,", "+6Hz", "-1%", 200, False),
        ("y tres WhatsApps sin leer.", "-3Hz", "-11%", 450, True),
        ("¿Sabías que un salón pierde más de tres mil seiscientos euros al año", "+7Hz", "-4%", 250, True),
        ("por citas que se cancelan a última hora?", "-1Hz", "-9%", 400, False),
    ],

    # ESCENA 2 · Presentación Chispa (Cálida, Sonriente, Cercana)
    [
        ("¡Hola!", "+5Hz", "-5%", 300, True),
        ("Yo soy Chispa,", "+4Hz", "-3%", 200, False),
        ("la inteligencia artificial de Mecha.", "+3Hz", "-4%", 350, False),
        ("Y mi trabajo, básicamente…", "+4Hz", "-7%", 300, True),
        ("es que tu recepción funcione sola veinticuatro siete,", "+5Hz", "-3%", 250, False),
        ("para que tú solo tengas que cortar.", "+1Hz", "-8%", 450, False),
    ],

    # ESCENA 3 · Motor Vertical (Orgullo del Oficio & Pregunta Retórica)
    [
        ("Mecha no es otra agenda bonita como Booksy.", "+2Hz", "-5%", 350, True),
        ("Es un sistema que entiende tu oficio:", "+4Hz", "-3%", 300, False),
        ("fases de tinte,", "+3Hz", "-6%", 250, False),
        ("tiempo de reposo,", "+2Hz", "-6%", 250, False),
        ("y el hueco que queda libre mientras el color trabaja.", "-1Hz", "-9%", 450, True),
    ],

    # ESCENA 4 · WhatsApp 24/7 (Dinámica, Enérgica, Ágil)
    [
        ("Y a partir de ahí, ¡va solo!", "+5Hz", "-3%", 350, True),
        ("Atiendo el WhatsApp a las once de la noche,", "+4Hz", "-3%", 250, False),
        ("confirmo la cita,", "+5Hz", "-2%", 200, False),
        ("cobro la señal por Stripe,", "+6Hz", "-2%", 200, False),
        ("mando el recordatorio…", "+3Hz", "-6%", 250, False),
        ("y pido la reseña al salir.", "+1Hz", "-8%", 400, True),
    ],

    # ESCENA 5 · Se Paga Solo (Asombro & Rotundidad Financiera)
    [
        ("Con una sola cita recuperada al mes,", "+5Hz", "-5%", 300, True),
        ("¡la cuota de Mecha ya está pagada!", "+6Hz", "-6%", 400, False),
        ("Cero plantones", "+5Hz", "-3%", 200, False),
        ("y cero dinero tirado a la basura.", "-3Hz", "-11%", 450, True),
    ],

    # ESCENA 6 · Suite Completa (Confianza & Amplitud)
    [
        ("Y no es solo agenda.", "+4Hz", "-5%", 350, True),
        ("Tienes todo en una sola plataforma:", "+3Hz", "-4%", 300, False),
        ("fichajes y control horario,", "+4Hz", "-3%", 250, False),
        ("gestión de stock,", "+4Hz", "-3%", 250, False),
        ("CRM de clientas con ficha de color,", "+3Hz", "-5%", 250, False),
        ("y facturación lista para VeriFactu.", "-1Hz", "-8%", 400, True),
    ],

    # ESCENA 7 · Marketplace (Atracción & Entusiasmo)
    [
        ("Además, entras en nuestro Marketplace", "+5Hz", "-4%", 300, True),
        ("para que miles de clientas en tu zona te encuentren", "+4Hz", "-3%", 250, False),
        ("y reserven directamente sin comisiones por cita.", "+1Hz", "-8%", 450, True),
    ],

    # ESCENA 8 · Comparativa Directa (Contraste Retórico)
    [
        ("Booksy y Fresha sirven para todo", "+2Hz", "-4%", 250, True),
        ("y te cobran comisiones por cita.", "-2Hz", "-8%", 400, False),
        ("Mecha es cien por ciento especial para pelo,", "+6Hz", "-4%", 300, True),
        ("desde treinta y nueve euros al mes,", "+3Hz", "-8%", 300, False),
        ("con todo incluido.", "+1Hz", "-10%", 450, False),
    ],

    # ESCENA 9 · Antes vs. Después (Triunfo & Liberación)
    [
        ("Pasas del caos y las horas extras al control total:", "+5Hz", "-4%", 350, True),
        ("quince horas libres a la semana,", "+4Hz", "-5%", 250, False),
        ("sillón lleno,", "+5Hz", "-3%", 200, False),
        ("y un salón que se gestiona solo.", "-1Hz", "-9%", 450, True),
    ],

    # ESCENA 10 · Vista de Dron & Cierre Distinguido
    [
        ("Tu salón, funcionando en automático.", "+4Hz", "-6%", 350, True),
        ("Entra en mechaa punto es,", "+3Hz", "-4%", 300, False),
        ("pruébalo gratis…", "+5Hz", "-8%", 350, False),
        ("y hablamos.", "+1Hz", "-12%", 500, True),
    ]
]

def nn(i): return f"0{i+1}" if i < 9 else f"{i+1}"

async def sintetizar_clausula(texto, pitch, rate, temp_path):
    c = edge_tts.Communicate(texto, "es-ES-XimenaNeural", pitch=pitch, rate=rate)
    await c.save(str(temp_path))

def masterizar_audio(segmento):
    seg_norm = effects.normalize(segmento, headroom=1.2)
    seg_comp = effects.compress_dynamic_range(
        seg_norm,
        threshold=-15.0,
        ratio=2.8,
        attack=12.0,
        release=90.0
    )
    return seg_comp

async def procesar_escena(idx_escena, clausulas):
    print(f"Procesando Escena {idx_escena+1} con máxima expresividad y respiraciones...", flush=True)
    audio_final = AudioSegment.silent(duration=80)

    temp_dir = SALIDA_VOZ / "temp"
    temp_dir.mkdir(exist_ok=True)

    for c_idx, (texto, pitch, rate, pausa_ms, tiene_resp) in enumerate(clausulas):
        temp_file = temp_dir / f"c_{idx_escena+1}_{c_idx}.wav"
        await sintetizar_clausula(texto, pitch, rate, temp_file)

        seg = AudioSegment.from_file(str(temp_file))

        # Insertar respiración humana suave antes de la cláusula si está indicado
        if tiene_resp and c_idx > 0:
            audio_final += BREATH

        audio_final += seg
        if pausa_ms > 0:
            audio_final += AudioSegment.silent(duration=pausa_ms)

        temp_file.unlink(missing_ok=True)

    audio_masterizado = masterizar_audio(audio_final)
    out_file = SALIDA_VOZ / f"chispa_{nn(idx_escena)}.wav"
    audio_masterizado.export(str(out_file), format="wav")

    dur_seg = len(audio_masterizado) / 1000.0
    print(f"  [OK] Escena {idx_escena+1} masterizada: {out_file.name} ({dur_seg:.1f}s)", flush=True)
    return dur_seg

async def main():
    print("==========================================================", flush=True)
    print("  EXPRESIVIDAD MÁXIMA Y MUSICALIDAD VOCAL PARA XIMENA v4", flush=True)
    print("==========================================================\n", flush=True)

    duraciones = []
    for idx, clausulas in enumerate(GUION_EMOCIONAL):
        d = await procesar_escena(idx, clausulas)
        duraciones.append(round(d + 0.3, 1))

    if (SALIDA_VOZ / "temp").exists():
        import shutil
        shutil.rmtree(SALIDA_VOZ / "temp", ignore_errors=True)

    print("\n==========================================================", flush=True)
    print("  SCENES DURACIONES MASTERIZADAS CON EXPRESIVIDAD:")
    print(f"  SCENES = {duraciones}")
    print("==========================================================\n", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
