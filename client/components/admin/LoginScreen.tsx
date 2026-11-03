import React, { useState } from "react";
import { Lock } from "lucide-react";

export function LoginScreen({ onLogin, error }: { onLogin: (email: string, password: string) => void; error: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <form className="w-full max-w-sm border border-[#E4E1DA] rounded-sm bg-white p-6" onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-[#1F6F5C]" />
          <span className="text-sm text-[#24211E]">Varoom Admin</span>
        </div>
        <p className="text-xs text-[#8a857c] mb-5">
          Admin access only. There's no signup here — accounts are created internally.
        </p>
        <label className="text-xs text-[#8a857c]">Email</label>
        <input
          className="w-full mb-3 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@varoom.app"
        />
        <label className="text-xs text-[#8a857c]">Password</label>
        <input
          type="password"
          className="w-full mb-4 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <button
          type="submit"
          className="w-full py-2 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b]"
        >
          Log in
        </button>
        {error && <div className="mt-3 text-xs text-[#B5482E]">{error}</div>}
      </form>
    </div>
  );
}
