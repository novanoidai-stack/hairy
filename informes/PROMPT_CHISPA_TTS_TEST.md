# PROMPT: Integrar y Probar TODAS las Tecnologías TTS en Chispa

**COPIA Y PEGA ESTE DOCUMENTO COMPLETO EN UNA NUEVA SESIÓN DE CLAUDE**

---

## INSTRUCCIONES PARA CLAUDE

Necesito que integres y pruebes **15 tecnologías TTS de código abierto** en Chispa (la capa IA de Mecha). El objetivo es reemplazar ElevenLabs y su fallback actual con voces gratuitas/ilimitadas de alta calidad.

**IMPORTANTE:** Probar TODAS las tecnologías, no solo las primeras. Generar audios con cada una para comparar.

---

## TECNOLOGÍAS A PROBAR (POR ORDEN DE PRIORIDAD)

### TIER 1: LAS MEJORES (CALIDAD ELEVENLABS-COMPARABLE)

### 1. Coqui TTS + XTTS v2 ⭐ RECOMENDACIÓN PRINCIPAL
- **GitHub:** https://github.com/coqui-ai/TTS
- **Estrellas:** 45,718 (la más battle-tested)
- **Descripción:** Deep learning toolkit para TTS con voice cloning
- **Modelos clave:** XTTS v2 (cross-lingual voice cloning), VITS, Tacotron
- **Instalación:**
```bash
pip install TTS
# O con Docker
docker run -p 5002:5002 ghcr.io/coqui-ai/tts:latest
```

**API Server:**
```bash
TTS/bin/server/server.py --model_name tts_models/multilingual/multi-dataset/xtts_v2 --port 5002
```

**API Endpoint:**
```bash
POST http://localhost:5002/api/tts
{
    "text": "Hola, esta es una prueba",
    "speaker_wav": "/path/to/reference.wav",  # opcional para voice clone
    "language": "es"
}
```

### 2. Bark (Suno AI) ⭐ MÁS REALISTA
- **GitHub:** https://github.com/suno-ai/bark
- **Descripción:** Transformer-based TTS, genera risas/suspiros/efectos
- **Características:** Muy expresivo, multi-idioma
- **Instalación:**
```bash
pip install git+https://github.com/suno-ai/bark.git
```

**Código de ejemplo:**
```python
from bark import generate_audio, save_as_prompt
import numpy as np

audio_array = generate_audio("Hola, esta es una prueba", history_prompt="v2/es_speaker_1")
save_as_prompt(audio_array, "output.wav")
```

### 3. YourTTS ⭐ MULTI-IDIOMA VOICE CLONING
- **GitHub:** https://github.com/Edresson/YourTTS
- **Descripción:** Voice cloning multi-idioma sin datos del hablante en idioma objetivo
- **Especialización:** Clona voces de inglés a español, portugués, francés

### 4. StyleTTS2 ⭐ HACIA NIVEL HUMANO
- **GitHub:** https://github.com/yl4579/StyleTTS2
- **Estrellas:** 6,303
- **Descripción:** Towards Human-Level TTS through Style Diffusion
- **Instalación:**
```bash
git clone https://github.com/yl4579/StyleTTS2.git
cd StyleTTS2
pip install -r requirements.txt
```

---

### TIER 2: RÁPIDAS Y LIGERAS

### 5. Piper ⭐ MÁS RÁPIDO
- **GitHub:** https://github.com/rhasspy/piper
- **Descripción:** Fast, local neural TTS con Docker images
- **Ventajas:** Real-time incluso en CPU, modelos <100MB
- **Instalación:**
```bash
docker run -p 59125:59125 rhasspy/piper
```

### 6. VITS
- **GitHub:** https://github.com/jaywalnut310/vits
- **Estrellas:** 7,874
- **Descripción:** Conditional VAE with adversarial learning for TTS
- **Ventajas:** Muy rápido, calidad alta

### 7. MMS (Meta) ⭐ 1000+ IDIOMAS
- **GitHub:** https://github.com/facebookresearch/mms
- **Descripción:** Massively Multilingual Speech (1000+ idiomas)
- **Ideal para:** Idiomas de bajos recursos

---

### TIER 3: EMERGENTES 2025-2026

### 8. fish-speech ⭐ NUEVO PROMETEDOR
- **GitHub:** https://github.com/fishaudio/fish-speech
- **Estrellas:** 31,177
- **Descripción:** SOTA Open Source TTS
- **Instalación:**
```bash
docker-compose -f compose.yml up
# O
python tools/api_server.py --port 5002
```

### 9. OpenVoice (MyShell)
- **GitHub:** https://github.com/myshell-ai/OpenVoice
- **Descripción:** Voice cloning instantáneo
- **Ventajas:** Clona con muestra muy corta

### 10. SpeechT5 (Microsoft)
- **Descripción:** Encoder-decoder model para speech synthesis
- **Ventajas:** Modelo robusto de Microsoft

### 11. MisoTTS
- **GitHub:** https://github.com/MisoLabsAI/MisoTTS
- **Estrellas:** 3,082
- **Descripción:** 8 billion parameter model, altamente emotivo

### 12. VALL-E
- **GitHub:** https://github.com/lifeiteng/vall-e
- **Estrellas:** 2,204
- **Descripción:** Zero-Shot TTS de Microsoft

### 13. index-tts
- **GitHub:** https://github.com/index-tts/index-tts
- **Estrellas:** 21,735
- **Descripción:** Industrial-Level Zero-Shot TTS con voice cloning

---

### TIER 4: SOLUCIONES PRÁCTICAS

### 14. edge-tts ⭐ GRATIS INMEDIATO
- **GitHub:** https://github.com/rany2/edge-tts
- **Estrellas:** 11,455
- **Descripción:** Usa Microsoft Edge's online TTS SIN API key
- **Instalación:** `pip install edge-tts`
- **Voces español:**
  - `es-ES-ElviraNeural` (Femenino, España)
  - `es-ES-AlvaroNeural` (Masculino, España)
  - `es-MX-JorgeNeural` (México)
  - `es-AR-AlejandroNeural` (Argentina)
  - `es-CO-SalomonNeural` (Colombia)

```python
import edge_tts
import asyncio

async def generar_voz_edge(texto, voz="es-ES-ElviraNeural"):
    communicate = edge_tts.Communicate(texto, voz)
    await communicate.save("output.mp3")
    return "output.mp3"
```

### 15. Kokoro-FastAPI ⭐ PRODUCCIÓN READY
- **GitHub:** https://github.com/remsky/Kokoro-FastAPI
- **Estrellas:** 5,162
- **Descripción:** Dockerized FastAPI wrapper con API OpenAI-compatible

```bash
docker-compose -f docker/docker-compose.test.yml up
```

### 16. ChatTTS ⭐ DIÁLOGO CONVERSACIONAL
- **GitHub:** https://github.com/2noise/ChatTTS
- **Estrellas:** 39,578 (la más grande)
- **Descripción:** Modelo generativo especializado en diálogo

### 17. MeloTTS ⭐ MULTI-IDIOMA MIT
- **GitHub:** https://github.com/myshell-ai/MeloTTS
- **Estrellas:** 7,529
- **Licencia:** MIT (comercial permitida)

```python
from melo.api import TTS
tts = TTS(language='ES', device='cpu')
tts.tts_to_file("Hola, esta es una prueba", "output.wav")
```

---

## TABLA RESUMEN DE TODAS LAS TECNOLOGÍAS

### 1. edge-tts (OPCIÓN GRATUITA INMEDIATA)
- **GitHub:** https://github.com/rany2/edge-tts
- **Estrellas:** 11,455
- **Descripción:** Usa Microsoft Edge's online TTS SIN API key (100% gratis)
- **Instalación:** `pip install edge-tts`
- **Voces español:**
  - `es-ES-ElviraNeural` (Femenino, España)
  - `es-ES-AlvaroNeural` (Masculino, España)
  - `es-MX-JorgeNeural` (México)
  - `es-AR-AlejandroNeural` (Argentina)
  - `es-CO-SalomonNeural` (Colombia)

**Código de ejemplo:**
```python
import edge_tts
import asyncio

async def generar_voz_edge(texto, voz="es-ES-ElviraNeural"):
    communicate = edge_tts.Communicate(texto, voz)
    await communicate.save("output.mp3")
    return "output.mp3"

# Uso
asyncio.run(generar_voz_edge("Hola, esta es una prueba"))
```

### 2. Kokoro-FastAPI (MEJOR OPCIÓN PRODUCCIÓN)
- **GitHub:** https://github.com/remsky/Kokoro-FastAPI
- **Estrellas:** 5,162
- **Descripción:** Dockerized FastAPI wrapper con API OpenAI-compatible
- **Instalación:**
```bash
git clone https://github.com/remsky/Kokoro-FastAPI.git
cd Kokoro-FastAPI
docker-compose -f docker/docker-compose.test.yml up
```

**API Endpoint:**
```bash
POST http://localhost:8080/v1/audio/speech
{
  "model": "kokoro",
  "input": "Hola, esta es una prueba",
  "voice": "default"
}
```

### 3. fish-speech (SOTA - STATE OF THE ART)
- **GitHub:** https://github.com/fishaudio/fish-speech
- **Estrellas:** 31,177
- **Descripción:** SOTA Open Source TTS con WebUI y API server
- **Instalación:**
```bash
git clone https://github.com/fishaudio/fish-speech.git
cd fish-speech
docker-compose -f compose.yml up
# O
python tools/api_server.py --port 5002
```

**API Endpoint:**
```bash
POST http://localhost:5002/tts
{
  "text": "Hola, esta es una prueba",
  "language": "es"
}
```

### 4. ChatTTS (ESPECIALIZADO EN DIÁLOGO)
- **GitHub:** https://github.com/2noise/ChatTTS
- **Estrellas:** 39,578 (la más grande)
- **Descripción:** Modelo generativo especializado en diálogo conversacional
- **Instalación:**
```bash
git clone https://github.com/2noise/ChatTTS.git
cd ChatTTS
pip install -r requirements.txt
```

**Código de ejemplo:**
```python
import ChatTTS

chat = ChatTTS.Chat()
chat.load_models()
wavs = chat.infer(["Hola, esta es una prueba"])
```

### 5. MeloTTS (MULTI-IDIOMA CON ESPAÑOL)
- **GitHub:** https://github.com/myshell-ai/MeloTTS
- **Estrellas:** 7,529
- **Licencia:** MIT (comercial permitida)
- **Instalación:**
```bash
pip install melo-api
```

**Código de ejemplo:**
```python
from melo.api import TTS

tts = TTS(language='ES', device='cpu')
tts.tts_to_file("Hola, esta es una prueba", "output.wav")
```


| # | Tecnología | Estrellas | Calidad | Velocidad | Voice Clone | Docker | API Ready | Licencia |
|---|------------|-----------|---------|-----------|-------------|--------|-----------|----------|
| 1 | **Coqui TTS + XTTS v2** | 45.7K | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ✅ | ✅ | MPL-2.0 |
| 2 | **Bark (Suno)** | - | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ | ❌ | ❌ | MIT |
| 3 | **YourTTS** | - | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ❌ | ❌ | CC-BY-NC |
| 4 | **StyleTTS2** | 6.3K | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | ❌ | ❌ | MIT |
| 5 | **Piper** | - | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ | ✅ | ✅ | MIT |
| 6 | **VITS** | 7.9K | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | ❌ | ❌ | - |
| 7 | **MMS (Meta)** | - | ⭐⭐⭐ | ⭐⭐⭐ | ❌ | ❌ | ❌ | CC-BY-NC |
| 8 | **fish-speech** | 31.2K | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ✅ | ✅ | Other |
| 9 | **OpenVoice** | - | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ❌ | ❌ | - |
| 10 | **SpeechT5** | - | ⭐⭐⭐⭐ | ⭐⭐⭐ | ❌ | ❌ | ❌ | - |
| 11 | **MisoTTS** | 3.1K | ⭐⭐⭐⭐ | ⭐⭐ | ✅ | ❌ | ❌ | Other |
| 12 | **VALL-E** | 2.2K | ⭐⭐⭐⭐ | ⭐⭐ | ✅ | ❌ | ❌ | - |
| 13 | **index-tts** | 21.7K | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ | ❌ | ✅ | Other |
| 14 | **edge-tts** | 11.5K | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | ❌ | ❌ | Other |
| 15 | **Kokoro-FastAPI** | 5.2K | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | ✅ | ✅ | - |
| 16 | **ChatTTS** | 39.6K | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ❌ | ❌ | ⚠️ | - |
| 17 | **MeloTTS** | 7.5K | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | ❌ | ⚠️ | MIT |

---

## TAREA A REALIZAR

### Paso 1: Instalar edge-tts (más rápido de probar - baseline)
```bash
pip install edge-tts
```

### Paso 2: Instalar Coqui TTS (segunda prioridad)
```bash
pip install TTS
# O
docker run -p 5002:5002 ghcr.io/coqui-ai/tts:latest
```

### Paso 3: Crear script de prueba PARA TODAS las tecnologías
Crea un archivo `scripts/probar_tts_completo.py` que:

1. **Pruebe las 17 tecnologías** en orden
2. Genere el mismo texto de prueba con cada una
3. Guarde los audios en archivos separados (`output_01_coqui.wav`, `output_02_bark.wav`, etc.)
4. Documente cuáles fallaron o requirieron setup adicional
5. Cree un reporte HTML con todos los audios reproducibles

### Paso 4: Probar en el preview de Chrome
Usa Chrome DevTools MCP para:
1. Abrir el preview de la app Chispa
2. Navegar a una conversación de prueba
3. Generar audios con cada tecnología
4. Reproducirlos para escuchar la calidad

### Paso 5: Comparación exhaustiva
Para cada tecnología, documentar:
- **Calidad de voz** (1-5)
- **Naturalidad** (1-5)
- **Velocidad de generación** (segundos)
- **Uso de CPU/GPU** (%)
- **Si requiere internet** (sí/no)
- **Dificultad de instalación** (1-5)
- **Soporte español** (sí/no/partial)
- **Licencia comercial** (permitida/restringida)
- **Estado de la prueba** (✅ funcionó / ❌ falló / ⚠️ parcial)

---

## TEXTO DE PRUEBA (USAR ESTE MISMO TEXTO PARA TODAS)

```
"Hola, soy el asistente virtual de Mecha. Hoy tendremos una cita de tinte y corte a las tres de la tarde con María García. El servicio durará aproximadamente dos horas y tiene un precio de cuarenta y cinco euros. ¿Te parece bien si te confirmo la cita?"
```

**Texto adicional (para probar expresividad):**
```
"¡Perfecto! (risa) Bueno, pues eso es todo por hoy. ¿Necesitas algo más? (pausa) Vale, hasta luego."
```

---

## UBICACIÓN DEL CÓDIGO CHISPA

El código de Chispa está en:
- **Directorio:** `lib/chispa/`
- **Archivo principal:** `lib/chispa/index.ts`
- **Configuración de voz actual:** Buscar donde se usa ElevenLabs
- **Fallback actual:** Buscar TTS fallback

---

## RESULTADO ESPERADO

### 1. Archivos de audio generados
```
audios_prueba/
├── 01_coqui_xtts.wav
├── 02_bark.wav
├── 03_yourtts.wav
├── 04_styletts2.wav
├── 05_piper.wav
├── 06_vits.wav
├── 07_mms.wav
├── 08_fish_speech.wav
├── 09_openvoice.wav
├── 10_speecht5.wav
├── 11_misotts.wav
├── 12_valle.wav
├── 13_indextts.wav
├── 14_edge_tts.mp3
├── 15_kokoro.wav
├── 16_chattts.wav
└── 17_melotts.wav
```

### 2. Tabla comparativa completa
Con todas las métricas para cada tecnología

### 3. Recomendación detallada
- **Fallback principal** (recomendado para producción)
- **Fallback secundario** (backup)
- **Opción premium** (máxima calidad si se desea invertir más recursos)
- **Opción rápida** (para respuestas inmediatas)
- **Opción offline** (sin internet)

### 4. Código de integración
Ejemplo de cómo integrar las top 3 en el código Chispa actual

---

## ORDEN SUGERIDO DE PRUEBA

1. **edge-tts** (primero - baseline gratuito, instantáneo)
2. **Coqui TTS + XTTS v2** (segundo - más battle-tested)
3. **fish-speech** (tercero - SOTA calidad)
4. **Kokoro-FastAPI** (cuarto - producción ready)
5. **ChatTTS** (quinto - especializado en diálogo)
6. **MeloTTS** (sexto - multi-idioma MIT)
7. **Piper** (séptimo - más rápido)
8. **Bark** (octavo - más expresivo)
9. **StyleTTS2** (noveno - humana nivel)
10. **Resto** (en orden de interés)

---

## NOTAS IMPORTANTES

- **NO SALTEAR** tecnologías - probar TODAS las 17
- **edge-tts** es la única que funciona 100% gratis sin setup complejo - úsala como baseline primero
- **Coqui TTS** es la más battle-tested y tiene API server ready
- **Kokoro-FastAPI** requiere Docker pero es OpenAI-compatible (fácil integración)
- **fish-speech** es la de mayor calidad (SOTA) pero más pesada
- **Bark** genera sonidos expresivos (risas, suspiros) - ideal para conversaciones naturales
- Priorizar que funcione **offline** (sin internet) cuando sea posible
- **Todas deben soportar español** - documentar cuáles no
- **Chequear licencias** para uso comercial

---

## TECNOLOGÍAS A PROBAR

### Paso 1: Instalar edge-tts (más rápido de probar)
```bash
pip install edge-tts
```

### Paso 2: Crear script de prueba para todas las tecnologías
Crea un archivo `scripts/probar_tts.py` que:
1. Genere el mismo texto de prueba con cada tecnología
2. Guarde los audios en archivos separados
3. Permita escuchar cada uno

### Paso 3: Probar en el preview de Chrome
Usa Chrome DevTools MCP para:
1. Abrir el preview de la app Chispa
2. Navegar a una conversación de prueba
3. Generar audios con cada tecnología
4. Reproducirlos para escuchar la calidad

### Paso 4: Comparación
Para cada tecnología, documentar:
- **Calidad de voz** (1-5)
- **Naturalidad** (1-5)
- **Velocidad de generación** (segundos)
- **Uso de CPU/GPU**
- **Si requiere internet** (sí/no)
- **Dificultad de instalación** (1-5)

---

## TEXTO DE PRUEBA

Usar este texto en español para todas las pruebas:

```
"Hola, soy el asistente virtual de Mecha. Hoy tendremos una cita de tinte y corte a las tres de la tarde con María García. El servicio durará aproximadamente dos horas y tiene un precio de cuarenta y cinco euros. ¿Te parece bien si te confirmo la cita?"
```

---

## UBICACIÓN DEL CÓDIGO CHISPA

El código de Chispa está en:
- Directorio: `lib/chispa/`
- Archivo principal: `lib/chispa/index.ts`
- Configuración de voz: Buscar donde se usa ElevenLabs

---

## RESULTADO ESPERADO

1. **Audios de prueba** generados con cada tecnología
2. **Tabla comparativa** con calificaciones
3. **Recomendación** de cuál usar como:
   - Fallback principal
   - Fallback secundario
   - Opción premium (si aplica)

---

## ESTRATEGIA DE PRUEBA

### Fase 1: Baseline Rápido (minutos 0-15)
1. edge-tts (instantáneo, gratis)
2. Coqui TTS (requiere instalación)

### Fase 2: Top Tier (minutos 15-45)
3. fish-speech (SOTA)
4. Kokoro-FastAPI (producción)
5. ChatTTS (diálogo)

### Fase 3: Resto (minutos 45-120)
6. MeloTTS
7. Piper
8. Bark
9. StyleTTS2
10. YourTTS
11. Resto de tecnologías

---

**COMIENZA LA INTEGRACIÓN Y PRUEBA DE LAS 17 TECNOLOGÍAS TTS EN CHISPA**

**IMPORTANTE:** NO te detengas después de probar las primeras 3-5. Debes probar TODAS las 17 tecnologías y generar audios con cada una para poder comparar realmente cuál es la mejor opción para Mecha.

**FIN DEL PROMPT - COPIAR Y PEGAR TODO ESTE DOCUMENTO EN UNA NUEVA SESIÓN DE CLAUDE**
---

