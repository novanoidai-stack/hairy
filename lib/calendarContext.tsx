import { createContext, useContext, useState } from 'react';

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
