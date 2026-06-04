import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

// Logo de Mecha (llama) — portado del símbolo #mecha-mark de la landing.
// El cuerpo lleva el gradiente fuego; la curva interior blanca queda sobre el cuerpo.
export function MechaMark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="mGrad" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#e0340e" />
          <Stop offset="0.5" stopColor="#ff7a2e" />
          <Stop offset="1" stopColor="#ffcf4a" />
        </LinearGradient>
      </Defs>
      <Path
        d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z"
        fill="url(#mGrad)"
      />
      <Path
        d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z"
        fill="#fff"
        opacity={0.92}
      />
    </Svg>
  );
}
