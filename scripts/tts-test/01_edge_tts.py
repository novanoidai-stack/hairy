"""Prueba edge-tts (opcion gratuita, usa la API online de Microsoft Edge)."""
import asyncio
import time
import edge_tts

TEXTO = (
    "Hola, soy el asistente virtual de Mecha. Hoy tendremos una cita de tinte y "
    "corte a las tres de la tarde con Maria Garcia. El servicio durara "
    "aproximadamente dos horas y tiene un precio de cuarenta y cinco euros. "
    "Te parece bien si te confirmo la cita?"
)
TEXTO_EXPRESIVO = (
    "Perfecto! Bueno, pues eso es todo por hoy. Necesitas algo mas? "
    "Vale, hasta luego."
)
VOZ = "es-ES-ElviraNeural"


async def generar(texto: str, salida: str):
    inicio = time.perf_counter()
    communicate = edge_tts.Communicate(texto, VOZ)
    await communicate.save(salida)
    return time.perf_counter() - inicio


async def main():
    t1 = await generar(TEXTO, "audios_prueba/14_edge_tts.mp3")
    t2 = await generar(TEXTO_EXPRESIVO, "audios_prueba/14_edge_tts_expresivo.mp3")
    print(f"[OK] edge-tts principal: {t1:.2f}s")
    print(f"[OK] edge-tts expresivo: {t2:.2f}s")


if __name__ == "__main__":
    asyncio.run(main())
