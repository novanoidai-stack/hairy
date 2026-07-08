"""Prueba SpeechT5 (Microsoft). AVISO: solo soporta ingles oficialmente
(entrenado en LibriTTS/CMU ARCTIC) -- se espera pronunciacion incorrecta o
gibberish con texto en espanol. Se prueba igualmente por completitud.
"""
import time
import torch
import soundfile as sf
from datasets import load_dataset
from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan

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
processor = SpeechT5Processor.from_pretrained("microsoft/speecht5_tts")
model = SpeechT5ForTextToSpeech.from_pretrained("microsoft/speecht5_tts").to(device)
vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(device)
embeddings_dataset = load_dataset("Matthijs/cmu-arctic-xvectors", split="validation")
speaker_embeddings = torch.tensor(embeddings_dataset[7306]["xvector"]).unsqueeze(0).to(device)
print(f"[INFO] Modelo cargado en {time.perf_counter() - inicio:.2f}s")

for nombre, texto in [("11_speecht5", TEXTO), ("11_speecht5_expresivo", TEXTO_EXPRESIVO)]:
    t0 = time.perf_counter()
    inputs = processor(text=texto, return_tensors="pt").to(device)
    speech = model.generate_speech(inputs["input_ids"], speaker_embeddings, vocoder=vocoder)
    sf.write(f"audios_prueba/{nombre}.wav", speech.cpu().numpy(), samplerate=16000)
    print(f"[OK] {nombre}: {time.perf_counter() - t0:.2f}s")
