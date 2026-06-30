"""Generar voz femenina con ElevenLabs API"""
import requests
import os

API_KEY = "sk_0f491d781080388a0d3f6fd796602a4040459c875051d7b0"
OUTPUT = r"C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\DELIVERY\mecha-voice-female.mp3"

# Texto limpio sin caracteres problemáticos
TEXT = """Mecha. El sistema operativo de tu salon.

Citas que se pierden. Telefonos que suenan. Huecos vacios en tu agenda. No shows que vacian tu jornada. Tu dinero escapando.

Pero existe otra forma. Mecha no es otra agenda mas. Es la primera que entiende una peluqueria de verdad.

Mira tu agenda. Ahi esta el color de Maria. Durante cuarenta minutos. Y debajo, su reposo. Veinticinco minutos muertos. O no. Mecha detecta el hueco y te avisa. Un corte express encaja perfecto. Un servicio mas en la misma jornada. Mas facturacion sin alargar tu dia.

Y eso es solo el principio. Tu IA receptora vive en WhatsApp. Mientras duermes, Mecha trabaja.

Una clienta escribe pidiendo hora. La IA responde al instante. Busca disponibilidad. Ofrece opciones. Cobra la senal con Stripe. Confirma la cita. Tu te despiertas con la agenda llena.

Una cita, varios profesionales, cero descoordinacion. Color con Sofia. Corte con Carla. Penado con Diego. Una sola reserva. Una confirmacion para el cliente.

Cada cliente, moldeado por ti. Ana Garcia. Fiel. Alergica al amoniaco. Prefiere tardes. Su formula de color guardada. Todo controlado.

Tus numeros, en vivo. Noventa y tres por ciento menos no shows. Treinta y dos por ciento mas ocupacion. Seis horas ahorradas cada semana. Veinticuatro por ciento mas ingresos por silla.

Mecha. Enciende tu salon. Mecha punto app."""

print("[ELEVENLABS] Generando voz femenina...")

# Usar voz femenina (Bella - muy natural)
url = "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL"
headers = {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json"
}

# Configuración para voz natural y femenina
data = {
    "text": TEXT,
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.35,
        "similarity_boost": 0.8,
        "style": 0.5,
        "use_speaker_boost": True
    }
}

try:
    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 200:
        with open(OUTPUT, 'wb') as f:
            f.write(response.content)
        size = os.path.getsize(OUTPUT)
        print(f"[OK] Audio generado: {size/1024:.1f} KB")
    else:
        print(f"[ERROR] Status {response.status_code}: {response.text}")
except Exception as e:
    print(f"[ERROR] {e}")
