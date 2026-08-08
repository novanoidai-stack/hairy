#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de Locución Ampliada y Fluida v8 para Ximena.

- Intro de Chispa anunciando los 4 pasos principales.
- Atención 24/7 explícita por Teléfono y WhatsApp.
- Exposición de todas las páginas de Mecha en la Suite Completa.
- Comparativa potente y rotunda vs Booksy/Fresha (Comisiones del 20%, VeriFactu).
"""

import asyncio
import sys
from pathlib import Path
import edge_tts
from pydub import AudioSegment, effects

AQUI = Path(__file__).resolve().parent
SALIDA_VOZ = AQUI / "voz"
SALIDA_VOZ.mkdir(parents=True, exist_ok=True)

LINEAS_V8 = [
    # S1 (11.5s)
    "Martes, once y cuarenta. Manos llenas de tinte, teléfono sonando y WhatsApps sin responder. "
    "¿Sabías que un salón pierde más de tres mil seiscientos euros al año por citas canceladas a última hora?",

    # S2 (11.0s)
    "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Te cuento en cuatro pasos cómo transformamos tu salón: "
    "el dolor de los plantones, la atención veinticuatro siete por teléfono y WhatsApp, la suite completa y tu salón funcionando solo.",

    # S3 (7.5s)
    "Mecha entiende tu oficio: fases de tinte, tiempo de reposo y el hueco que recuperas mientras el color trabaja.",

    # S4 (8.5s)
    "Atiendo las llamadas y los WhatsApps las veinticuatro horas: informo de precios, confirmo citas, cobro la señal por Stripe y pido reseñas al salir.",

    # S5 (6.8s)
    "Con una sola cita recuperada al mes, la cuota de Mecha de treinta y nueve euros ya está cien por ciento pagada.",

    # S6 (9.5s)
    "Tienes todas las páginas de tu negocio en una sola plataforma: agenda de tinte, fichajes de personal, control de stock, CRM de clientas, caja diaria, estadísticas y facturación VeriFactu.",

    # S7 (6.5s)
    "Además, entras en nuestro Marketplace para que nuevas clientas te encuentren en tu ciudad y reserven sin comisiones por cita.",

    # S8 (8.5s)
    "Booksy y Fresha te cobran hasta un veinte por ciento de comisión y no tienen VeriFactu ni fases de tinte. Mecha es cien por ciento para pelo, desde treinta y nueve euros al mes con todo incluido.",

    # S9 (6.5s)
    "Pasas del caos a quince horas libres a la semana, cero plantones y un salón que factura en automático.",

    # S10 (5.5s)
    "Tu salón, funcionando solo. Entra en mechaa punto es, pruébalo gratis y hablamos."
]

def nn(i): return f"0{i+1}" if i < 9 else f"{i+1}"

async def generar():
    print("==========================================================", flush=True)
    print("  GENERANDO LOCUCIÓN v8 DE XIMENA (4 PASOS & SUITE COMPLETA)", flush=True)
    print("==========================================================\n", flush=True)

    duraciones = []
    for i, texto in enumerate(LINEAS_V8):
        t_clean = texto.replace("WhatsApp", "guasap").replace("WhatsApps", "guasaps").replace("VeriFactu", "veri factu")
        out_file = SALIDA_VOZ / f"chispa_{nn(i)}.wav"

        for intento in range(3):
            try:
                c = edge_tts.Communicate(t_clean, "es-ES-XimenaNeural", pitch="+1Hz", rate="+3%")
                await c.save(str(out_file))
                break
            except Exception as e:
                print(f"  [AVISO] Reintentando escena {i+1} ({intento+1}/3)... Error: {e}", flush=True)
                await asyncio.sleep(1)

        seg = AudioSegment.from_file(str(out_file))
        seg_norm = effects.normalize(seg, headroom=1.5)
        seg_norm.export(str(out_file), format="wav")

        dur = len(seg_norm) / 1000.0
        duraciones.append(round(dur + 0.3, 1))
        print(f"  [OK] Escena {i+1} generada: {out_file.name} ({dur:.1f}s)", flush=True)

    print("\n==========================================================", flush=True)
    print("  SCENES DURACIONES EXACTAS FLUIDAS:")
    print(f"  SCENES = {duraciones}")
    print(f"  DURACIÓN TOTAL VÍDEO: {sum(duraciones):.1f}s")
    print("==========================================================\n", flush=True)

if __name__ == "__main__":
    asyncio.run(generar())
