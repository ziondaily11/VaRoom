# Testing

Run the isolated tests from `property-news/`:

```powershell
python -m unittest discover -s tests -v
```

The unit suite covers canonical URL/content hash duplicate protection, title similarity, property relevance, regulatory status distinction, deterministic risk levels, high/critical-risk publication controls, review audit behaviour, Elie retrieval filters, unauthorised admin denial, and static migration safety/relationships.

The suite uses the in-memory repository and never contacts an external source, AI provider, or Supabase project. Before release, add a non-production integration run against a disposable Supabase project that applies the migration and exercises RLS, constraints, full-text indexes, and the public projection.
