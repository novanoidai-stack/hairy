import { createContext, useContext, useEffect, useState } from 'react';
import { suscribirIdentidad } from './identidadActiva';

interface CalendarContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Puente identidad -> refresco global. Cuando alguien cambia de persona en el
  // mostrador ("¿Quién eres?"), todo lo que depende de quién eres (mi jornada,
  // agenda, clientes...) tiene que recargar. Sin esto, las pantallas seguían
  // mostrando al profesional anterior hasta que refrescabas a mano.
  useEffect(() => suscribirIdentidad(() => setRefreshTrigger((p) => p + 1)), []);

  return (
    <CalendarContext.Provider value={{ refreshTrigger, triggerRefresh }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarRefresh() {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendarRefresh must be used within CalendarProvider');
  }
  return context;
}
