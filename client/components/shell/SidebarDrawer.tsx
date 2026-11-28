import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

// The sidebar drawer's open state on phones, owned once in _app. The host and
// client sidebars read it; MenuButton opens it. It closes after every navigation.

interface DrawerState { open: boolean; setOpen: (open: boolean) => void }

const DrawerContext = createContext<DrawerState>({ open: false, setOpen: () => undefined });

export function SidebarDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { asPath } = useRouter();
  useEffect(() => setOpen(false), [asPath]);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export const useSidebarDrawer = (): DrawerState => useContext(DrawerContext);
