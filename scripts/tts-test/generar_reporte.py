"""Genera un reporte HTML reproducible con todos los audios de prueba
disponibles en audios_prueba/. Se puede re-ejecutar en cualquier momento
para incorporar audios nuevos sin tocar el resto del reporte.
"""
import os
from pathlib import Path

AUDIOS_DIR = Path(__file__).parent / "audios_prueba"

# Ordenado de mas a menos natural/humana al oido (juicio propio al generarlas).
# metadata: prefijo -> (nombre, licencia, espanol, comercial_ok, notas)
TECNOLOGIAS = [
    ("07_coqui_xtts", "Coqui XTTS v2", "CPML (pesos)", "Nativo, la mas humana del lote", "Ignorado por decision expresa -- CPML es no comercial y Coqui cerro en 2024 (sin via de pagar licencia)", ""),
    ("09_openvoice", "OpenVoice V2", "MIT (desde abr-2024)", "Nativo + clona la voz actual de ElevenLabs", "Si", ""),
    ("06_melotts", "MeloTTS", "MIT", "Nativo (ES)", "Si", ""),
    ("06b_kokoro", "Kokoro-82M (desplegado en VPS)", "Apache-2.0", "Nativo (1F/2M, menos datos que EN)", "Si -- EN PRODUCCION", ""),
    ("05_piper", "Piper", "MIT", "Nativo (es_ES/es_MX)", "Si", ""),
    ("14_edge_tts", "edge-tts", "API no oficial de Microsoft Edge", "Nativo", "Zona gris (API no documentada oficialmente)", ""),
    ("08_yourtts", "YourTTS", "CC-BY-NC", "NO soportado -- el checkpoint publico solo trae en/fr-fr/pt-br", "Descartada por idioma ademas de licencia", ""),
    ("10_mms", "MMS (Meta)", "CC-BY-NC-4.0", "Nativo (checkpoint dedicado es)", "Ignorado por decision expresa (aun asi CC-BY-NC)", ""),
    ("09b_bark", "Bark (Suno)", "MIT (codigo)", "Nativo, muy expresivo", "No se completo (descarga de pesos sin terminar)", ""),
    ("11b_chattts", "ChatTTS", "-", "NO soportado (solo ZH/EN)", "Descartada por idioma", ""),
    ("11_speecht5", "SpeechT5 (Microsoft)", "MIT", "NO soportado oficialmente (solo EN)", "Descartada por idioma", ""),
    ("12_styletts2", "StyleTTS2", "MIT (codigo)", "Checkpoint comunitario incompatible (torch.load bloqueado)", "No se completo", ""),
    ("13_fishspeech", "fish-speech / OpenAudio", "CC-BY-NC-SA-4.0", "Generico multi-idioma", "No se intento (pipeline manual de 3 pasos, prioridad baja)", ""),
    ("15_indextts", "index-tts", "-", "NO soportado (EN/ZH; ES solo en v2.5 no liberada)", "Descartada por idioma", ""),
]

INFEASIBLES = [
    ("VITS (jaywalnut310)", "Solo checkpoints EN (LJSpeech/VCTK) del autor original. Sin checkpoint en espanol; requeriria entrenar desde cero."),
    ("VALL-E (lifeiteng/vall-e)", "Microsoft nunca libero pesos y el propio repo declara politica de NO publicar un modelo entrenado (para evitar mal uso/suplantacion de voz). No hay nada que ejecutar."),
    ("MisoTTS", "Documentacion oficial: 'English only' -- sin espanol. Ademas necesita 16-24GB VRAM en FP16 (esta maquina tiene 8GB)."),
]

def humanize_size(path: Path) -> str:
    kb = path.stat().st_size / 1024
    return f"{kb:.0f} KB" if kb < 1024 else f"{kb/1024:.1f} MB"

def audio_row(prefix: str, nombre: str, licencia: str, espanol: str, comercial: str) -> str:
    principal = AUDIOS_DIR / f"{prefix}.wav"
    if not principal.exists():
        principal = AUDIOS_DIR / f"{prefix}.mp3"
    expresivo = AUDIOS_DIR / f"{prefix}_expresivo.wav"
    if not expresivo.exists():
        expresivo = AUDIOS_DIR / f"{prefix}_expresivo.mp3"

    def player(path: Path) -> str:
        if not path.exists():
            return "<em>no generado</em>"
        return (
            f'<audio controls src="audios_prueba/{path.name}"></audio> '
            f'<span class="size">{humanize_size(path)}</span>'
        )

    if comercial.startswith("Si"):
        comercial_class = "ok"
    elif comercial.startswith("Descartada") or comercial.startswith("No se"):
        comercial_class = "bad"
    else:
        comercial_class = "warn"
    return f"""
    <tr>
      <td>{nombre}</td>
      <td>{licencia}</td>
      <td>{espanol}</td>
      <td class="{comercial_class}">{comercial}</td>
      <td>{player(principal)}</td>
      <td>{player(expresivo)}</td>
    </tr>"""

rows = "\n".join(audio_row(*t[:5]) for t in TECNOLOGIAS)
infeasibles_rows = "\n".join(
    f"<tr><td>{n}</td><td colspan='5'>{motivo}</td></tr>" for n, motivo in INFEASIBLES
)

html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comparativa TTS para Chispa (Mecha)</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; background: #fffdfb; color: #1a1a1a; }}
  h1 {{ color: #c0260a; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 2rem; }}
  th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; vertical-align: middle; }}
  th {{ background: #f4501e; color: white; }}
  tr:nth-child(even) {{ background: #f6f1ea; }}
  audio {{ height: 32px; max-width: 220px; }}
  .size {{ font-size: 11px; color: #888; }}
  .ok {{ color: #157a3d; font-weight: 600; }}
  .bad {{ color: #b00020; font-weight: 600; }}
  .warn {{ color: #a06800; font-weight: 600; }}
</style>
</head>
<body>
<h1>Comparativa TTS para Chispa (Mecha)</h1>
<p>Texto de prueba: <em>"Hola, soy el asistente virtual de Mecha. Hoy tendremos una cita de tinte y corte a las tres de la tarde con Maria Garcia..."</em></p>

<h2>Tecnologias con audio generado</h2>
<table>
<tr><th>Tecnologia</th><th>Licencia (pesos)</th><th>Espanol</th><th>Uso comercial</th><th>Audio principal</th><th>Audio expresivo</th></tr>
{rows}
</table>

<h2>No ejecutadas (inviables de raiz, documentado)</h2>
<table>
<tr><th>Tecnologia</th><th colspan="5">Motivo</th></tr>
{infeasibles_rows}
</table>

</body>
</html>
"""

out_path = Path(__file__).parent / "reporte_comparativo.html"
out_path.write_text(html, encoding="utf-8")
print(f"[OK] Reporte generado: {out_path}")
