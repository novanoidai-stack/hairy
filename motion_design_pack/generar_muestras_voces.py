#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera muestras de distintas voces hiperrealistas en español con variaciones de tono,
pausas y prosodia conversacional.

Crea muestras en voz/muestras/ para comparar:
 - Ximena (España · Joven, conversacional)
 - Abril (España · Expresiva, cálida)
 - Elvira (España · Profesional, explicativa)
 - Paloma (Español Neutro · Dinámica)
 - Dalia (México · Cercana, fluida)
"""

import asyncio
import edge_tts
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "voz" / "muestras"
SALIDA.mkdir(parents=True, exist_ok=True)

MUESTRAS_TEXTO = [
    ("linea1", "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte… el teléfono sonando… y tres guasaps sin leer."),
    ("linea2", "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo, básicamente… es que eso no te vuelva a pasar."),
    ("linea7", "¿Y Booksy o Frecha? Pues sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte… y su inteligencia artificial, o es un chat básico… o te la cobran aparte."),
]

VOCES = [
    ("es-ES-XimenaNeural", "+2Hz", "-3%"),
    ("es-ES-AbrilNeural", "+1Hz", "-2%"),
    ("es-ES-ElviraNeural", "+0Hz", "-4%"),
    ("es-US-PalomaNeural", "+2Hz", "-2%"),
    ("es-MX-DaliaNeural", "+1Hz", "-3%"),
]

async def generar():
    print(f"Generando muestras en {SALIDA}...\n")
    for nombre_linea, texto in MUESTRAS_TEXTO:
        for voz, pitch, rate in VOCES:
            try:
                c = edge_tts.Communicate(texto, voz, pitch=pitch, rate=rate)
                dest = SALIDA / f"{nombre_linea}_{voz.split('-')[2].replace('Neural','')}.wav"
                await c.save(str(dest))
                print(f"  [OK] Muestra generada: {dest.name}")
            except Exception as e:
                print(f"  [ERROR] {voz}: {e}")

if __name__ == "__main__":
    asyncio.run(generar())

