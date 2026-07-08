"""Prueba ChatTTS. AVISO: solo soporta chino/ingles oficialmente -- se
espera pronunciacion incorrecta con texto en espanol. Se prueba igualmente
por completitud a peticion expresa.
"""
import time
import torch
import soundfile as sf
import ChatTTS

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

print(f"[INFO] cuda disponible: {torch.cuda.is_available()}")

inicio = time.perf_counter()
chat = ChatTTS.Chat()
chat.load(source="huggingface", compile=False)
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("11b_chattts", TEXTO), ("11b_chattts_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    wavs = chat.infer([texto])
    sf.write(f"audios_prueba/{nombre}.wav", wavs[0].squeeze(), 24000)
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
