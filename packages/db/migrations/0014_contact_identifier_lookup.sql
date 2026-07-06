set search_path = public, extensions;

-- Contact merging uses JSONB identifier maps for channel-specific identities.
-- Keep tenant filtering on the existing tenant indexes and make identifier
-- containment checks indexable instead of scanning recent contacts in memory.
create index if not exists contacts_identifiers_gin_idx
  on contacts
  using gin (identifiers jsonb_path_ops);
