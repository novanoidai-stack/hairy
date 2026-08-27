// Shim de react-native para Deno: solo lo que usan los modulos de lib/ cargados en tests.
// La app real (Metro/Expo) nunca pasa por aqui; esto vive solo en el import map de deno.json.
export const Platform = { OS: "web", select: (o) => o.web ?? o.default };
