"""Prueba MeloTTS (multi-idioma, licencia MIT)."""
import time
from melo.api import TTS

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
tts = TTS(language="ES", device="auto")
speaker_id = tts.hps.data.spk2id["ES"]
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("06_melotts", TEXTO), ("06_melotts_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    tts.tts_to_file(texto, speaker_id, f"audios_prueba/{nombre}.wav")
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
