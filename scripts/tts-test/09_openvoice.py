"""Prueba OpenVoice V2 (voice cloning, licencia MIT desde abril 2024).
Base speaker en espanol via MeloTTS + conversion de tono hacia la voz de
referencia (reference_voice.wav, muestra de la voz actual de ElevenLabs).
"""
import time
import torch
from openvoice import se_extractor
from openvoice.api import ToneColorConverter
from melo.api import TTS

CKPT_DIR = "openvoice-repo/checkpoints_v2"
REF_WAV = "reference_voice.wav"

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

device = "cuda:0" if torch.cuda.is_available() else "cpu"
print(f"[INFO] device={device}")

inicio = time.perf_counter()
tone_color_converter = ToneColorConverter(f"{CKPT_DIR}/converter/config.json", device=device)
tone_color_converter.load_ckpt(f"{CKPT_DIR}/converter/checkpoint.pth")

target_se, _ = se_extractor.get_se(REF_WAV, tone_color_converter, vad=True)
source_se = torch.load(f"{CKPT_DIR}/base_speakers/ses/es.pth", map_location=device)

base_tts = TTS(language="ES", device=device)
speaker_id = base_tts.hps.data.spk2id["ES"]
print(f"[INFO] Modelos cargados en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("09_openvoice", TEXTO), ("09_openvoice_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    tmp_wav = f"audios_prueba/_tmp_{nombre}.wav"
    base_tts.tts_to_file(texto, speaker_id, tmp_wav, speed=1.0)
    tone_color_converter.convert(
        audio_src_path=tmp_wav,
        src_se=source_se,
        tgt_se=target_se,
        output_path=f"audios_prueba/{nombre}.wav",
        message="@MyShell",
    )
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
