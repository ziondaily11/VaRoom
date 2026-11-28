import React from "react";
import type { VaroomReviewRow } from "../../lib/admin/adminApi";
import { formatDate } from "../../lib/admin/format";
import { Person, Pill, SectionHeader, StatusPill, Table } from "./AdminUi";

const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));

// Reviews of VaRoom from Help & Support. Every new or edited review waits
// here; the sign-in panel shows the most recently approved one with words.
export function VaroomReviews({ reviews, setStatus }: {
  reviews: VaroomReviewRow[];
  setStatus: (id: string, status: VaroomReviewRow["status"]) => void;
}) {
  return (
    <>
      <SectionHeader title="VaRoom reviews" description="Ratings of VaRoom from Help & Support. The sign-in page shows the most recently approved review that has words (it updates within about 5 minutes)." />
      <Table
        columns={["Author", "Rating", "Review", "Status", "Updated", ""]}
        rows={reviews}
        empty="No reviews of VaRoom yet."
        minWidth={860}
        renderRow={(r) => (
          <tr key={r.id}>
            <td><Person name={r.author_name} sub={r.author_role === "host" ? "Host" : "Guest"} id={r.user_id} /></td>
            <td style={{ color: "var(--adm-warn)", whiteSpace: "nowrap" }} aria-label={`${r.rating} of 5 stars`}>{stars(r.rating)}</td>
            <td className="adm-cell-wrap">{r.comment || <span className="adm-muted">Stars only</span>}</td>
            <td><StatusPill status={r.status} />{r.status === "pending" && <div style={{ marginTop: 4 }}><Pill tone="info">Waiting for you</Pill></div>}</td>
            <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.updated_at)}</td>
            <td className="adm-cell-actions">
              <div className="adm-inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                {r.status !== "hidden" && <button type="button" className="adm-btn adm-btn--sm" onClick={() => setStatus(r.id, "hidden")}>Hide</button>}
                {r.status !== "approved" && <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => setStatus(r.id, "approved")}>Approve</button>}
              </div>
            </td>
          </tr>
        )}
      />
    </>
  );
}
