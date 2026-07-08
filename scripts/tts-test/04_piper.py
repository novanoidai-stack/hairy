"""Prueba Piper (TTS local ligero, ONNX, sin GPU)."""
import time
import wave
from piper import PiperVoice

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
voice = PiperVoice.load("voices/es_ES-davefx-medium.onnx")
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("05_piper", TEXTO), ("05_piper_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    with wave.open(f"audios_prueba/{nombre}.wav", "wb") as wav_file:
        voice.synthesize_wav(texto, wav_file)
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
