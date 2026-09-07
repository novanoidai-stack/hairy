// Lectura de pantallas reales: no pulsa guardar, reservar, enviar ni cobrar.
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = new URL('.', import.meta.url);
const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport:{width:1440,height:1000}});
const publicas = [['landing','/'],['acceso','/acceso.html'],['portal','/app/r/demo'],['resena','/app/resena/demo']];
const software = ['','mi-jornada','lista-espera','citas','clientes','bandeja','campanas','caja','presupuestos','equipo','inventario','resenas','informes','ayuda','configuracion'];
const resultados = [];
for (const [nombre,ruta,demo] of [...publicas, ...software.map(p=>[p||'agenda','/app'+(p?'/'+p:''),true])]) {
  const page = await context.newPage();
  const fallos = [], rpcs = [];
  page.on('pageerror', e => fallos.push({tipo:'js',detalle:e.message}));
  page.on('response', r => { if(r.status()>=400) fallos.push({tipo:'http',estado:r.status(),ruta:new URL(r.url()).pathname}); });
  page.on('request', r=>{if(r.url().includes('/rest/v1/'))rpcs.push(new URL(r.url()).pathname)});
  const t0 = Date.now();
  let texto = '', error = null;
  try {
    await page.goto('https://www.mechaa.es'+(demo?'/demo.html?share=1&intro=0':ruta),{waitUntil:'domcontentloaded',timeout:45000});
    let doc = page;
    if(demo){
      await page.locator('iframe[src*="/app"]').waitFor({state:'attached',timeout:20000});
      if(ruta!='/app') await page.locator('iframe[src*="/app"]').evaluate((f,r)=>{f.src=r+'?demo=1'},ruta);
      doc = page.frameLocator('iframe[src*="/app"]');
    }
    for(let i=0;i<25;i++){
      texto = await doc.locator('body').innerText().catch(()=>'');
      if(texto.length>350 && !/^Cargando/.test(texto.trim())) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);
    texto = await doc.locator('body').innerText().catch(()=>'');
    if(['landing','portal','agenda','caja'].includes(nombre)) await page.screenshot({path:new URL(nombre+'.png',dir).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    const overflow = await doc.locator('body').evaluate(()=>({ancho:innerWidth,documento:document.documentElement.scrollWidth}));
    resultados.push({nombre,ruta,demo:Boolean(demo),ms:Date.now()-t0,caracteres:texto.length,texto:texto.slice(0,1600),overflow,rpcs,fallos});
  }catch(e){error=e.message;resultados.push({nombre,ruta,ms:Date.now()-t0,error,fallos});}
  fs.writeFileSync(new URL('recorrido-produccion.json',dir),JSON.stringify(resultados,null,2));
  console.log(JSON.stringify({nombre,ms:Date.now()-t0,caracteres:texto.length,fallos:fallos.length,error}));
  await page.close();
}
await browser.close();
