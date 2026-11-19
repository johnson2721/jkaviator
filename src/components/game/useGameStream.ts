"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { displayMultiplier, type Phase } from "@/lib/game/config";

export type StreamBet = {
  id: number;
  userId: number;
  currency: string;
  name: string;
  amount: number;
  autoCashoutAt: number | null;
  simulated: boolean;
  status: "pending" | "won" | "lost";
  cashoutAt: number | null;
  payout: number | null;
  placedAt: number;
};

export type Snapshot = {
  roundId: number;
  phase: Phase;
  multiplier: number;
  crashPoint: number | null;
  bettingEndsAt: number;
  flyingStartedAt: number;
  crashShownAt: number;
  serverNow: number;
  history: number[];
  bets: StreamBet[];
  online: number;
  totalStaked: number;
};

/** Mutable, high-frequency game clock — read inside requestAnimationFrame loops. */
export type GameRef = {
  phase: Phase;
  roundId: number;
  crashPoint: number | null;
  bettingEndsAt: number;
  flyingStartedAt: number;
  crashShownAt: number;
  offset: number; // serverNow - clientNow
  multiplier: number;
  connected: boolean;
};

const EMPTY: Snapshot = {
  roundId: 0,
  phase: "waiting",
  multiplier: 1,
  crashPoint: null,
  bettingEndsAt: Date.now() + 9000,
  flyingStartedAt: 0,
  crashShownAt: 0,
  serverNow: Date.now(),
  history: [],
  bets: [],
  online: 0,
  totalStaked: 0,
};

export function useGameStream() {
  const ref = useRef<GameRef>({
    phase: "waiting",
    roundId: 0,
    crashPoint: null,
    bettingEndsAt: Date.now() + 9000,
    flyingStartedAt: 0,
    crashShownAt: 0,
    offset: 0,
    multiplier: 1,
    connected: false,
  });
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const lastApply = useRef(0);
  const lastBetsKey = useRef("");
  const snapshotRefPhase = useRef<Phase>("waiting");

  const apply = useCallback((snap: Snapshot) => {
    const r = ref.current;
    r.phase = snap.phase;
    r.roundId = snap.roundId;
    r.crashPoint = snap.crashPoint ?? (snap.phase === "flying" ? r.crashPoint : null);
    r.bettingEndsAt = snap.bettingEndsAt;
    r.flyingStartedAt = snap.flyingStartedAt;
    r.crashShownAt = snap.crashShownAt;
    r.offset = snap.serverNow - Date.now();
    r.connected = true;
    r.multiplier = snap.multiplier;
    if (snap.phase === "flying") {
      r.crashPoint = snap.crashPoint; // null while flying; engine keeps the secret
    }

    const now = Date.now();
    const betsKey = snap.bets.map((b) => `${b.id}:${b.status}:${b.cashoutAt ?? ""}`).join("|");
    const betsChanged = betsKey !== lastBetsKey.current;
    lastBetsKey.current = betsKey;

    // Throttle React updates: immediately on phase/round/bet changes, else 5Hz.
    if (now - lastApply.current > 200 || betsChanged || snap.phase !== snapshotRefPhase.current) {
      lastApply.current = now;
      snapshotRefPhase.current = snap.phase;
      setSnapshot({ ...snap, multiplier: liveMultiplier(r) });
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let retry = 0;

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/game/stream");
      es.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as { snapshot?: Snapshot };
          if (parsed.snapshot) apply(parsed.snapshot);
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        ref.current.connected = false;
        es?.close();
        if (stopped) return;
        retry += 1;
        setTimeout(connect, Math.min(4000, 700 * retry));
      };
      es.onopen = () => {
        retry = 0;
        ref.current.connected = true;
      };
    };

    connect();
    // Safety net: keep the clock honest even if the stream stalls.
    const poll = setInterval(() => {
      if (ref.current.connected) return;
      fetch("/api/game/state")
        .then((r) => r.json())
        .then((d) => d?.snapshot && apply(d.snapshot as Snapshot))
        .catch(() => {});
    }, 4000);

    return () => {
      stopped = true;
      clearInterval(poll);
      es?.close();
    };
  }, [apply]);

  return { ref, snapshot };
}

/** Multiplier right now, interpolated client-side between server frames. */
export function liveMultiplier(r: GameRef): number {
  if (r.phase !== "flying") return r.multiplier || 1;
  const elapsed = Date.now() + r.offset - r.flyingStartedAt;
  return displayMultiplier(Math.max(0, elapsed));
}

export function secondsUntil(r: GameRef): number {
  return Math.max(0, (r.bettingEndsAt - (Date.now() + r.offset)) / 1000);
}
