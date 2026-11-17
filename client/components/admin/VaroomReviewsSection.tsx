import React from "react";
import type { VaroomReviewRow } from "../../lib/admin/adminApi";
import { SectionHeader, StatusPill, Table } from "./AdminUi";

const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));

// Reviews of VaRoom from Help & Support. Every new or edited review waits
// here; the sign-in panel shows the most recently approved one with words.
export function VaroomReviews({ reviews, setStatus }: {
  reviews: VaroomReviewRow[];
  setStatus: (id: string, status: VaroomReviewRow["status"]) => void;
}) {
  return (
    <div>
      <SectionHeader
        title="VaRoom reviews"
        description="Ratings of VaRoom from Help & Support. The sign-in page shows the most recently approved review that has words (updates within about 5 minutes)."
      />
      <Table
        columns={["Rating", "Review", "Author", "Status", "Updated", "Action"]}
        rows={reviews}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0 align-top">
            <td className="px-4 py-2 whitespace-nowrap text-[#B5482E]" aria-label={`${r.rating} of 5 stars`}>{stars(r.rating)}</td>
            <td className="px-4 py-2 max-w-md">{r.comment || <span className="text-[#8a857c]">No words, stars only</span>}</td>
            <td className="px-4 py-2 text-[#8a857c] whitespace-nowrap">{r.author_name} · {r.author_role === "host" ? "Host" : "Guest"}</td>
            <td className="px-4 py-2"><StatusPill status={r.status} /></td>
            <td className="px-4 py-2 text-xs text-[#8a857c]">{r.updated_at}</td>
            <td className="px-4 py-2">
              <div className="flex gap-2">
                {r.status !== "approved" && <button onClick={() => setStatus(r.id, "approved")} className="text-xs text-[#1F6F5C]">Approve</button>}
                {r.status !== "hidden" && <button onClick={() => setStatus(r.id, "hidden")} className="text-xs text-[#8a857c]">Hide</button>}
              </div>
            </td>
          </tr>
        )}
      />
    </div>
  );
}
