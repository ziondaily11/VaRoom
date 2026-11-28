import React, { useState } from "react";
import { Plus, ShieldCheck, ShieldAlert } from "lucide-react";
import type { Admin, AdminRole, NewAdmin, SessionAdmin } from "../../lib/admin/adminApi";
import { timeAgo } from "../../lib/admin/format";
import { ActionMenu, Card, Person, Pill, SectionHeader, Table } from "./AdminUi";

/** Admin management: roles, removal and two-step resets (super admins, never on themselves). */
export interface AdminControls {
  setRole: (id: string, role: AdminRole) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  resetTwoStep: (id: string) => Promise<boolean>;
  setupTwoStep: () => Promise<{ secret: string; uri: string } | null>;
  enableTwoStep: (code: string) => Promise<boolean>;
  disableTwoStep: (code: string) => Promise<boolean>;
}

const ROLE_LABELS: Record<string, string> = { super_admin: "Super admin", support: "Support", read_only: "Read only" };

/** The signed-in admin's own two-step sign-in: set up with an authenticator app, confirm a code, or turn off. */
function TwoStep({ me, controls }: { me: SessionAdmin; controls: AdminControls }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const codeInput = (
    <label className="adm-field" style={{ width: 140 }}>
      <span className="adm-label">6-digit code</span>
      <input className="adm-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" style={{ letterSpacing: "0.2em" }} />
    </label>
  );
  return (
    <Card title={<span className="adm-inline">{me.totp_enabled ? <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--adm-good)" }} /> : <ShieldAlert size={18} aria-hidden="true" style={{ color: "var(--adm-warn)" }} />}Your two-step sign-in</span>}
      actions={<Pill tone={me.totp_enabled ? "good" : "warn"} dot>{me.totp_enabled ? "On" : "Off"}</Pill>}>
      {me.totp_enabled ? (
        <div className="adm-stack">
          <p className="adm-muted">Signing in asks for a code from your authenticator app. To turn it off, enter a current code.</p>
          <div className="adm-inline" style={{ alignItems: "flex-end" }}>{codeInput}<button type="button" className="adm-btn adm-btn--danger" disabled={code.length !== 6} onClick={async () => { if (await controls.disableTwoStep(code)) setCode(""); }}>Turn off</button></div>
        </div>
      ) : setup ? (
        <div className="adm-stack">
          <p className="adm-muted">In your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), add an account with this key, or open the link on your phone. Then enter the code it shows.</p>
          <div className="adm-mono" style={{ fontSize: "0.9375rem", padding: "10px 12px", borderRadius: 12, background: "var(--adm-sunken)", wordBreak: "break-all" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</div>
          <a href={setup.uri} className="adm-strong">Open in authenticator app</a>
          <div className="adm-inline" style={{ alignItems: "flex-end" }}>{codeInput}<button type="button" className="adm-btn adm-btn--primary" disabled={code.length !== 6} onClick={async () => { if (await controls.enableTwoStep(code)) { setCode(""); setSetup(null); } }}>Turn on</button></div>
        </div>
      ) : (
        <div className="adm-inline">
          <p className="adm-muted" style={{ flex: "1 1 280px" }}>With it on, a stolen password alone cannot open the admin page.</p>
          <button type="button" className="adm-btn adm-btn--primary" onClick={async () => setSetup(await controls.setupTwoStep())}>Set up two-step sign-in</button>
        </div>
      )}
    </Card>
  );
}

export function Admins({ admins, addAdmin, me, controls }: { admins: Admin[]; addAdmin: (admin: NewAdmin) => Promise<boolean>; me: SessionAdmin | null; controls: AdminControls }) {
  const canManage = me?.role === "super_admin";
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");

  const handleAdd = async () => {
    if (!name || !email) return;
    if (!(await addAdmin({ name, email, role }))) return;
    setName("");
    setEmail("");
    setRole("support");
    setShowForm(false);
  };

  return (
    <>
      <SectionHeader title="Admins" description="Who can open this page. There's no public sign-up: an admin invites each one by email."
        actions={canManage && !showForm ? <button type="button" className="adm-btn adm-btn--primary" onClick={() => setShowForm(true)}><Plus size={16} aria-hidden="true" />Invite admin</button> : undefined} />

      {me && <TwoStep me={me} controls={controls} />}

      {showForm && (
        <Card title="Invite an admin">
          <div className="adm-grid" style={{ alignItems: "end" }}>
            <label className="adm-field"><span className="adm-label">Name</span><input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="adm-field"><span className="adm-label">Email</span><input className="adm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="adm-field"><span className="adm-label">Role</span>
              <select className="adm-select" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                <option value="support">Support</option>
                <option value="read_only">Read only</option>
                <option value="super_admin">Super admin</option>
              </select>
            </label>
          </div>
          <div className="adm-inline" style={{ marginTop: 14 }}>
            <span className="adm-small adm-muted" style={{ flex: "1 1 260px" }}>They get an email to set their own password; the link lasts 24 hours.</span>
            <button type="button" className="adm-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="adm-btn adm-btn--primary" disabled={!name || !email} onClick={() => { void handleAdd(); }}>Send invite</button>
          </div>
        </Card>
      )}

      <Table
        columns={["Admin", "Role", "Two-step", "Last sign-in", ""]}
        rows={admins}
        minWidth={720}
        renderRow={(a) => {
          const self = a.id === me?.id;
          return (
            <tr key={a.id}>
              <td><Person name={`${a.name}${self ? " (you)" : ""}`} sub={a.email} id={a.id} /></td>
              <td>
                {canManage && !self ? (
                  <label><span className="sr-only">Role for {a.name}</span>
                    <select className="adm-select" style={{ width: "auto" }} value={a.role} onChange={(e) => { void controls.setRole(a.id, e.target.value as AdminRole); }}>
                      <option value="support">Support</option>
                      <option value="read_only">Read only</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                  </label>
                ) : <Pill tone="accent">{ROLE_LABELS[a.role] || a.role}</Pill>}
              </td>
              <td><Pill tone={a.totp_enabled ? "good" : "warn"} dot>{a.totp_enabled ? "On" : "Off"}</Pill></td>
              <td style={{ whiteSpace: "nowrap" }}>{a.lastLogin && a.lastLogin !== "Never" ? timeAgo(a.lastLogin) : "Never"}</td>
              <td className="adm-cell-actions">
                {canManage && !self && <ActionMenu label={`Actions for ${a.name}`} actions={[
                  ...(a.totp_enabled ? [{ label: "Reset two-step sign-in", onConfirm: () => controls.resetTwoStep(a.id) }] : []),
                  { label: "Remove admin", danger: true, separatorBefore: Boolean(a.totp_enabled), onConfirm: () => controls.remove(a.id) },
                ]} />}
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}
