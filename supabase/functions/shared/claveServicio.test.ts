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
  claveEntrante,
  peticionDeServicio,
  _reiniciarAvisoLegado,
  clavePublicable,
  clavePublicableOpcional,
  _reiniciarAvisoAnonLegado,
} from "./claveServicio.ts";

const pet = (cabeceras: Record<string, string>) =>
  new Request("https://x.test/", { headers: cabeceras });

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

// peticionDeServicio: la puerta que sustituye al `verify_jwt` de la plataforma.
// Lo que vigila: que apagarlo NO deje estas funciones abiertas.

Deno.test("acepta la heredada en Authorization: Bearer (como hoy)", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () =>
    assertEquals(peticionDeServicio(pet({ Authorization: "Bearer eyJlegado" })), true),
  );
});

Deno.test("acepta la nueva en la cabecera apikey (como quedara)", () => {
  conEntorno({ [NUEVAS]: JSON.stringify({ default: "sb_secret_x" }), [LEGADO]: undefined }, () =>
    assertEquals(peticionDeServicio(pet({ apikey: "sb_secret_x" })), true),
  );
});

Deno.test("acepta la nueva tambien en Bearer, por si el emisor no cambia a la vez", () => {
  conEntorno({ [NUEVAS]: JSON.stringify({ default: "sb_secret_x" }), [LEGADO]: undefined }, () =>
    assertEquals(peticionDeServicio(pet({ Authorization: "Bearer sb_secret_x" })), true),
  );
});

Deno.test("acepta la heredada tambien en apikey", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () =>
    assertEquals(peticionDeServicio(pet({ apikey: "eyJlegado" })), true),
  );
});

// EL CASO QUE JUSTIFICA TODO ESTO. La comprobacion anterior leia la carga del
// JWT sin verificar la firma: bastaba fabricar {"role":"service_role"} y
// firmarlo con cualquier cosa. Con verify_jwt encendido no era explotable; al
// apagarlo, si. Aqui tiene que salir false.
Deno.test("rechaza un JWT FORJADO con role service_role y firma inventada", () => {
  const carga = btoa(JSON.stringify({ role: "service_role", iss: "supabase" }));
  const forjado = `${btoa(JSON.stringify({ alg: "HS256" }))}.${carga}.firma-inventada`;
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () => {
    assertEquals(peticionDeServicio(pet({ Authorization: `Bearer ${forjado}` })), false);
    assertEquals(peticionDeServicio(pet({ apikey: forjado })), false);
  });
});

Deno.test("rechaza una peticion sin ninguna cabecera de clave", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () =>
    assertEquals(peticionDeServicio(pet({})), false),
  );
});

Deno.test("Authorization manda sobre apikey, y si trae basura no cuela", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () =>
    assertEquals(
      peticionDeServicio(pet({ Authorization: "Bearer basura", apikey: "eyJlegado" })),
      false,
    ),
  );
});

Deno.test("el prefijo Bearer se lee sin importar mayusculas", () => {
  conEntorno({ [NUEVAS]: undefined, [LEGADO]: "eyJlegado" }, () =>
    assertEquals(claveEntrante(pet({ Authorization: "bearer eyJlegado" })), "eyJlegado"),
  );
});

// --- Clave publicable (el `userClient` de 21 funciones) ----------------------
// Vigilan lo mismo que las de arriba pero para la clave PUBLICA: que el dia que
// se desactive la `anon` heredada esas funciones sigan actuando en nombre del
// usuario, y que una variable nueva vacia o rota no las deje sin clave.
const NUEVAS_PUB = "SUPABASE_PUBLISHABLE_KEYS";
const LEGADO_PUB = "SUPABASE_ANON_KEY";

function conEntornoPub(
  vars: Record<string, string | undefined>,
  prueba: () => void,
) {
  const previo: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    previo[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  _reiniciarAvisoAnonLegado();
  try {
    prueba();
  } finally {
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("publicable: prefiere la nueva cuando estan las dos", () => {
  conEntornoPub(
    {
      [NUEVAS_PUB]: JSON.stringify({ default: "sb_publishable_nueva" }),
      [LEGADO_PUB]: "eyJanonLegada",
    },
    () => assertEquals(clavePublicable(), "sb_publishable_nueva"),
  );
});

Deno.test("publicable: usa la heredada mientras no exista la nueva", () => {
  conEntornoPub(
    { [NUEVAS_PUB]: undefined, [LEGADO_PUB]: "eyJanonLegada" },
    () => assertEquals(clavePublicable(), "eyJanonLegada"),
  );
});

Deno.test("publicable: JSON roto no deja sin clave, cae al legado", () => {
  conEntornoPub(
    { [NUEVAS_PUB]: "{esto no es json", [LEGADO_PUB]: "eyJanonLegada" },
    () => assertEquals(clavePublicable(), "eyJanonLegada"),
  );
});

Deno.test("publicable: si falta el nombre pedido cae al legado", () => {
  conEntornoPub(
    {
      [NUEVAS_PUB]: JSON.stringify({ otra: "sb_publishable_otra" }),
      [LEGADO_PUB]: "eyJanonLegada",
    },
    () => assertEquals(clavePublicable(), "eyJanonLegada"),
  );
});

Deno.test("publicable: sabe leer una clave que no es la 'default'", () => {
  conEntornoPub(
    {
      [NUEVAS_PUB]: JSON.stringify({ default: "sb_pub_def", movil: "sb_pub_movil" }),
      [LEGADO_PUB]: undefined,
    },
    () => assertEquals(clavePublicable("movil"), "sb_pub_movil"),
  );
});

Deno.test("publicable: sin ninguna de las dos revienta con mensaje claro", () => {
  conEntornoPub(
    { [NUEVAS_PUB]: undefined, [LEGADO_PUB]: undefined },
    () => assertThrows(() => clavePublicable(), Error, "Falta la clave publicable"),
  );
});

Deno.test("publicable: la variante opcional devuelve undefined en vez de lanzar", () => {
  conEntornoPub(
    { [NUEVAS_PUB]: undefined, [LEGADO_PUB]: undefined },
    () => assertEquals(clavePublicableOpcional(), undefined),
  );
});

Deno.test("publicable: el dia del apagon (solo la nueva) sigue funcionando", () => {
  conEntornoPub(
    {
      [NUEVAS_PUB]: JSON.stringify({ default: "sb_publishable_nueva" }),
      [LEGADO_PUB]: undefined,
    },
    () => assertEquals(clavePublicable(), "sb_publishable_nueva"),
  );
});
