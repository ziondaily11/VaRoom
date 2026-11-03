import React, { useState } from "react";
import { Plus } from "lucide-react";
import type { Admin, AdminRole, NewAdmin } from "../../lib/admin/adminApi";
import { SectionHeader } from "./AdminUi";

export function Admins({ admins, addAdmin }: { admins: Admin[]; addAdmin: (admin: NewAdmin) => Promise<boolean> }) {
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

      <div className="border border-[#E4E1DA] rounded-sm bg-white overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E4E1DA] text-left text-xs text-[#8a857c]">
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Email</th>
              <th className="px-4 py-2 font-normal">Role</th>
              <th className="px-4 py-2 font-normal">Last login</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-[#E4E1DA] last:border-0">
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2 text-[#8a857c]">{a.email}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-sm bg-[#1F6F5C]/10 text-[#1F6F5C]">
                    {a.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2 text-[#8a857c]">{a.lastLogin}</td>
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
