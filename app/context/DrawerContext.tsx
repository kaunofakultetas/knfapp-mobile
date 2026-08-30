// -----------------------------------------------------------
//  [*] DrawerContext — one app-level navigation drawer
//
//  The Sidebar used to be mounted by every Header instance,
//  so six tab screens each carried their own hidden Modal.
//  Now app/(main)/_layout.tsx mounts ONE Sidebar next to the
//  stack and this context is the switch: any header's
//  hamburger calls open(), the drawer's scrim, swipe and
//  Android back call close().
//
//  Split into (root component last):
//
//    DrawerProvider — holds the open flag (default export)
//    useDrawer      — the consumer hook
// -----------------------------------------------------------

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';


interface DrawerContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerContextType | undefined>(undefined);







// -----------------------------------------------------------
// useDrawer
// -----------------------------------------------------------
//
// Used by:
//   - components/ui/Header.tsx — the hamburger
//   - components/Sidebar.tsx — visibility + close
// -----------------------------------------------------------

export function useDrawer(): DrawerContextType {
  const context = useContext(DrawerContext);
  if (context === undefined) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
}







// -----------------------------------------------------------
// DrawerProvider (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — wraps the stack and the Sidebar
// -----------------------------------------------------------

export default function DrawerProvider({ children }: { children: ReactNode }) {

  const [isOpen, setIsOpen] = useState(false);


  // Stable callback identities — the Sidebar's pan gesture and
  // header effects can list these in deps without rebuilding on
  // every toggle
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);


  // Only the callbacks are stable: consumers still re-render on
  // every toggle because isOpen is part of the value
  const value = useMemo<DrawerContextType>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );


  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}
