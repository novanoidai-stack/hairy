"""Prueba Coqui XTTS v2 (voice cloning). AVISO: pesos bajo licencia CPML,
uso NO comercial salvo licencia de pago (Coqui Inc. cerro en 2024, sin via
para comprarla) -- se prueba solo por completitud, no es viable para Mecha.
"""
import time
import torch
from TTS.api import TTS

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
REF_WAV = "reference_voice.wav"

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[INFO] device={device}")

inicio = time.perf_counter()
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("07_coqui_xtts", TEXTO), ("07_coqui_xtts_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    tts.tts_to_file(
        text=texto,
        speaker_wav=REF_WAV,
        language="es",
        file_path=f"audios_prueba/{nombre}.wav",
    )
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
