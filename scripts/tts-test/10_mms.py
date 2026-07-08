"""Prueba MMS (Meta) via transformers. AVISO: licencia CC-BY-NC-4.0
(no comercial) -- descartada para Mecha de raiz, se prueba solo por
completitud a peticion expresa.
"""
import time
import scipy.io.wavfile
import torch
from transformers import VitsModel, AutoTokenizer

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

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[INFO] device={device}")

inicio = time.perf_counter()
model = VitsModel.from_pretrained("facebook/mms-tts-spa").to(device)
tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-spa")
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("10_mms", TEXTO), ("10_mms_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    inputs = tokenizer(texto, return_tensors="pt").to(device)
    with torch.no_grad():
        output = model(**inputs).waveform
    scipy.io.wavfile.write(
        f"audios_prueba/{nombre}.wav",
        rate=model.config.sampling_rate,
        data=output.squeeze().cpu().numpy(),
    )
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
