'use client';

import { useEffect, useState } from 'react';
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';

type Row = { id: string };

/**
 * Subscribes to Postgres Changes (INSERT/UPDATE/DELETE) on a public table and
 * keeps a list of rows in sync with the database. Seeded from `initialRows`
 * (which the server component already fetched) so the table renders instantly
 * and then patches itself as events arrive.
 *
 * Notes:
 *  - Cleans up the channel on unmount.
 *  - `isLive` is true once the channel is SUBSCRIBED, and flips back to false
 *    on CHANNEL_ERROR / CLOSED / TIMED_OUT.
 *  - On INSERT we de-dupe by id (the initial fetch may overlap with the first
 *    realtime event).
 */
export function useRealtimeTable<T extends Row>(
  table: string,
  initialRows: T[],
): { rows: T[]; isLive: boolean } {
  // React 19 pattern for "reset state when a prop changes": store the prop
  // alongside the derived state and update both during render when the prop
  // identity changes. This avoids both the useEffect+setState anti-pattern
  // and ref-during-render lint warnings.
  const [seeded, setSeeded] = useState<{ source: T[]; rows: T[] }>({
    source: initialRows,
    rows: initialRows,
  });
  if (seeded.source !== initialRows) {
    setSeeded({ source: initialRows, rows: initialRows });
  }
  const rows = seeded.rows;

  const [isLive, setIsLive] = useState<boolean>(false);

  useEffect(() => {
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel(`realtime:public:${table}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL,
          schema: 'public',
          table,
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          setSeeded((prevSeeded) => {
            const prev = prevSeeded.rows;
            let nextRows: T[] = prev;

            switch (payload.eventType) {
              case REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT: {
                const next = payload.new as T;
                if (!prev.some((row) => row.id === next.id)) {
                  nextRows = [next, ...prev];
                }
                break;
              }
              case REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE: {
                const next = payload.new as T;
                let found = false;
                const merged = prev.map((row) => {
                  if (row.id === next.id) {
                    found = true;
                    // Preserve any joined / derived fields the server attached
                    // (e.g. customerName, trainerName) by spreading prev row first.
                    return { ...row, ...next };
                  }
                  return row;
                });
                nextRows = found ? merged : [next, ...prev];
                break;
              }
              case REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.DELETE: {
                const oldRow = payload.old as Partial<T>;
                if (oldRow.id) {
                  nextRows = prev.filter((row) => row.id !== oldRow.id);
                }
                break;
              }
            }

            if (nextRows === prev) {
              return prevSeeded;
            }
            return { source: prevSeeded.source, rows: nextRows };
          });
        },
      )
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setIsLive(true);
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
          setIsLive(false);
        }
      });

    return () => {
      setIsLive(false);
      void supabase.removeChannel(channel);
    };
  }, [table]);

  return { rows, isLive };
}
