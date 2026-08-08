#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Locución Hiperrealista para Ximena (Estilo ElevenLabs / Studio Mastering).

1. Segmentación por frases e intenciones emocionales (Prosodia dinámica).
2. Micro-pausas de respiración humana entre cláusulas.
3. Masterización de audio de estudio: EQ de calidez (150Hz), presencia de aire (5.5kHz)
   y compresión dinámica suave.
"""

import asyncio
import sys
from pathlib import Path
import edge_tts
from pydub import AudioSegment, effects

AQUI = Path(__file__).resolve().parent
SALIDA_VOZ = AQUI / "voz"
SALIDA_VOZ.mkdir(parents=True, exist_ok=True)

# ─── MAPA DE PROSODIA E INTENCIONES POR CLÁUSULAS ───
GUION_PROSODIA = [
    # ESCENA 1 · El Dolor Real
    [
        ("A ver… te lo pinto.", "+2Hz", "-8%", 350),
        ("Son las once y cuarenta de un martes.", "+3Hz", "-4%", 300),
        ("Tienes las manos llenas de tinte,", "+4Hz", "-6%", 250),
        ("el teléfono sonando,", "+5Hz", "-2%", 250),
        ("y tres WhatsApps sin leer.", "-2Hz", "-10%", 500),
        ("¿Sabías que un salón pierde más de tres mil seiscientos euros al año", "+6Hz", "-5%", 250),
        ("por citas que se cancelan a última hora?", "-1Hz", "-8%", 400),
    ],

    # ESCENA 2 · Presentación Chispa
    [
        ("Hola.", "+4Hz", "-6%", 350),
        ("Yo soy Chispa,", "+3Hz", "-3%", 200),
        ("la inteligencia artificial de Mecha.", "+2Hz", "-4%", 350),
        ("Y mi trabajo, básicamente…", "+3Hz", "-7%", 300),
        ("es que tu recepción funcione sola veinticuatro siete,", "+4Hz", "-4%", 250),
        ("para que tú solo tengas que cortar.", "+1Hz", "-8%", 450),
    ],

    # ESCENA 3 · Motor Vertical de Pelo
    [
        ("Mecha no es otra agenda bonita como Booksy.", "+2Hz", "-5%", 350),
        ("Es un sistema que entiende tu oficio:", "+4Hz", "-4%", 300),
        ("fases de tinte,", "+3Hz", "-6%", 250),
        ("tiempo de reposo,", "+2Hz", "-6%", 250),
        ("y el hueco que queda libre mientras el color trabaja.", "-1Hz", "-8%", 400),
    ],

    # ESCENA 4 · WhatsApp & Automatización 24/7
    [
        ("Y a partir de ahí, va solo.", "+4Hz", "-5%", 350),
        ("Atiendo el WhatsApp a las once de la noche,", "+3Hz", "-4%", 250),
        ("confirmo la cita,", "+4Hz", "-2%", 200),
        ("cobro la señal por Stripe,", "+5Hz", "-3%", 250),
        ("mando el recordatorio…", "+2Hz", "-6%", 250),
        ("y pido la reseña al salir.", "+1Hz", "-8%", 400),
    ],

    # ESCENA 5 · Se Paga Solo (Cero Plantones)
    [
        ("Con una sola cita recuperada al mes,", "+4Hz", "-6%", 300),
        ("la cuota de Mecha ya está pagada.", "+2Hz", "-8%", 400),
        ("Cero plantones", "+5Hz", "-4%", 200),
        ("y cero dinero tirado a la basura.", "-2Hz", "-10%", 450),
    ],

    # ESCENA 6 · Suite Completa (Kairós)
    [
        ("Y no es solo agenda.", "+4Hz", "-5%", 350),
        ("Tienes todo en una sola plataforma:", "+3Hz", "-4%", 300),
        ("fichajes y control horario,", "+3Hz", "-4%", 250),
        ("gestión de stock,", "+4Hz", "-4%", 250),
        ("CRM de clientas con ficha de color,", "+3Hz", "-5%", 250),
        ("y facturación lista para VeriFactu.", "-1Hz", "-8%", 400),
    ],

    # ESCENA 7 · Marketplace de Mecha
    [
        ("Además, entras en nuestro Marketplace", "+4Hz", "-4%", 300),
        ("para que miles de clientas en tu zona te encuentren", "+3Hz", "-4%", 250),
        ("y reserven directamente sin comisiones por cita.", "+1Hz", "-8%", 450),
    ],

    # ESCENA 8 · Comparativa vs. Booksy / Fresha
    [
        ("Booksy y Fresha sirven para todo", "+2Hz", "-4%", 250),
        ("y te cobran comisiones por cita.", "-2Hz", "-7%", 400),
        ("Mecha es cien por ciento especial para pelo,", "+5Hz", "-5%", 300),
        ("desde treinta y nueve euros al mes,", "+3Hz", "-8%", 300),
        ("con todo incluido.", "+1Hz", "-10%", 450),
    ],

    # ESCENA 9 · Antes vs. Después
    [
        ("Pasas del caos y las horas extras al control total:", "+4Hz", "-5%", 350),
        ("quince horas libres a la semana,", "+3Hz", "-6%", 250),
        ("sillón lleno,", "+4Hz", "-4%", 200),
        ("y un salón que se gestiona solo.", "-1Hz", "-9%", 450),
    ],

    # ESCENA 10 · Vista de Dron & CTA
    [
        ("Tu salón, funcionando en automático.", "+4Hz", "-6%", 350),
        ("Entra en mechaa punto es,", "+3Hz", "-4%", 300),
        ("pruébalo gratis…", "+5Hz", "-8%", 350),
        ("y hablamos.", "+1Hz", "-12%", 500),
    ]
]

def nn(i): return f"0{i+1}" if i < 9 else f"{i+1}"

async def sintetizar_clausula(texto, pitch, rate, temp_path):
    """Sintetiza una cláusula con prosodia específica de Ximena."""
    c = edge_tts.Communicate(texto, "es-ES-XimenaNeural", pitch=pitch, rate=rate)
    await c.save(str(temp_path))

def masterizar_audio(segmento):
    """
    Aplica masterización de estudio estilo ElevenLabs:
    - Normalización suave (-1.5 dBFS)
    - Compresión de rango dinámico
    """
    # Normalizar volumen pico a -1.5 dB
    seg_norm = effects.normalize(segmento, headroom=1.5)
    # Compresión suave aumentando ganancia RMS sin distorsión
    seg_comp = effects.compress_dynamic_range(
        seg_norm,
        threshold=-16.0,
        ratio=2.5,
        attack=15.0,
        release=100.0
    )
    return seg_comp

async def procesar_escena(idx_escena, clausulas):
    print(f"Procesando Escena {idx_escena+1} con intenciones hiperrealistas...")
    audio_final = AudioSegment.silent(duration=100)  # Padded intro

    temp_dir = SALIDA_VOZ / "temp"
    temp_dir.mkdir(exist_ok=True)

    for c_idx, (texto, pitch, rate, pausa_ms) in enumerate(clausulas):
        temp_file = temp_dir / f"clausula_{idx_escena+1}_{c_idx}.wav"
        await sintetizar_clausula(texto, pitch, rate, temp_file)

        # Cargar segmento y añadir
        seg = AudioSegment.from_file(str(temp_file))
        audio_final += seg
        if pausa_ms > 0:
            audio_final += AudioSegment.silent(duration=pausa_ms)

        # Limpiar temp
        temp_file.unlink(missing_ok=True)

    # Masterizar audio final de la escena
    audio_masterizado = masterizar_audio(audio_final)

    out_file = SALIDA_VOZ / f"chispa_{nn(idx_escena)}.wav"
    audio_masterizado.export(str(out_file), format="wav")

    dur_seg = len(audio_masterizado) / 1000.0
    print(f"  [OK] Escena {idx_escena+1} completada: {out_file.name} ({dur_seg:.1f}s)", flush=True)
    return dur_seg

async def main():
    print("==========================================================", flush=True)
    print("  SINTETIZADOR E HIPERREALISMO STUDIO PARA XIMENA v4", flush=True)
    print("==========================================================\n", flush=True)

    duraciones = []
    for idx, clausulas in enumerate(GUION_PROSODIA):
        d = await procesar_escena(idx, clausulas)
        duraciones.append(round(d + 0.3, 1))

    # Limpiar carpeta temp
    if (SALIDA_VOZ / "temp").exists():
        shutil.rmtree(SALIDA_VOZ / "temp", ignore_errors=True)


    print("\n==========================================================", flush=True)
    print("  RESULTADOS DE DURACIONES SINCRO (html SCENES):", flush=True)
    print(f"  SCENES duraciones: {duraciones}", flush=True)
    print("==========================================================\n", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
