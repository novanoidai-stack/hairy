#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera la voz completa de Chispa para las 10 escenas del Guion v4
con Ximena (Femenina) y Álvaro (Masculina equivalente).
"""

import asyncio
import sys
from pathlib import Path
import edge_tts

AQUI = Path(__file__).resolve().parent
VOZ_DIR = AQUI / "voz"
DIR_XIMENA = VOZ_DIR / "ximena"
DIR_ALVARO = VOZ_DIR / "alvaro"

DIR_XIMENA.mkdir(parents=True, exist_ok=True)
DIR_ALVARO.mkdir(parents=True, exist_ok=True)

LINEAS = [
    "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, "
    "el teléfono sonando, y tres WhatsApps sin leer. ¿Sabías que un salón pierde más de tres mil seiscientos "
    "euros al año por citas que se cancelan a última hora?",

    "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo, básicamente, "
    "es que tu recepción funcione sola veinticuatro siete, para que tú solo tengas que cortar.",

    "Mecha no es otra agenda bonita como Booksy. Es un sistema que entiende tu oficio: fases de tinte, "
    "tiempo de reposo, y el hueco que queda libre mientras el color trabaja.",

    "Y a partir de ahí, va solo. Atiendo el WhatsApp a las once de la noche, confirmo la cita, "
    "cobro la señal por Stripe, mando el recordatorio… y pido la reseña al salir.",

    "Con una sola cita recuperada al mes, la cuota de Mecha ya está pagada. "
    "Cero plantones y cero dinero tirado a la basura.",

    "Y no es solo agenda. Tienes todo en una sola plataforma: fichajes y control horario, "
    "gestión de stock, CRM de clientas con ficha de color, y facturación lista para VeriFactu.",

    "Además, entras en nuestro Marketplace para que miles de clientas en tu zona "
    "te encuentren y reserven directamente sin comisiones por cita.",

    "Booksy y Fresha sirven para todo y te cobran comisiones por cita. Mecha es cien por ciento "
    "especial para pelo, desde treinta y nueve euros al mes, con todo incluido.",

    "Pasas del caos y las horas extras al control total: quince horas libres a la semana, "
    "sillón lleno, y un salón que se gestiona solo.",

    "Tu salón, funcionando en automático. Entra en mechaa punto es, pruébalo gratis… y hablamos.",
]

def nn(i): return f"0{i+1}" if i < 9 else f"{i+1}"

import shutil

async def generar():
    print("Generando locución completa de Ximena (Femenina)...")
    for i, texto in enumerate(LINEAS):
        c = edge_tts.Communicate(texto, "es-ES-XimenaNeural", pitch="+2Hz", rate="-4%")
        out_x = DIR_XIMENA / f"chispa_{nn(i)}.wav"
        out_def = VOZ_DIR / f"chispa_{nn(i)}.wav"
        await c.save(str(out_x))
        shutil.copy2(out_x, out_def)
        print(f"  [Ximena] Escena {i+1} OK -> {out_x.name}")

    print("\nGenerando locución completa de Álvaro (Masculina equivalente)...")
    for i, texto in enumerate(LINEAS):
        c = edge_tts.Communicate(texto, "es-ES-AlvaroNeural", pitch="+1Hz", rate="-3%")
        out_a = DIR_ALVARO / f"chispa_{nn(i)}.wav"
        await c.save(str(out_a))
        print(f"  [Álvaro] Escena {i+1} OK -> {out_a.name}")

    print("\n[OK] Generación de locuciones Ximena y Álvaro completada con éxito.")


if __name__ == "__main__":
    asyncio.run(generar())
