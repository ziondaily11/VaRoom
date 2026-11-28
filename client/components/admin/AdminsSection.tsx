import React, { useState } from "react";
import { Plus } from "lucide-react";
import type { Admin, AdminRole, NewAdmin, SessionAdmin } from "../../lib/admin/adminApi";
import { ConsequentialButton, SectionHeader } from "./AdminUi";

/** Admin management: roles, removal and two-step resets (super admins, never on themselves). */
export interface AdminControls {
  setRole: (id: string, role: AdminRole) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  resetTwoStep: (id: string) => Promise<boolean>;
  setupTwoStep: () => Promise<{ secret: string; uri: string } | null>;
  enableTwoStep: (code: string) => Promise<boolean>;
  disableTwoStep: (code: string) => Promise<boolean>;
}

/** The signed-in admin's own two-step sign-in: set up with an authenticator app, confirm a code, or turn off. */
function TwoStep({ me, controls }: { me: SessionAdmin; controls: AdminControls }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const field = "border border-[#E4E1DA] rounded-sm p-2 text-sm tracking-widest w-28";
  const codeInput = <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className={field} aria-label="Code" />;
  return (
    <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-4 max-w-xl">
      <div className="text-sm text-[#24211E] mb-1">Your two-step sign-in</div>
      {me.totp_enabled ? <>
        <p className="text-xs text-[#8a857c] mb-2">On. Signing in asks for a code from your authenticator app. To turn it off, enter a current code.</p>
        <div className="flex gap-2">{codeInput}<button disabled={code.length !== 6} onClick={async () => { if (await controls.disableTwoStep(code)) setCode(""); }} className="px-3 py-1.5 text-sm border border-[#B5482E]/40 text-[#B5482E] rounded-sm disabled:opacity-50">Turn off</button></div>
      </> : setup ? <>
        <p className="text-xs text-[#8a857c] mb-2">In your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), add an account with this key, or open the link on your phone. Then enter the 6-digit code it shows.</p>
        <div className="font-mono text-sm break-all bg-[#F7F6F3] p-2 rounded-sm mb-1">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</div>
        <a href={setup.uri} className="text-xs text-[#1F6F5C] hover:underline">Open in authenticator app</a>
        <div className="flex gap-2 mt-3">{codeInput}<button disabled={code.length !== 6} onClick={async () => { if (await controls.enableTwoStep(code)) { setCode(""); setSetup(null); } }} className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm disabled:opacity-50">Turn on</button></div>
      </> : <>
        <p className="text-xs text-[#8a857c] mb-2">Off. With it on, a stolen password alone cannot open the admin page.</p>
        <button onClick={async () => setSetup(await controls.setupTwoStep())} className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm">Set up two-step sign-in</button>
      </>}
    </div>
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
    <div>
      <SectionHeader
        title="Admins"
        description="There's no public admin signup — accounts are only created here, by an already-logged-in admin."
      />

      {me && <TwoStep me={me} controls={controls} />}

      <div className="border border-[#E4E1DA] rounded-sm bg-white overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E4E1DA] text-left text-xs text-[#8a857c]">
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Email</th>
              <th className="px-4 py-2 font-normal">Role</th>
              <th className="px-4 py-2 font-normal">Last login</th>
              <th className="px-4 py-2 font-normal">Two-step</th>
              {canManage && <th className="px-4 py-2 font-normal">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-[#E4E1DA] last:border-0">
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2 text-[#8a857c]">{a.email}</td>
                <td className="px-4 py-2">
                  {canManage && a.id !== me?.id ? (
                    <select value={a.role} onChange={(e) => { void controls.setRole(a.id, e.target.value as AdminRole); }} className="text-xs border border-[#E4E1DA] rounded-sm px-1 py-0.5">
                      <option value="support">support</option>
                      <option value="read_only">read only</option>
                      <option value="super_admin">super admin</option>
                    </select>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-sm bg-[#1F6F5C]/10 text-[#1F6F5C]">
                      {a.role.replace("_", " ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-[#8a857c]">{a.lastLogin}</td>
                <td className="px-4 py-2 text-xs">{a.totp_enabled ? "On" : <span className="text-[#B5482E]">Off</span>}</td>
                {canManage && <td className="px-4 py-2"><div className="flex gap-2">
                  {a.id !== me?.id && a.totp_enabled && <ConsequentialButton label="Reset two-step" onConfirm={() => controls.resetTwoStep(a.id)} />}
                  {a.id !== me?.id && <ConsequentialButton label="Remove" tone="danger" onConfirm={() => controls.remove(a.id)} />}
                </div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm ? (
        <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 max-w-md">
          <div className="text-sm text-[#24211E] mb-3">Add admin</div>
          <label className="text-xs text-[#8a857c]">Name</label>
          <input
            className="w-full mb-2 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="text-xs text-[#8a857c]">Email</label>
          <input
            className="w-full mb-2 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="text-xs text-[#8a857c]">Role</label>
          <select
            className="w-full mb-3 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
          >
            <option value="support">Support</option>
            <option value="read_only">Read only</option>
            <option value="super_admin">Super admin</option>
          </select>
          <div className="text-xs text-[#8a857c] mb-3">
            They'll be sent an invite to set their own password — there's no open signup page.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b]"
            >
              Send invite
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-[#5c584f] hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#E4E1DA] rounded-sm text-[#24211E] hover:bg-[#F7F6F3]"
        >
          <Plus size={14} /> Add admin
        </button>
      )}
    </div>
  );
}
