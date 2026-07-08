"""Prueba Kokoro-82M via el paquete pip directo (sin Docker). Licencia
Apache-2.0 -- candidato solido para produccion si el soporte de espanol
via misaki/espeak resulta viable.
"""
import time
import soundfile as sf
from kokoro import KPipeline

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

inicio = time.perf_counter()
pipeline = KPipeline(lang_code="e")
print(f"[INFO] Pipeline cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("06b_kokoro", TEXTO), ("06b_kokoro_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    audio_chunks = []
    for _, _, audio in pipeline(texto, voice="ef_dora"):
        audio_chunks.append(audio)
    import numpy as np
    full_audio = np.concatenate(audio_chunks) if len(audio_chunks) > 1 else audio_chunks[0]
    sf.write(f"audios_prueba/{nombre}.wav", full_audio, 24000)
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
