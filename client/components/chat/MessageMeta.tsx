import React from 'react';
import type { MessageStatus } from '../../lib/chat/chatMedia';

// The time in the bubble's bottom-right corner, with ticks on the user's own
// messages: a clock while sending, one tick sent, two delivered, two in the
// read colour once read.

const STATUS_LABEL: Record<MessageStatus, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

function StatusIcon({ status }: { status: MessageStatus }) {
  if (status === 'sending') {
    return (
      <svg className="msg-ticks" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5v3l2 1.5" />
      </svg>
    );
  }
  return (
    <svg className="msg-ticks" viewBox="0 0 18 12" aria-hidden="true">
      {status === 'sent' ? <path d="m3.5 6.5 3 3 6-7" /> : <><path d="m1 6.5 3 3 6-7" /><path d="m7.5 9 .5.5 6-7" /></>}
    </svg>
  );
}

export default function MessageMeta({ time, status }: { time: string; status: MessageStatus | null }) {
  return (
    <span className={`msg-meta${status ? ` msg-status-${status}` : ''}`}>
      <span className="msg-time">{time}</span>
      {status && (
        <span className="msg-status" role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]}>
          <StatusIcon status={status} />
        </span>
      )}
    </span>
  );
}
