// The actions offered on a chat message (legacy chat-data.js openMessageMenu,
// plus Copy).

export type MessageAction = 'reply' | 'copy' | 'pin' | 'delete_for_me' | 'delete_for_everyone';

export interface MessageActionItem {
  action: MessageAction;
  icon: string;
  label: string;
}

/** Legacy order with Copy after Reply; "Delete for everyone" only for the sender. */
export function messageActionItems({ pinned, ownMessage }: { pinned: boolean; ownMessage: boolean }): MessageActionItem[] {
  const items: MessageActionItem[] = [
    { action: 'reply', icon: 'i-reply', label: 'Reply' },
    { action: 'copy', icon: 'i-copy', label: 'Copy' },
    { action: 'pin', icon: 'i-pin', label: pinned ? 'Unpin message' : 'Pin message' },
    { action: 'delete_for_me', icon: 'i-trash', label: 'Delete for me' },
  ];
  if (ownMessage) items.push({ action: 'delete_for_everyone', icon: 'i-trash', label: 'Delete for everyone' });
  return items;
}
