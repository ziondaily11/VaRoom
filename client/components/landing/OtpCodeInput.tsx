import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { applyOtpInput, clearOtpCode, notifyOtpCompletion } from '../../public/js/auth-flow-utils';

export interface OtpCodeInputHandle {
  clearAndFocus: () => void;
  focusFirst: () => void;
}

interface OtpCodeInputProps {
  idPrefix: string;
  value: string[];
  onChange: (code: string[]) => void;
  onComplete: (token: string) => void;
  disabled?: boolean;
}

export const OtpCodeInput = forwardRef<OtpCodeInputHandle, OtpCodeInputProps>(
  ({ idPrefix, value, onChange, onComplete, disabled = false }, ref) => {
    const firstInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      clearAndFocus: () => {
        clearOtpCode(onChange, () => {
          window.requestAnimationFrame(() => firstInputRef.current?.focus());
        });
      },
      focusFirst: () => firstInputRef.current?.focus(),
    }), [onChange]);

    const updateCode = (index: number, inputValue: string) => {
      const next = applyOtpInput(value, index, inputValue);
      onChange(next);

      const nextFocusIndex = inputValue.replace(/\D/g, '').length > 1
        ? Math.min(inputValue.replace(/\D/g, '').length, 5)
        : index + 1;
      if (nextFocusIndex < 6) {
        document.getElementById(`${idPrefix}-${nextFocusIndex}`)?.focus();
      }
      notifyOtpCompletion(next, onComplete);
    };

    const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && !value[index] && index > 0) {
        document.getElementById(`${idPrefix}-${index - 1}`)?.focus();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        document.getElementById(`${idPrefix}-${index - 1}`)?.focus();
      } else if (event.key === 'ArrowRight' && index < 5) {
        document.getElementById(`${idPrefix}-${index + 1}`)?.focus();
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (!digits) return;
      const next = applyOtpInput(value, 0, digits);
      onChange(next);
      document.getElementById(`${idPrefix}-${Math.min(digits.length, 5)}`)?.focus();
      notifyOtpCompletion(next, onComplete);
    };

    return (
      <div className="grid grid-cols-6 gap-2" aria-label="Six-digit verification code">
        {value.map((digit, index) => (
          <input
            key={index}
            ref={index === 0 ? firstInputRef : undefined}
            id={`${idPrefix}-${index}`}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : undefined}
            maxLength={1}
            aria-label={`Digit ${index + 1}`}
            value={digit}
            disabled={disabled}
            onChange={(event) => updateCode(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            className="h-12 min-w-0 rounded-lg border border-white/10 bg-white/5 text-center text-lg text-[#f5efe7] outline-none focus:border-white/40 disabled:opacity-60"
          />
        ))}
      </div>
    );
  }
);

OtpCodeInput.displayName = 'OtpCodeInput';
