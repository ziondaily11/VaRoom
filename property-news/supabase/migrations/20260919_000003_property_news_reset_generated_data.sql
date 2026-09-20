-- VaRoom Property News: preserve source registry while resetting generated data
-- This is intentionally destructive and should be used only in a controlled reset.
-- The source registry (`news_sources`) is intentionally left intact; every other
-- generated property-news table is reset to keep the pipeline clean.

truncate table public.news_timeline_entries,
               public.news_reviews,
               public.news_events,
               public.news_tags,
               public.news_locations,
               public.news_analysis,
               public.news_items,
               public.news_story_timelines,
               public.source_fetch_runs
restart identity cascade;

-- `public.news_sources` is intentionally omitted so the configured feed registry
-- remains in place while the generated evidence, review, and telemetry tables are
-- reset to a clean state.
