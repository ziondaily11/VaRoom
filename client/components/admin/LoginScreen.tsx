import React, { useState } from "react";

/** Email and password; then, for an admin with two-step sign-in, the authenticator code. */
export function LoginScreen({ onLogin, error, codeRequired }: {
  onLogin: (email: string, password: string, code?: string) => void; error: string; codeRequired: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="admin-login">
      <form className="adm-login-card" onSubmit={(event) => { event.preventDefault(); onLogin(email, password, codeRequired ? code : undefined); }}>
        <div className="adm-brand" style={{ padding: 0 }}>
          <span className="adm-brand__va">Va</span><span className="adm-brand__room">Room</span>
          <span className="adm-brand__tag">Admin</span>
        </div>
        <div>
          <h1 className="adm-title" style={{ fontSize: "1.5rem" }}>Sign in</h1>
          <p className="adm-subtitle">For VaRoom staff only. Admins are invited; there&apos;s no sign-up here.</p>
        </div>
        <label className="adm-field"><span className="adm-label">Email</span>
          <input className="adm-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="adm-field"><span className="adm-label">Password</span>
          <input className="adm-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {codeRequired && (
          <label className="adm-field"><span className="adm-label">Code from your authenticator app</span>
            <input className="adm-input" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" style={{ letterSpacing: "0.2em" }} />
          </label>
        )}
        <button type="submit" className="adm-btn adm-btn--primary">Sign in</button>
        {error && <div className="adm-error" role="alert">{error}</div>}
      </form>
    </div>
  );
}
