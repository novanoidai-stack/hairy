// Stub nativo. El modal de estrategias de retraso es web-first (ver
// RetrasoEstrategiasModal.web.tsx); en nativo no se renderiza (la agenda rica es la web).
// Existe para que el import `./RetrasoEstrategiasModal` resuelva en typecheck/native.
export default function RetrasoEstrategiasModal(_props: any) {
  return null;
}
