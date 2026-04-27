import { Text, TextProps } from 'react-native';
import { DESIGN_TOKENS } from '@/lib/designTokens';

interface TTextProps extends TextProps {
  weight?: '400' | '500' | '600' | '700' | '800';
}

export function TText({ style, weight = '400', children, ...rest }: TTextProps) {
  const fontFamily = {
    '400': 'Inter_400Regular',
    '500': 'Inter_500Medium',
    '600': 'Inter_600SemiBold',
    '700': 'Inter_700Bold',
    '800': 'Inter_800ExtraBold',
  }[weight];

  let styleArray = Array.isArray(style) ? style : (style ? [style] : []);

  // Always apply white as default, but allow style to override it
  return (
    <Text {...rest} style={[{ fontFamily, color: DESIGN_TOKENS.text }, ...styleArray]}>
      {children}
    </Text>
  );
}
