import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;
  // Un portatil de 1366 y un monitor de 1920 caian los dos en isDesktop y recibian
  // el mismo layout, pensado para el ancho del monitor. Lo que no cabia lo partia
  // flexWrap en otra fila, y en un portatil (~600px de alto util) esa fila extra se
  // come un tercio de la pantalla. isLaptop separa ese tramo para compactar densidad.
  const isLaptop = width >= 1024 && width < 1440;
  return { isDesktop, isTablet, isMobile, isLaptop, width };
}
