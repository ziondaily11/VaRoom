import React, { useState } from 'react';
import ElieIcon from '../ElieIcon';
import { text, type FieldBinding } from '../../lib/listWizard/formState';
import { elieHostDenial, writeWithElie, type ElieWriteField } from '../../lib/elieHost';

// "Write with Elie" under the summary highlight and the description: Elie
// writes the text from the listing's details, or improves what is there.
// Undo puts back the previous text. Plans without Elie get a link to the plans.

export interface ElieWriteSource { category: string; facts: () => Record<string, string> }

export default function ElieWrite({ field, fieldId, binding, source, maxLength }: {
  field: ElieWriteField; fieldId: string; binding: FieldBinding; source: ElieWriteSource; maxLength?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; link: string | null } | null>(null);
  const current = text(binding.fields, fieldId);

  const write = async () => {
    setBusy(true);
    setNote(null);
    try {
      const written = await writeWithElie({ field, category: source.category, facts: source.facts(), current });
      setUndo(current);
      binding.setField(fieldId, maxLength ? written.slice(0, maxLength) : written);
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : 'Elie couldn’t write this right now.', link: elieHostDenial(error)?.plansUrl || null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="elie-write">
      <button type="button" className="elie-write-button" onClick={() => { void write(); }} disabled={busy} aria-busy={busy}>
        <ElieIcon size={16} state={busy ? 'working' : 'default'} />
        {busy ? 'Elie is writing…' : current.trim() ? 'Improve with Elie' : 'Write with Elie'}
      </button>
      {undo !== null && !busy && (
        <button type="button" className="elie-write-undo" onClick={() => { binding.setField(fieldId, undo); setUndo(null); }}>Undo</button>
      )}
      {note && <p className="elie-write-note" role="alert">{note.text}{note.link && <> <a href={note.link}>See plans</a></>}</p>}
    </div>
  );
}
