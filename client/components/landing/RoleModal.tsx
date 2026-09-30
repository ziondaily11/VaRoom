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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg bg-[#faf7f2] rounded-3xl p-7 sm:p-9 shadow-2xl border border-[#eae2d6] text-[#181513] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-[#786e64] hover:text-[#181513] hover:bg-black/5 transition"
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-[#bd2337] mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>Get Started</span>
          </div>
          <h2 id="join-title" className="font-sans font-bold text-2xl sm:text-3xl text-[#181513]">
            Join VaRoom
          </h2>
          <p className="mt-1 text-sm text-[#594f47]">
            How do you plan to use VaRoom?
          </p>
        </div>

        {/* Role Options */}
        <div className="space-y-4">
          <Link
            href={signupHref('/signup-host')}
            onClick={onClose}
            className="group flex items-start gap-4 p-5 rounded-2xl bg-[#fffefc] border border-[#eae2d6] hover:border-[#181513] transition-all duration-200 hover:shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0 group-hover:scale-105 transition-transform">
              <Building2 size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-sans font-bold text-base text-[#181513] group-hover:text-[#bd2337] transition-colors">
                  Register as Host
                </span>
                <ArrowRight size={16} className="text-[#786e64] group-hover:translate-x-1 group-hover:text-[#181513] transition-all" />
              </div>
              <p className="mt-1 text-xs sm:text-sm text-[#594f47] leading-relaxed">
                List and showcase your spaces—Airbnbs, hotels, venues, offices, or properties.
              </p>
            </div>
          </Link>

          <Link
            href={signupHref('/signup-client')}
            onClick={onClose}
            className="group flex items-start gap-4 p-5 rounded-2xl bg-[#fffefc] border border-[#eae2d6] hover:border-[#181513] transition-all duration-200 hover:shadow-md"
          >
            <div className="w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0 group-hover:scale-105 transition-transform">
              <Compass size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-sans font-bold text-base text-[#181513] group-hover:text-[#bd2337] transition-colors">
                  Register as Client
                </span>
                <ArrowRight size={16} className="text-[#786e64] group-hover:translate-x-1 group-hover:text-[#181513] transition-all" />
              </div>
              <p className="mt-1 text-xs sm:text-sm text-[#594f47] leading-relaxed">
                Find suitable places for events, stays, workspaces, and authentic Kenyan stays.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};
