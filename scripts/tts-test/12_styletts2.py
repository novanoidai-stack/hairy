"""Prueba StyleTTS2 con fine-tune comunitario en espanol (FenixDS, no
oficial, licencia no especificada por el autor -- verificar antes de usar
en produccion). El proyecto original (yl4579) no publica checkpoint en
espanol.
"""
import time
from styletts2 import tts

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
model = tts.StyleTTS2(
    model_checkpoint_path="styletts2-es/epoch_2nd_00049.pth",
    config_path="styletts2-es/config_spanish_ft.yml",
)
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("12_styletts2", TEXTO), ("12_styletts2_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    model.inference(texto, output_wav_file=f"audios_prueba/{nombre}.wav")
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
