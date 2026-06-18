// Stub nativo. La propuesta de retraso es web-first (ver RetrasoPropuestaModal.web.tsx);
// en nativo no se renderiza (la agenda rica es la web). Existe para que el import
// `./RetrasoPropuestaModal` resuelva en typecheck/native sin romper el bundle.
export default function RetrasoPropuestaModal(_props: any) {
  return null;
}
