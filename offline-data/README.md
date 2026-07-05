# Offline course catalog for Leaderboard Pro

Copy the JSON exported from TourSystem36 Pro Admin into this folder and name it:

```text
master-courses.json
```

Leaderboard Pro loads this file from `offline-data/master-courses.json` on localhost and uses it to fill the course list plus Par/SI grid without querying Supabase.

If you keep the downloaded TS36 filename, `offline-data/ts36-master-courses-offline.json` is also supported as a fallback.
