# Risk Engine

Risk is deterministic and runs after the structured analysis. It is not an AI confidence score.

| Level | Examples | Phase 1 action |
| --- | --- | --- |
| Low | Confirmed, general development update without consequential claims | May auto-publish only with tier 1-2 source, required fields, and confidence >= 0.75. |
| Medium | Market, planning, zoning, housing, or proposal update | Queue for review/stronger validation. |
| High | Land rates, tax, ownership, title, eviction, mortgage, lease, compulsory acquisition, or tier-4 claim | Human review required. |
| Critical | Unverified/rumoured or ownership-sensitive material with potential financial harm | Automatic publication blocked; review approval is rejected until risk is documented and lowered. |

The processor checks source URL, clean text, title, summary, and category before considering auto-publish. A valid low risk result is necessary but never sufficient on its own.
