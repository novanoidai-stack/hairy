#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de locución v4 para Chispa (Mecha motion v3).
7 escenas, ~85s. Reemplaza a generar_voz_v5_fluida.py (que era de 10 escenas).
edge_tts es-ES-XimenaNeural + normalizacion pydub. Imprime SCENES para el HTML.
"""
import asyncio
from pathlib import Path
import edge_tts
from pydub import AudioSegment, effects

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "voz"
SALIDA.mkdir(parents=True, exist_ok=True)

LINEAS_V4 = [
    "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, el teléfono sonando, y tres WhatsApps sin leer.",
    "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo es que eso no te vuelva a pasar.",
    "Mecha no es otra agenda bonita. Entiende tu oficio: fase activa, tiempo de reposo, y el hueco que recuperas mientras el color trabaja.",
    "El WhatsApp y el teléfono los llevo yo. De día y de noche: doy precios, confirmo la cita, cobro la señal… y tú sigues cortando.",
    "Tu clienta reserva desde el portal en un clic y deja la señal. Ahí se acaban los plantones.",
    "¿Y las agendas genéricas? Sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte, y la IA te la cobran aparte. Mecha es cien por cien pelo, desde treinta y nueve euros al mes, sin comisiones.",
    "El resultado: tu salón, funcionando solo. Entra en mechaa punto es, pruébalo gratis… y hablamos.",
]

def nn(i): return f"0{i+1}" if i < 9 else f"{i+1}"

async def generar():
    print("==========================================================", flush=True)
    print("  GENERANDO LOCUCIÓN v4 (7 ESCENAS) — Ximena", flush=True)
    print("==========================================================\n", flush=True)
    duraciones = []
    for i, texto in enumerate(LINEAS_V4):
        t = texto.replace("WhatsApp", "guasap")  # pronunciacion fonetica
        out = SALIDA / f"chispa_{nn(i)}.wav"
        for intento in range(3):
            try:
                c = edge_tts.Communicate(t, "es-ES-XimenaNeural", pitch="+1Hz", rate="+3%")
                await c.save(str(out))
                break
            except Exception as e:
                print(f"  [AVISO] Reintentando escena {i+1} ({intento+1}/3): {e}", flush=True)
                await asyncio.sleep(1)
        seg = AudioSegment.from_file(str(out))
        seg_norm = effects.normalize(seg, headroom=1.5)
        seg_norm.export(str(out), format="wav")
        dur = len(seg_norm) / 1000.0
        duraciones.append(round(dur + 0.3, 1))  # +0.3s de aire al final
        print(f"  [OK] chispa_{nn(i)}.wav ({dur:.1f}s)", flush=True)
    print("\n==========================================================", flush=True)
    print(f"  SCENES = {duraciones}")
    print(f"  TOTAL = {sum(duraciones):.1f}s")
    print("==========================================================\n", flush=True)

if __name__ == "__main__":
    asyncio.run(generar())
