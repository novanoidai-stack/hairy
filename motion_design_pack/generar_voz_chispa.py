#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera la locucion hiperrealista de Chispa para MECHA_motion_v2.html.

Soporta los mejores motores SOTA de GitHub y APIs de voz hiperrealista:
 1. --motor edge (Gratis, sin GPU): Microsoft Neural Prosody (es-ES-XimenaNeural, es-US-PalomaNeural)
 2. --motor xtts (GitHub: coqui-ai/TTS): Clonación hiperrealista con 5s de audio de referencia.
 3. --motor f5 (GitHub: jpgallegoar/F5-Spanish): Flow Matching hiperrealista.
 4. --motor fish (GitHub: fishaudio/fish-speech): Voz conversacional con respiración y tono.
 5. --motor elevenlabs (API ElevenLabs): El estándar de oro comercial.
 6. --motor openai (API OpenAI TTS): tts-1-hd con voz conversacional (nova/shimmer/alloy).

USO RECOMENDADO LOCAL (sin GPU):
    python generar_voz_chispa.py --motor edge --voz es-ES-XimenaNeural --pitch +2Hz --velocidad 0.96

USO CON CLONACIÓN SOTA DE GITHUB (con WAV de referencia):
    python generar_voz_chispa.py --motor xtts --referencia mi_voz_referencia.wav
"""

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "voz"

LINEAS = [
    "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, "
    "el teléfono sonando, y tres WhatsApps sin leer. ¿Sabías que un salón pierde más de tres mil seiscientos "
    "euros al año por citas que se cancelan a última hora?",

    "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo, básicamente, "
    "es que tu recepción funcione sola veinticuatro siete, para que tú solo tengas que cortar.",

    "Mecha no es otra agenda bonita como Booksy. Es un sistema que entiende tu oficio: fases de tinte, "
    "tiempo de reposo, y el hueco que queda libre mientras el color trabaja.",

    "Y a partir de ahí, va solo. Atiendo el WhatsApp a las once de la noche, confirmo la cita, "
    "cobro la señal por Stripe, mando el recordatorio… y pido la reseña al salir.",

    "Con una sola cita recuperada al mes, la cuota de Mecha ya está pagada. "
    "Cero plantones y cero dinero tirado a la basura.",

    "Y no es solo agenda. Tienes todo en una sola plataforma: fichajes y control horario, "
    "gestión de stock, CRM de clientas con ficha de color, y facturación lista para VeriFactu.",

    "Además, entras en nuestro Marketplace para que miles de clientas en tu zona "
    "te encuentren y reserven directamente sin comisiones por cita.",

    "Booksy y Fresha sirven para todo y te cobran comisiones por cita. Mecha es cien por ciento "
    "especial para pelo, desde treinta y nueve euros al mes, con todo incluido.",

    "Pasas del caos y las horas extras al control total: quince horas libres a la semana, "
    "sillón lleno, y un salón que se gestiona solo.",

    "Tu salón, funcionando en automático. Entra en mechaa punto es, pruébalo gratis… y hablamos.",
]

LIMITES = [14.0, 10.5, 12.5, 12.0, 9.5, 13.0, 11.5, 12.5, 10.0, 7.5]


PRONUNCIACION = {
    "Fresha": "Frecha",
    "Booksy": "Buksi",
    "WhatsApps": "guasaps",
    "WhatsApp": "guasap",
    "mechaa punto es": "mecha punto es",
}


def texto_para_tts(linea: str) -> str:
    for original, fonetico in PRONUNCIACION.items():
        linea = linea.replace(original, fonetico)
    return linea


def destino(i: int) -> Path:
    return SALIDA / f"chispa_{i + 1:02d}.wav"


def duracion(p: Path) -> float:
    try:
        from pydub import AudioSegment
        seg = AudioSegment.from_file(p)
        return len(seg) / 1000.0
    except Exception:
        try:
            import soundfile as sf
            info = sf.info(str(p))
            return info.frames / info.samplerate
        except Exception:
            return 0.0


# ─────────────────────────── MOTORES ───────────────────────────

def motor_edge(indices, args):
    """Edge-TTS Prosody · Microsoft Neural Azure (Ximena y Álvaro)."""
    try:
        import edge_tts
    except ImportError:
        sys.exit("Falta instalar: pip install edge-tts")

    voz_alias = (args.voz or "ximena").lower()
    if voz_alias in ["ximena", "xime", "femenina"]:
        voz = "es-ES-XimenaNeural"
        pitch = args.pitch or "+2Hz"
        rate_val = int((args.velocidad - 1.0) * 100)
    elif voz_alias in ["alvaro", "álvaro", "masculina", "chico"]:
        voz = "es-ES-AlvaroNeural"
        pitch = args.pitch or "+1Hz"
        rate_val = int((args.velocidad - 1.0) * 100)
    else:
        voz = args.voz
        pitch = args.pitch or "+2Hz"
        rate_val = int((args.velocidad - 1.0) * 100)

    rate_str = f"{rate_val:+d}%"
    print(f"[edge-tts] voz={voz} pitch={pitch} rate={rate_str}")

    async def _gen_one(i):
        texto = texto_para_tts(LINEAS[i])
        comm = edge_tts.Communicate(texto, voz, pitch=pitch, rate=rate_str)
        out_path = destino(i)
        await comm.save(str(out_path))

    for i in indices:
        asyncio.run(_gen_one(i))
        yield i, duracion(destino(i))



def motor_xtts(indices, args):
    """Coqui XTTS v2 (GitHub: coqui-ai/TTS) · Clonación SOTA de voz humana."""
    if not args.referencia:
        sys.exit("XTTS necesita --referencia mi_voz.wav (audio de 5-10s con la voz a clonar)")
    ref = Path(args.referencia).resolve()
    if not ref.exists():
        sys.exit(f"No se encuentra el archivo de referencia: {ref}")

    print(f"[xtts-v2] Clonando voz desde {ref.name}...")
    try:
        from TTS.api import TTS
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        for i in indices:
            texto = texto_para_tts(LINEAS[i])
            out_file = destino(i)
            tts.tts_to_file(text=texto, speaker_wav=str(ref), language="es", file_path=str(out_file))
            yield i, duracion(out_file)
    except ImportError:
        sys.exit("Falta instalar Coqui TTS: pip install TTS coqui-tts")


def motor_f5(indices, args):
    """F5-TTS (GitHub: SWivid/F5-TTS / jpgallegoar/F5-Spanish)."""
    if not args.referencia:
        sys.exit("F5 necesita --referencia referencia.wav")
    ref = Path(args.referencia).resolve()

    for i in indices:
        cmd = [
            "f5-tts_infer-cli",
            "--model", args.modelo or "jpgallegoar/F5-Spanish",
            "--ref_audio", str(ref),
            "--gen_text", texto_para_tts(LINEAS[i]),
            "--output_dir", str(SALIDA),
            "--output_file", destino(i).name,
        ]
        if args.texto_referencia:
            cmd += ["--ref_text", args.texto_referencia]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"f5-tts falló en la línea {i + 1}")
        yield i, duracion(destino(i))


def motor_fish(indices, args):
    """Fish Speech (GitHub: fishaudio/fish-speech) · Con pausas y respiración humana."""
    if not args.referencia:
        sys.exit("Fish necesita --referencia referencia.wav")
    ref = Path(args.referencia).resolve()

    for i in indices:
        cmd = ["fish-speech", "inference",
               "--text", texto_para_tts(LINEAS[i]),
               "--reference-audio", str(ref),
               "--output", str(destino(i))]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"fish-speech falló en línea {i + 1}")
        yield i, duracion(destino(i))


def motor_elevenlabs(indices, args):
    """API comercial de ElevenLabs (Multilingual v2)."""
    key = os.environ.get("ELEVENLABS_API_KEY") or args.api_key
    if not key:
        sys.exit("Falta la clave ELEVENLABS_API_KEY o --api-key")
    try:
        import requests
        voice_id = args.voz or "21m00Tcm4TlvDq8ikWAM"  # Voice ID por defecto (Rachel / Clara)
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {"Accept": "audio/mpeg", "Content-Type": "application/json", "xi-api-key": key}

        for i in indices:
            data = {
                "text": texto_para_tts(LINEAS[i]),
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.45, "similarity_boost": 0.85, "style": 0.2, "use_speaker_boost": True}
            }
            r = requests.post(url, json=data, headers=headers)
            if r.status_code == 200:
                out_path = destino(i)
                out_path.write_bytes(r.content)
                yield i, duracion(out_path)
            else:
                sys.exit(f"ElevenLabs error HTTP {r.status_code}: {r.text}")
    except ImportError:
        sys.exit("Falta instalar requests: pip install requests")


def motor_openai(indices, args):
    """API comercial de OpenAI TTS (tts-1-hd)."""
    key = os.environ.get("OPENAI_API_KEY") or args.api_key
    if not key:
        sys.exit("Falta la clave OPENAI_API_KEY o --api-key")
    try:
        import requests
        url = "https://api.openai.com/v1/audio/speech"
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        voice = args.voz or "nova"

        for i in indices:
            data = {"model": "tts-1-hd", "input": texto_para_tts(LINEAS[i]), "voice": voice}
            r = requests.post(url, json=data, headers=headers)
            if r.status_code == 200:
                out_path = destino(i)
                out_path.write_bytes(r.content)
                yield i, duracion(out_path)
            else:
                sys.exit(f"OpenAI TTS error HTTP {r.status_code}: {r.text}")
    except ImportError:
        sys.exit("Falta instalar requests: pip install requests")


def motor_kokoro(indices, args):
    """Kokoro-82M · Apache 2.0."""
    try:
        from kokoro import KPipeline
        import soundfile as sf
        import numpy as np
    except ImportError:
        sys.exit("Falta instalar: pip install kokoro soundfile numpy")

    pipeline = KPipeline(lang_code="e")
    voz = args.voz or "ef_dora"
    print(f"[kokoro] voz={voz}")

    for i in indices:
        trozos = []
        for _, _, audio in pipeline(texto_para_tts(LINEAS[i]), voice=voz, speed=args.velocidad):
            trozos.append(audio)
        wav = np.concatenate(trozos) if len(trozos) > 1 else trozos[0]
        sf.write(destino(i), wav, 24000)
        yield i, len(wav) / 24000.0


MOTORES = {
    "edge": motor_edge,
    "xtts": motor_xtts,
    "f5": motor_f5,
    "fish": motor_fish,
    "elevenlabs": motor_elevenlabs,
    "openai": motor_openai,
    "kokoro": motor_kokoro,
}


# ─────────────────────────── MAIN ───────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Locución hiperrealista de Chispa para Mecha")
    ap.add_argument("--motor", default="edge", choices=list(MOTORES))
    ap.add_argument("--voz", help="edge: es-ES-XimenaNeural | es-US-PalomaNeural | es-MX-DaliaNeural | es-ES-ElviraNeural")
    ap.add_argument("--pitch", default="+2Hz", help="Ajuste de tono (ej: +2Hz, +3Hz, -1Hz)")
    ap.add_argument("--referencia", help="WAV de 5-10s con la voz a clonar (xtts / f5 / fish)")
    ap.add_argument("--texto-referencia", help="Transcripción del audio de referencia")
    ap.add_argument("--modelo", help="Modelo específico para F5 o XTTS")
    ap.add_argument("--api-key", help="API Key para ElevenLabs u OpenAI")
    ap.add_argument("--velocidad", type=float, default=0.96)
    ap.add_argument("--solo", type=int, help="Generar solo una línea (1-10)")
    args = ap.parse_args()

    SALIDA.mkdir(exist_ok=True)
    indices = [args.solo - 1] if args.solo else list(range(len(LINEAS)))

    print(f"Generando {len(indices)} línea(s) con motor '{args.motor}' en {SALIDA}...\n")
    for i, dur in MOTORES[args.motor](indices, args):
        limite = LIMITES[i]
        marca = "OK" if dur <= limite else "SE PASA"
        print(f"  {destino(i).name}  {dur:5.1f}s / {limite}s  [{marca}]")

    print("\n¡Listo! Audios generados correctamente.")


if __name__ == "__main__":
    main()
