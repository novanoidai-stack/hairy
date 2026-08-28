// Pruebas de la puerta unica a la clave de servicio.
//
// Lo que vigilan, en una frase: que el dia que se desactive la `service_role`
// heredada las 32 edge functions sigan funcionando, y que el dia que la variable
// nueva venga vacia o rota NO se queden sin clave.
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  claveServicio,
  claveServicioOpcional,
  esClaveDeServicio,
  _reiniciarAvisoLegado,
} from "./claveServicio.ts";

const NUEVAS = "SUPABASE_SECRET_KEYS";
const LEGADO = "SUPABASE_SERVICE_ROLE_KEY";

function conEntorno(vars: Record<string, string | undefined>, prueba: () => void) {
  const previo: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    previo[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  _reiniciarAvisoLegado();
  try {
    prueba();
  } finally {
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("prefiere la secret key nueva cuando estan las dos", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_nueva" }), [LEGADO]: "eyJlegado" },
    () => assertEquals(claveServicio(), "sb_secret_nueva"),
  );
});

Deno.test("usa la heredada mientras no exista la nueva", () => {
  conEntorno(
    { [NUEVAS]: undefined, [LEGADO]: "eyJlegado" },
    () => assertEquals(claveServicio(), "eyJlegado"),
  );
});

Deno.test("funciona sin la heredada: es el dia en que se desactiva", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_nueva" }), [LEGADO]: undefined },
    () => assertEquals(claveServicio(), "sb_secret_nueva"),
  );
});

Deno.test("lee una clave con nombre propio, no solo la default", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_a", cobros: "sb_secret_b" }), [LEGADO]: undefined },
    () => assertEquals(claveServicio("cobros"), "sb_secret_b"),
  );
});

Deno.test("si el nombre pedido no esta, cae a la heredada en vez de devolver vacio", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ otra: "sb_secret_b" }), [LEGADO]: "eyJlegado" },
    () => assertEquals(claveServicio(), "eyJlegado"),
  );
});

Deno.test("un JSON roto no deja al salon sin servicio: cae a la heredada", () => {
  conEntorno(
    { [NUEVAS]: "{esto no es json", [LEGADO]: "eyJlegado" },
    () => assertEquals(claveServicio(), "eyJlegado"),
  );
});

Deno.test("una clave vacia en el JSON no cuenta como clave", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "" }), [LEGADO]: "eyJlegado" },
    () => assertEquals(claveServicio(), "eyJlegado"),
  );
});

Deno.test("sin ninguna de las dos revienta con un mensaje que se entiende", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: undefined }, () => {
    assertThrows(() => claveServicio(), Error, "Falta la clave de servicio");
  });
});

Deno.test("la variante opcional devuelve undefined en vez de reventar", () => {
  conEntorno(
    { [NUEVAS]: undefined, [LEGADO]: undefined },
    () => assertEquals(claveServicioOpcional(), undefined),
  );
});

// esClaveDeServicio: lo que impide que el cron deje de autenticarse en silencio
// a mitad de migracion.

Deno.test("acepta la clave NUEVA aunque siga existiendo la heredada", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_nueva" }), [LEGADO]: "eyJlegado" },
    () => assertEquals(esClaveDeServicio("sb_secret_nueva"), true),
  );
});

Deno.test("acepta la HEREDADA aunque ya exista la nueva: el cron aun no ha cambiado", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_nueva" }), [LEGADO]: "eyJlegado" },
    () => assertEquals(esClaveDeServicio("eyJlegado"), true),
  );
});

Deno.test("acepta cualquier clave con nombre del JSON, no solo la default", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_a", cron: "sb_secret_b" }), [LEGADO]: undefined },
    () => assertEquals(esClaveDeServicio("sb_secret_b"), true),
  );
});

Deno.test("rechaza una clave que no es ninguna de las dos", () => {
  conEntorno(
    { [NUEVAS]: JSON.stringify({ default: "sb_secret_nueva" }), [LEGADO]: "eyJlegado" },
    () => assertEquals(esClaveDeServicio("otra-cosa"), false),
  );
});

Deno.test("rechaza vacio y nulo sin mirar el entorno", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () => {
    assertEquals(esClaveDeServicio(""), false);
    assertEquals(esClaveDeServicio(null), false);
    assertEquals(esClaveDeServicio(undefined), false);
  });
});

Deno.test("sin ninguna clave configurada no autentica a nadie", () => {
  conEntorno(
    { [NUEVAS]: undefined, [LEGADO]: undefined },
    () => assertEquals(esClaveDeServicio("lo-que-sea"), false),
  );
});
