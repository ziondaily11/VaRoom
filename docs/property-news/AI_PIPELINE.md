# AI Pipeline

The pipeline handles only a newly discovered, non-duplicate item:

1. Property relevance.
2. Topic/category.
3. Location, affected groups, key facts, and regulatory status.
4. Concise original summary and title.
5. Schema validation.
6. Deterministic risk policy.
7. Auto-publish only when every safety condition passes; otherwise queue review.

`NewsAnalysis` is a strict Pydantic model. An optional OpenAI-compatible provider is only used when its complete endpoint, key, and model configuration are present; its output must parse as the schema. Otherwise a conservative rules-based analyser is used for development and testability.

The source remains authoritative. The model/editor must use source-supported facts only, never supply legal/financial advice, and never change a `proposed`, `under_consideration`, or `public_participation` record into an effective rule. The database preserves `reported`, `proposed`, `under_consideration`, `public_participation`, `approved`, `enacted`, `effective`, `suspended`, `rejected`, `amended`, and `unknown` as distinct values.

The initial implementation intentionally omits semantic/vector duplicate search. URL, hash, and title similarity cover the reliable baseline; an embedding provider can later implement the same duplicate-check extension point after scale and quality justify it.
