import React, { useState } from "react";
import type { ModerationRule, RuleChanges, RuleHit } from "../../lib/admin/adminApi";
import { SectionHeader, StatusPill, Table } from "./AdminUi";

// The automatic rules (server/lib/enforcement.js). Shadow mode records what a
// rule would do without acting, so its limits can be tuned before enforcing.

const MODES: Array<{ value: ModerationRule["mode"]; label: string }> = [
  { value: "off", label: "Off" },
  { value: "shadow", label: "Shadow (record only)" },
  { value: "enforce", label: "Enforce" },
];

function RuleRow({ rule, save }: { rule: ModerationRule; save: (key: string, changes: RuleChanges) => Promise<boolean> }) {
  const [draft, setDraft] = useState({ mode: rule.mode, threshold: String(rule.threshold), window_hours: String(rule.window_hours) });
  const [saving, setSaving] = useState(false);
  const changed = draft.mode !== rule.mode || Number(draft.threshold) !== rule.threshold || Number(draft.window_hours) !== rule.window_hours;
  async function submit() {
    if (draft.mode === "enforce" && rule.mode !== "enforce" && !window.confirm(`${rule.label} will act on accounts automatically. Continue?`)) return;
    setSaving(true);
    try { await save(rule.key, { mode: draft.mode, threshold: Number(draft.threshold), window_hours: Number(draft.window_hours) }); } finally { setSaving(false); }
  }
  const field = "w-20 border border-[#E4E1DA] rounded-sm p-1 text-sm";
  return (
    <tr className="border-b border-[#E4E1DA] last:border-0 align-top">
      <td className="px-4 py-2"><div>{rule.label}</div><div className="text-xs text-[#8a857c] max-w-[48ch]">{rule.description}</div></td>
      <td className="px-4 py-2">
        <select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as ModerationRule["mode"] })} className="border border-[#E4E1DA] rounded-sm p-1 text-sm">
          {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </td>
      <td className="px-4 py-2"><input type="number" min={1} value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} className={field} /></td>
      <td className="px-4 py-2"><input type="number" min={1} value={draft.window_hours} onChange={(e) => setDraft({ ...draft, window_hours: e.target.value })} className={field} /></td>
      <td className="px-4 py-2"><button disabled={!changed || saving} onClick={() => { void submit(); }} className="text-xs px-2 py-1 rounded-sm bg-[#1F6F5C] text-white disabled:opacity-40">Save</button></td>
    </tr>
  );
}

export function Rules({ rules, hits, save }: { rules: ModerationRule[]; hits: RuleHit[]; save: (key: string, changes: RuleChanges) => Promise<boolean> }) {
  const labelOf = Object.fromEntries(rules.map((rule) => [rule.key, rule.label]));
  return (
    <div>
      <SectionHeader title="Rules" description="Automatic enforcement. Each action is recorded in Admin activity as System and the person is told by email and notification. Start a rule in shadow mode and enforce it once its record looks right." />
      <Table columns={["Rule", "Mode", "Threshold", "Window (hours)", ""]} rows={rules} renderRow={(rule) => <RuleRow key={`${rule.key}:${rule.mode}:${rule.threshold}:${rule.window_hours}`} rule={rule} save={save} />} />
      <div className="mt-6" />
      <SectionHeader title="Recent rule activity" description="Flagged signals, actions taken, and (in shadow mode) the actions a rule would have taken." />
      <Table
        columns={["When", "Rule", "Target", "Result"]}
        rows={hits}
        renderRow={(hit) => (
          <tr key={hit.id} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2 text-xs text-[#8a857c]">{new Date(hit.created_at).toLocaleString()}</td>
            <td className="px-4 py-2">{labelOf[hit.rule_key] || hit.rule_key}</td>
            <td className="px-4 py-2 text-xs">{hit.target_type}: {hit.target_name || hit.target_id}</td>
            <td className="px-4 py-2"><StatusPill status={hit.action.replaceAll("_", " ")} /></td>
          </tr>
        )}
      />
    </div>
  );
}
