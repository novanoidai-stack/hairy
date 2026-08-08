# Prompt para Claude Code

> **Antes de pegarlo:** si quieres que Chispa tenga una voz clonada concreta (recomendado), graba
> 5-10 segundos de esa voz y guárdalos como `motion_design_pack/referencia.wav`. Apunta la frase
> exacta que dice. Si no lo haces, el prompt usa una voz de catálogo y funciona igual.
>
> Ábrelo con `claude` desde `C:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy` y pega todo lo de
> abajo de la línea.

---

Trabaja **solo** dentro de `motion_design_pack/`. No toques nada más del repo, no hagas commit ni
push sin preguntarme antes.

Contexto: `motion_design_pack/MECHA_motion_v2.html` es un vídeo de producto de Mecha de 1:55, hecho
con HTML/CSS/JS, narrado por Chispa. `motion_design_pack/GUION_CHISPA_v3.md` tiene el guion y la
trazabilidad de cada afirmación. `motion_design_pack/generar_voz_chispa.py` genera la locución.

Tengo dos cosas sin resolver y quiero que las cierres.

## 1. Generar la locución de Chispa

El HTML busca `motion_design_pack/voz/chispa_01.wav` … `chispa_10.wav` al abrirse. Si existen usa
esa locución; si no, cae a la voz del navegador (que suena a robot). Quiero los archivos.

Elige el motor así:

- Si existe `motion_design_pack/referencia.wav` → clona esa voz. Usa **F5-TTS** con el fine-tune
  español (`jpgallegoar/F5-Spanish`). Si detectas GPU NVIDIA con VRAM suficiente, prueba primero
  **Fish-Speech**, que es el más humano (respira, hace micro-pausas).
- Si no existe referencia → **Kokoro-82M** (`pip install kokoro soundfile`, funciona en CPU),
  voz `ef_dora`.

`generar_voz_chispa.py` ya implementa los tres motores y las diez líneas de texto. Úsalo. Si la API
de alguna librería ha cambiado desde que se escribió, **arregla el script** en vez de rodearlo.

Requisitos de la locución:

- Español de España, tono de conversación real, no de anuncio.
- **No toques el texto de las líneas.** Las muletillas (*a ver, ¿vale?, pues, mira, básicamente*) y
  los puntos suspensivos están puestos a propósito para que el TTS respire ahí.
- Si algún motor falla, prueba el siguiente y dime cuál usaste y por qué.

## 2. Cuadrar duraciones

Cada línea tiene que caber en su escena. Los límites están en `LIMITES` dentro del script y en la
tabla de `GUION_CHISPA_v3.md`:

```
escena  1  2  3  4  5  6  7  8  9  10
límite 10 11 12 13 12 11 13 13 10  10   (segundos)
```

El script ya avisa cuando una línea se pasa. Si alguna se pasa:

1. Primero prueba `--velocidad` (hasta 1.10, por encima suena acelerado).
2. Si aún se pasa, alarga esa escena en el array `SCENES` del HTML (campo `d`) y actualiza la tabla
   de `GUION_CHISPA_v3.md` y `LIMITES` en el script para que los tres queden coherentes.

No recortes el texto para que quepa sin decírmelo.

## 3. Verificar el vídeo de verdad

Instala Playwright con Chromium y comprueba el HTML a 1920×1080:

1. Abre el archivo, haz clic en `#cover` para arrancar.
2. Para cada una de las 10 escenas: espera ~4 s, haz captura, y pulsa `#btnFwd` para avanzar.
   Guárdalas en `motion_design_pack/qa/escena_01.png` … `escena_10.png`.
3. **Mira cada captura** y busca: texto cortado o que se sale del marco, elementos superpuestos,
   imágenes que no cargan, contadores que se quedan en cero, burbujas de chat que no aparecen.
4. Recoge los errores de consola. Tiene que haber cero.
5. Comprueba que las dos capturas reales cargan y están bien recortadas:
   `capturas_recortadas/12_portal_reserva_desktop.png` (escena 6) y
   `capturas_recortadas/08_portal_reserva_mobile_hero.png` (escena 9, no debe verse el banner de
   cookies).
6. Arregla lo que encuentres y repite hasta que esté limpio.

## Reglas

- Respeta `CLAUDE.md` del repo. En particular la regla de **no claims falsos**: no añadas ninguna
  cifra ni funcionalidad al vídeo que no esté respaldada en `GUION_CHISPA_v3.md`. Si algo del guion
  te parece que ya no se corresponde con el código, dímelo en vez de cambiarlo por tu cuenta.
- El texto en pantalla dice "**Preparada** para VeriFactu", no "certificada". No lo subas de nivel:
  el worker apunta a preproducción de la AEAT (`prewww1.aeat.es`) y F2 (certificados reales) aún no
  está hecho.
- Marca de Mecha: acento `#F4501E`, fondo oscuro `#070A14`, tipografías Bricolage Grotesque /
  Space Grotesk / Inter. Sin emojis en el código.

## Al terminar

Dime en un párrafo: qué motor de voz usaste, cuánto dura cada línea frente a su límite, qué
encontraste en las capturas y qué arreglaste. Si algo no se pudo hacer, dilo claramente en vez de
darlo por bueno.
