# Offline Sync Backend Contract

Endpoint: `POST /studio_api.php?lang=nihongo&action=sync_progress_batch`

## Security
- Requires `sync_token` in JSON body.
- Server token source:
  - `STUDIO_API_SYNC_TOKEN` env var, or
  - `$sync_token` in `studio_api_config.php`.
- Optional hardened write auth:
  - `STUDIO_API_WRITE_TOKEN` env var (or `$write_token`) for list mutations.
  - `STUDIO_API_ENFORCE_SCORE_AUTH=1` to require write auth for score/stat writes too.

## Request body
```json
{
  "device_id": "ios-...",
  "lang": "nihongo",
  "sync_token": "...",
  "events": [
    {
      "event_id": "evt_...",
      "event_ts": 1715299200000,
      "listName": "Transit Pack 1",
      "mode": "en-jp",
      "score": 84,
      "is_purification": false,
      "results": [
        { "jp": "駅", "correct": true },
        { "jp": "改札", "correct": false }
      ]
    }
  ]
}
```

## Response body
```json
{
  "status": "success",
  "applied_event_ids": ["evt_..."],
  "skipped_event_ids": ["evt_duplicate"],
  "remaining_queue_hint": 0
}
```

## Idempotency
- Processed ids are stored in `sync_processed_events.json`.
- Duplicate `event_id` values are skipped.
- Old processed ids are pruned automatically.
