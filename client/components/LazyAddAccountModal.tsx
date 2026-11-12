import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Stands in for AddAccountModal on every page so its code (and the sign-in
// helpers it pulls in) loads only when someone first opens it. It keeps the
// modal's contract: the `varoom:open-add-account` event, the switcher's
// openAddAccountModal, and the flag that stops the legacy switcher showing
// its own dialog. Once loaded, the modal registers itself over these.
const AddAccountModal = dynamic(() => import('./AddAccountModal'), { ssr: false });

export default function LazyAddAccountModal() {
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const open = () => setOpened(true);
    window.__varoomAddAccountModalMounted = true;
    window.addEventListener('varoom:open-add-account', open);
    const switcher = window.VaRoomAccountSwitcher;
    if (switcher && !switcher.openAddAccountModal) switcher.openAddAccountModal = open;
    return () => {
      window.removeEventListener('varoom:open-add-account', open);
      if (switcher && switcher.openAddAccountModal === open) switcher.openAddAccountModal = undefined;
    };
  }, []);
  return opened ? <AddAccountModal openOnMount /> : null;
}
