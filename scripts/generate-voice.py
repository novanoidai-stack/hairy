"""Generar voz femenina con edge-tts para Mecha"""
import subprocess
import os

TEXT = """Mecha. El sistema operativo de tu salon.
Citas que se pierden. Telefonos que suenan. Huecos vacios en tu agenda.
No shows que vacian tu jornada. Tu dinero escapando.
Pero existe otra forma. Mecha no es otra agenda mas.
Es la primera que entiende una peluqueria de verdad.
Mira tu agenda. Ahi esta el color de Maria. Durante cuarenta minutos.
Y debajo, su reposo. Veinticinco minutos muertos. O no.
Mecha detecta el hueco y te avisa. Un corte express encaja perfecto.
Un servicio mas en la misma jornada. Mas facturacion sin alargar tu dia.
Y eso es solo el principio. Tu IA receptora vive en WhatsApp.
Mientras duermes, Mecha trabaja.
Una clienta escribe pidiendo hora. La IA responde al instante.
Busca disponibilidad. Ofrece opciones. Cobra la senal con Stripe.
Confirma la cita. Tu te despiertas con la agenda llena.
Una cita, varios profesionales, cero descoordinacion.
Color con Sofia. Corte con Carla. Penado con Diego.
Una sola reserva. Una confirmacion para el cliente.
Cada cliente, moldeado por ti. Ana Garcia. Fiel. Alergica al amoniaco.
Prefiere tardes. Su formula de color guardada. Todo controlado.
Tus numeros, en vivo. Noventa y tres por ciento menos no shows.
Treinta y dos por ciento mas ocupacion. Seis horas ahorradas cada semana.
Veinticuatro por ciento mas ingresos por silla.
Mecha. Enciende tu salon. Mecha punto app."""

OUTPUT = r"C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\DELIVERY\mecha-voice-fem.mp3"

# Usar edge-tts con voz femenina y ritmo un poco más rápido
cmd = [
    "python", "-m", "edge_tts",
    "--text", TEXT,
    "--voice", "es-ES-ElviraNeural",
    "--rate=+8%",  # Un poco más rápido
    "--pitch=+0Hz",
    "--write-media", OUTPUT
]

print("[GEN] Generando voz femenina con edge-tts...")
result = subprocess.run(cmd, capture_output=True, text=True)

if os.path.exists(OUTPUT):
    size = os.path.getsize(OUTPUT)
    print(f"[OK] Audio generado: {size/1024:.1f} KB")
else:
    print(f"[ERROR] No se generó el audio")
    print(result.stderr)
