"""Prueba Bark (Suno AI). Modelo expresivo (risas, pausas); descarga ~5GB
de pesos la primera vez. Licencia del codigo MIT; verificar si se usa en
produccion (los pesos no tienen una licencia de modelo tan explicita como
XTTS/fish-speech, pero Suno no ofrece garantia de uso comercial oficial).
"""
import time
import torch
from bark import SAMPLE_RATE, generate_audio, preload_models
from scipy.io.wavfile import write as write_wav

TEXTO = (
    "Hola, soy el asistente virtual de Mecha. Hoy tendremos una cita de tinte y "
    "corte a las tres de la tarde con Maria Garcia. El servicio durara "
    "aproximadamente dos horas y tiene un precio de cuarenta y cinco euros. "
    "Te parece bien si te confirmo la cita?"
)
TEXTO_EXPRESIVO = (
    "[risas] Perfecto! Bueno, pues eso es todo por hoy. Necesitas algo mas? "
    "[suspiro] Vale, hasta luego."
)

print(f"[INFO] cuda disponible: {torch.cuda.is_available()}")

inicio = time.perf_counter()
preload_models()
print(f"[INFO] Modelos precargados en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("09b_bark", TEXTO), ("09b_bark_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    audio_array = generate_audio(texto, history_prompt="v2/es_speaker_1")
    write_wav(f"audios_prueba/{nombre}.wav", SAMPLE_RATE, audio_array)
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
