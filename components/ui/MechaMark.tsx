import React from 'react';
import { View, Text, StyleSheet, Platform, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

// Color del punto característico de Mecha y degradados fuego oficiales
export const MECHA_FIRE_COLOR = '#f4501e';
export const MECHA_FIRE_GRADIENT = ['#e0340e', '#ff7a2e', '#ffcf4a'] as const;

export const WORDMARK_FONT_FAMILY = Platform.select({
  web: "'Bricolage Grotesque', 'Inter', system-ui, -apple-system, sans-serif",
  default: undefined,
});

/**
 * Isotipo clásico de Mecha (Llama con gradiente fuego y curva interior blanca).
 */
export function MechaMark({ size = 30, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
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
    </View>
  );
}

/**
 * Wordmark oficial de la marca: "Mecha." con el punto fuego característico.
 */
export function MechaWordmark({
  fontSize = 24,
  color = '#1c1814',
  dotColor = MECHA_FIRE_COLOR,
  style,
}: {
  fontSize?: number;
  color?: string;
  dotColor?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize,
          color,
          lineHeight: Math.round(fontSize * 1.15),
        },
        style,
      ]}
    >
      Mecha<Text style={{ color: dotColor }}>.</Text>
    </Text>
  );
}

/**
 * Logo unificado de Mecha: combina el isotipo (llama clásica) y el wordmark ("Mecha.").
 * Permite ubicar la llama delante ('front') o detrás ('back'), o añadir una etiqueta (tag).
 */
export function MechaLogo({
  size = 32,
  fontSize,
  flamePosition = 'front',
  color = '#1c1814',
  tag,
  tagColor = '#736658',
  tagBorderColor = 'rgba(40,30,24,0.12)',
  style,
}: {
  size?: number;
  fontSize?: number;
  flamePosition?: 'front' | 'back';
  color?: string;
  tag?: string;
  tagColor?: string;
  tagBorderColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const calculatedFontSize = fontSize ?? Math.round(size * 0.72);
  const mark = <MechaMark key="mark" size={size} />;
  const wordmark = (
    <MechaWordmark
      key="wordmark"
      fontSize={calculatedFontSize}
      color={color}
    />
  );

  return (
    <View style={[styles.logoContainer, style]}>
      {flamePosition === 'front' ? (
        <>
          {mark}
          {wordmark}
        </>
      ) : (
        <>
          {wordmark}
          {mark}
        </>
      )}
      {tag ? (
        <View style={[styles.tagBadge, { borderColor: tagBorderColor }]}>
          <Text style={[styles.tagText, { color: tagColor }]}>{tag}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontFamily: WORDMARK_FONT_FAMILY,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  tagBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  tagText: {
    fontSize: 9.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});

