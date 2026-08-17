import { Platform, Text, TextProps, TextInput, TextInputProps, TextStyle } from 'react-native';
import { DESIGN_TOKENS } from '@/lib/designTokens';

interface TTextProps extends TextProps {
  weight?: '400' | '500' | '600' | '700' | '800';
}

const IS_WEB = Platform.OS === 'web';

// En NATIVO cada grosor es una familia distinta, porque son los .ttf que carga
// useFonts (app/_layout.tsx). En WEB no: alli Inter llega como fuente variable
// woff2 desde Google Fonts (una sola familia, el grosor lo pone font-weight).
// Pedir alli 'Inter_600SemiBold' obligaba a descargar ademas los cinco .ttf del
// bundle — 1,7 MB de fuentes duplicadas para pintar exactamente lo mismo.
const FAMILIA_NATIVA: Record<string, string> = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
};
const FAMILIA_WEB = 'Inter, system-ui, -apple-system, sans-serif';

function fuente(weight: '400' | '500' | '600' | '700' | '800'): TextStyle {
  return IS_WEB
    ? { fontFamily: FAMILIA_WEB, fontWeight: weight }
    : { fontFamily: FAMILIA_NATIVA[weight] };
}

export function TText({ style, weight = '400', children, ...rest }: TTextProps) {
  let styleArray = Array.isArray(style) ? style : (style ? [style] : []);

  return (
    <Text {...rest} style={[{ ...fuente(weight), color: DESIGN_TOKENS.text }, ...styleArray]}>
      {children}
    </Text>
  );
}

export function TTextInput({ style, ...rest }: TextInputProps) {
  let styleArray = Array.isArray(style) ? style : (style ? [style] : []);
  return (
    <TextInput
      {...rest}
      style={[fuente('400'), ...styleArray]}
      placeholderTextColor={rest.placeholderTextColor || DESIGN_TOKENS.textTertiary}
    />
  );
}
