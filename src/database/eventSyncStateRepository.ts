// src/database/eventSyncStateRepository.ts
import { pool } from "../config/database";

/**
 * Checkpoint persistence for chunked ledger event sync (#1857).
 *
 * Each event stream (e.g. escrow events, contract state archiver) keeps a
 * Horizon `paging_token` cursor here so that sync can resume exactly where it
 * left off — no reliance on long-lived SSE stream state.
 */

export const INITIAL_SYNC_CURSOR = "now";

export interface EventSyncStateRow {
  stream_key: string;
  cursor: string;
  updated_at: Date;
}

/** Returns the persisted cursor for a stream, or null when never synced. */
export async function getEventSyncCursor(
  streamKey: string,
): Promise<string | null> {
  const result = await pool.query<EventSyncStateRow>(
    `
      SELECT stream_key, cursor, updated_at
      FROM event_sync_state
      WHERE stream_key = $1;
    `,
    [streamKey],
  );

  const row = result.rows[0];
  return row ? row.cursor : null;
}

/** Upserts the cursor for a stream, bumping updated_at. */
export async function setEventSyncCursor(
  streamKey: string,
  cursor: string,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO event_sync_state (stream_key, cursor, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (stream_key)
      DO UPDATE SET
        cursor = EXCLUDED.cursor,
        updated_at = CURRENT_TIMESTAMP;
    `,
    [streamKey, cursor],
  );
}
