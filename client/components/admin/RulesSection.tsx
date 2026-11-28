import React, { useState } from "react";
import type { ModerationRule, RuleChanges, RuleHit } from "../../lib/admin/adminApi";
import { formatWhen } from "../../lib/admin/format";
import { Card, SectionHeader, StatusPill, Table, Tabs } from "./AdminUi";

// The automatic rules (server/lib/enforcement.js). Shadow mode records what a
// rule would do without acting, so its limits can be tuned before enforcing.

const MODES: Array<{ key: ModerationRule["mode"]; label: string }> = [
  { key: "off", label: "Off" },
  { key: "shadow", label: "Shadow" },
  { key: "enforce", label: "Enforce" },
];

function RuleCard({ rule, save }: { rule: ModerationRule; save: (key: string, changes: RuleChanges) => Promise<boolean> }) {
  const [draft, setDraft] = useState({ mode: rule.mode, threshold: String(rule.threshold), window_hours: String(rule.window_hours) });
  const [saving, setSaving] = useState(false);
  const changed = draft.mode !== rule.mode || Number(draft.threshold) !== rule.threshold || Number(draft.window_hours) !== rule.window_hours;
  async function submit() {
    if (draft.mode === "enforce" && rule.mode !== "enforce" && !window.confirm(`${rule.label} will act on accounts automatically. Continue?`)) return;
    setSaving(true);
    try { await save(rule.key, { mode: draft.mode, threshold: Number(draft.threshold), window_hours: Number(draft.window_hours) }); } finally { setSaving(false); }
  }
  return (
    <Card title={rule.label} actions={<StatusPill status={rule.mode} />}>
      <div className="adm-stack">
        <p className="adm-muted">{rule.description}</p>
        <Tabs label={`${rule.label} mode`} tabs={MODES} value={draft.mode} onChange={(mode) => setDraft({ ...draft, mode })} />
        <div className="adm-inline" style={{ alignItems: "flex-end" }}>
          <label className="adm-field"><span className="adm-label">Threshold</span><input type="number" min={1} className="adm-input adm-input--narrow" value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} /></label>
          <label className="adm-field"><span className="adm-label">Within (hours)</span><input type="number" min={1} className="adm-input adm-input--narrow" value={draft.window_hours} onChange={(e) => setDraft({ ...draft, window_hours: e.target.value })} /></label>
          <button type="button" className="adm-btn adm-btn--primary" style={{ marginLeft: "auto" }} disabled={!changed || saving} onClick={() => { void submit(); }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Card>
  );
}

export function Rules({ rules, hits, save }: { rules: ModerationRule[]; hits: RuleHit[]; save: (key: string, changes: RuleChanges) => Promise<boolean> }) {
  const labelOf = Object.fromEntries(rules.map((rule) => [rule.key, rule.label]));
  return (
    <>
      <SectionHeader title="Rules" description="Automatic enforcement. Shadow mode only records what a rule would do; switch it to Enforce once its record looks right. Every action is recorded in Admin activity as System, and the person is told by email and notification." />
      <div className="adm-grid adm-grid--wide">
        {rules.map((rule) => <RuleCard key={`${rule.key}:${rule.mode}:${rule.threshold}:${rule.window_hours}`} rule={rule} save={save} />)}
      </div>
      <h2 className="adm-h2">What the rules saw and did</h2>
      <Table
        columns={["When", "Rule", "About", "Result"]}
        rows={hits}
        empty="Nothing yet. Flagged messages, reports and actions appear here."
        renderRow={(hit) => (
          <tr key={hit.id}>
            <td style={{ whiteSpace: "nowrap" }}>{formatWhen(hit.created_at)}</td>
            <td className="adm-strong">{labelOf[hit.rule_key] || hit.rule_key}</td>
            <td>{hit.target_name || <span className="adm-muted">{hit.target_type === "listing" ? "A listing" : "An account"}</span>}</td>
            <td><StatusPill status={hit.action} /></td>
          </tr>
        )}
      />
    </>
  );
}
