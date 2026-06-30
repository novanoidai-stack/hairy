import requests
import os
import shutil

API_KEY = "sk_0f491d781080388a0d3f6fd796602a4040459c875051d7b0"
OUTPUT_WEB = r"C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\web\mecha-narration-elevenlabs.mp3"
OUTPUT_DELIVERY = r"C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\DELIVERY\mecha-narration-elevenlabs.mp3"

TEXT = """Mecha. El sistema operativo definitivo para tu salón de peluquería.

Cada día, tu teléfono no para de sonar y pierdes citas mientras atiendes a tus clientes. Los no-shows vacían tus sillas y tu dinero se escapa. 

Pero Mecha cambia las reglas del juego. No es una agenda más; es la única plataforma diseñada para la realidad de una peluquería de verdad.

Mira tu agenda: ahí está el color de María. Tras la aplicación, hay cuarenta minutos de tiempo de reposo. En una agenda tradicional, es tiempo muerto. En Mecha, es una oportunidad. El sistema detecta el hueco libre automáticamente y propone encajar un Corte Exprés. Más facturación para tu salón en el mismo día, sin alargar tu jornada de trabajo.

Y mientras tú descansas, tu asistente de Inteligencia Artificial atiende WhatsApp a las once de la noche. Responde al instante, ofrece huecos reales de tu agenda, cobra la seña de seguridad con Stripe para eliminar los no-shows, y confirma la cita. Te despiertas con la agenda llena y los depósitos asegurados.

A la hora de cobrar, tu terminal punto de venta o POS es rápido y visual. Seleccionas los servicios de color, corte o peinado, asignas las comisiones correspondientes a Diego, Sofía o Carla en una sola transacción, y completas el cobro. Cero descoordinación en caja.

Además, cuentas con la ficha de cliente más profunda del mercado. Ana García. Cliente VIP. Alérgica al amoniaco. Con todo su historial de fotos del antes y después y su fórmula exacta de color: Tinte seis punto tres más oxigenada de veinte volúmenes guardada para siempre.

Tus clientes reservan cómodamente escaneando tu código QR que los lleva directo a tu portal de reservas online personalizado. Y a continuación, tus informes en vivo te muestran el resultado: noventa y tres por ciento menos de no-shows, ocupación optimizada y más ingresos por silla.

Mecha. Enciende tu salón. Entra en mecha punto app.
"""

print("[ELEVENLABS] Generando voz femenina profesional y fluida (Bella)...")

# Usar Bella - muy natural y profesional
voice_id = "hpp4J3VqNfWAUOO0d1Us"
url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
headers = {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json"
}

data = {
    "text": TEXT,
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.52,  # Un poco menos de estabilidad da más fluidez y ritmo
        "similarity_boost": 0.8,
        "style": 0.05,
        "use_speaker_boost": True
    }
}

try:
    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 200:
        with open(OUTPUT_WEB, 'wb') as f:
            f.write(response.content)
        size = os.path.getsize(OUTPUT_WEB)
        print(f"[OK] Audio de narración generado en web/: {size/1024:.1f} KB")
        
        # Copiar a DELIVERY
        shutil.copy(OUTPUT_WEB, OUTPUT_DELIVERY)
        print(f"[OK] Copiado a DELIVERY/")
    else:
        print(f"[ERROR] Status {response.status_code}: {response.text}")
except Exception as e:
    print(f"[ERROR] {e}")
