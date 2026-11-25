import React, { useEffect, useRef, useState } from 'react';
import type { ElieQuestion, ElieQuestionOption } from '../../lib/chat/elie';

// Elie's question in place of the composer (guided search): tap an option,
// or type one ("Somewhere else…"), skip it, go back, or type instead. Keys
// 1-4 pick an option and Esc goes back to typing. Every option has listings.

export default function ElieQuestionCard({ question, onChoose, onOther, onSkip, onType, onBack }: {
  question: ElieQuestion;
  onChoose: (option: ElieQuestionOption) => void;
  onOther: (text: string) => void;
  onSkip: () => void;
  onType: () => void;
  onBack?: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);

  // 1-4 and Esc, unless the person is typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === 'Escape') { event.preventDefault(); if (typing) setTyping(false); else onType(); return; }
      if (editing || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < question.options.length) { event.preventDefault(); onChoose(question.options[index]); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [question, typing, onChoose, onType]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (clean) onOther(clean);
  };

  return (
    <div className="elie-question-card" role="group" aria-label={question.text}>
      <div className="elie-question-head">
        <span className="elie-question-title">{question.text}</span>
        <span className="elie-question-step">Question {question.step}</span>
      </div>
      <div className="elie-question-options">
        {question.options.map((option, index) => (
          <button type="button" key={option.value} className="elie-question-option" onClick={() => onChoose(option)}>
            <span className="elie-option-key" aria-hidden="true">{index + 1}</span>
            <span className="elie-option-label">{option.label}</span>
            {option.count != null && <span className="elie-option-count" aria-label={`${option.count} listings`}>{option.count}</span>}
          </button>
        ))}
        {question.other && !typing && (
          <button type="button" className="elie-question-option is-other" onClick={() => setTyping(true)}>
            <span className="elie-option-label">{question.other}</span>
          </button>
        )}
      </div>
      {typing && (
        <form className="elie-question-other" onSubmit={submit}>
          <input ref={inputRef} value={text} maxLength={80} onChange={(event) => setText(event.target.value)}
            placeholder={question.field === 'budget' ? 'e.g. 5,000' : question.field === 'guests' ? 'e.g. 12' : 'e.g. Karen'}
            inputMode={question.field === 'budget' || question.field === 'guests' ? 'numeric' : 'text'} aria-label={question.other || 'Your answer'} />
          <button type="submit" disabled={!text.trim()}>Send</button>
        </form>
      )}
      <div className="elie-question-actions">
        {onBack && <button type="button" onClick={onBack}>Back</button>}
        <button type="button" onClick={onSkip}>Skip</button>
        <button type="button" onClick={onType}>Type instead</button>
      </div>
    </div>
  );
}
