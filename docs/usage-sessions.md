# Usage sessions

`watch_sessions` groups playback; `video_views` stores one row per playback,
including repeats of the same media. The player retains a session ID across
navigation and reloads. Thirty minutes without activity starts another session.
Pause/resume retains the view ID; replay creates another view ID.

New telemetry includes session/view UUIDs and cumulative watched seconds.
Retries and reordered packets cannot increment a view twice or reduce watched
time. Existing daily/video counters remain transactional caches for existing
reports and library screens. Legacy requests remain supported.

## Reconstruct retained history

Journal request timestamps identify video order, but do not include telemetry
payloads. The reconstruction script estimates per-video time from observed spans
and allocates each retained daily total exactly. Unknown completion remains
false. No extra origin/estimate metadata is stored.

After applying `apps/api/migrations/0006_watch_telemetry.sql`, preview:

```sh
node --env-file=.env scripts/reconstruct-usage.mjs --since ISO_TIMESTAMP
```

Use the start of the first retained session, including its timezone. Add
`--write` to save. The script checks daily and per-video view counts, refuses
mixed recorded sessions, and leaves existing aggregate totals unchanged.
Rerunning before activating new recording refreshes the same deterministic rows.

## Active playback deployment

Source edits and the additive migration do not restart systemd. Avoid rebuilding
`apps/web/dist` while playback is active: the server serves those files directly.
After playback ends, refresh reconstruction to include the latest legacy packets,
then build and restart deliberately. Reload existing player tabs for identified
view recording; older tabs continue sending the legacy aggregate protocol.
