import React from "react";

// The dashboard's shared pieces. styles/admin.css matches these class names
// (dark mode), so they must stay as they are.

export function StatCard({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: boolean }) {
  return (
    <div
      className={`border rounded-sm p-4 bg-white ${
        alert ? "border-[#B5482E]" : "border-[#E4E1DA]"
      }`}
    >
      <div className="text-xs tracking-wide text-[#8a857c]">{label}</div>
      <div
        className={`mt-2 font-mono text-2xl ${
          alert ? "text-[#B5482E]" : "text-[#24211E]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#8a857c]">{sub}</div>}
    </div>
  );
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl text-[#24211E]">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-[#8a857c] max-w-[60ch]">{description}</p>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  const map: Record<string, { text: string; cls: string }> = {
    open: { text: "Open", cls: "bg-[#B5482E]/10 text-[#B5482E]" },
    in_progress: { text: "In progress", cls: "bg-[#C77D22]/10 text-[#C77D22]" },
    resolved: { text: "Resolved", cls: "bg-[#1F6F5C]/10 text-[#1F6F5C]" },
    pending: { text: "Pending", cls: "bg-[#B5482E]/10 text-[#B5482E]" },
    reviewed: { text: "Reviewed", cls: "bg-[#1F6F5C]/10 text-[#1F6F5C]" },
    active: { text: "Active", cls: "bg-[#1F6F5C]/10 text-[#1F6F5C]" },
    suspended: { text: "Suspended", cls: "bg-[#B5482E]/10 text-[#B5482E]" },
  };
  const { text, cls } = (status && map[status]) || { text: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-sm text-xs ${cls}`}>{text}</span>
  );
}

export function Table<T>({ columns, rows, renderRow }: { columns: string[]; rows: T[]; renderRow: (row: T, index: number) => React.ReactNode }) {
  return (
    <div className="border border-[#E4E1DA] rounded-sm bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E4E1DA] text-left text-xs text-[#8a857c]">
            {columns.map((c) => (
              <th key={c} className="px-4 py-2 font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

/** An audited action: asks for the reason (required for dangerous ones) and confirms dangerous ones. */
export function ConsequentialButton({ label, tone = "normal", onConfirm }: { label: string; tone?: "normal" | "danger"; onConfirm: (reason: string) => Promise<unknown> }) {
  const handleClick = async () => {
    const reason = window.prompt(`${label}: enter the reason for the audit record.`);
    if (reason === null) return;
    if (!reason.trim() && tone === "danger") {
      window.alert("A reason is required for this action.");
      return;
    }
    if (tone === "danger" && !window.confirm(`${label} will take effect across VaRoom. Continue?`)) return;
    await onConfirm(reason.trim());
  };
  return <button onClick={handleClick} className={`text-xs px-2 py-1 rounded-sm border ${tone === "danger" ? "border-[#B5482E]/40 text-[#B5482E]" : "border-[#E4E1DA] text-[#5c584f]"}`}>{label}</button>;
}
