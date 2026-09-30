import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { X, Building2, Compass, ArrowRight } from 'lucide-react';

interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleModal: React.FC<RoleModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const signupHref = (href: string) => {
    const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : '';
    return redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-sm sm:max-w-md bg-[#faf7f2]/85 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.18)] border border-white/60 text-[#181513] animate-in zoom-in-95 duration-200 box-border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
      >
        {/* Close Button - Clean light glass circle with high-contrast dark X */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-white/80 hover:bg-white border border-white/70 text-[#181513] hover:text-black flex items-center justify-center shadow-xs transition-all duration-150 cursor-pointer"
          aria-label="Close dialog"
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        {/* Modal Header */}
        <div className="mb-5 sm:mb-6 pr-8">
          <h2 id="join-title" className="font-sans font-bold text-xl sm:text-2xl text-[#181513] tracking-tight">
            Join VaRoom
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#594f47]">
            How do you plan to use VaRoom?
          </p>
        </div>

        {/* Simplified Compact Role Options */}
        <div className="space-y-3">
          <Link
            href={signupHref('/signup-host')}
            onClick={onClose}
            className="group flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/70 hover:bg-white/95 border border-white/70 hover:border-[#181513]/25 transition-all duration-200 hover:shadow-xs no-underline"
            style={{ textDecoration: 'none' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0 group-hover:scale-105 transition-transform">
              <Building2 size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className="font-sans font-bold text-sm sm:text-base text-[#181513] group-hover:text-[#bd2337] transition-colors block leading-snug"
                style={{ textDecoration: 'none' }}
              >
                Host
              </span>
              <span
                className="text-xs text-[#594f47] block mt-0.5"
                style={{ textDecoration: 'none' }}
              >
                List your spaces
              </span>
            </div>
            <ArrowRight
              size={16}
              className="text-[#786e64] group-hover:text-[#181513] group-hover:translate-x-1 transition-all shrink-0 ml-auto"
            />
          </Link>

          <Link
            href={signupHref('/signup-client')}
            onClick={onClose}
            className="group flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/70 hover:bg-white/95 border border-white/70 hover:border-[#181513]/25 transition-all duration-200 hover:shadow-xs no-underline"
            style={{ textDecoration: 'none' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0 group-hover:scale-105 transition-transform">
              <Compass size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className="font-sans font-bold text-sm sm:text-base text-[#181513] group-hover:text-[#bd2337] transition-colors block leading-snug"
                style={{ textDecoration: 'none' }}
              >
                Client
              </span>
              <span
                className="text-xs text-[#594f47] block mt-0.5"
                style={{ textDecoration: 'none' }}
              >
                Find spaces
              </span>
            </div>
            <ArrowRight
              size={16}
              className="text-[#786e64] group-hover:text-[#181513] group-hover:translate-x-1 transition-all shrink-0 ml-auto"
            />
          </Link>
        </div>
      </div>
    </div>
  );
};
