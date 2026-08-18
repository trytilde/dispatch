"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * LOADER GRID
 * Fork of the Beautiful UI "Loading State" pixel grid
 * (beautifului.dev, MIT). Drive: square cells, a chevron
 * wavefront driving right on a 650ms cycle. Reduced motion
 * freezes the grid to its dim state.
 * ───────────────────────────────────────────────────────── */

const chevron = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, index) => {
  const at = ORBIT_ORDER.indexOf(index);
  return at === -1 ? null : at * 110;
});

const PATTERNS = {
  drive: { delays: chevron as (number | null)[], dur: 650, round: false },
  dots: { delays: chevron as (number | null)[], dur: 650, round: true },
  orbit: { delays: orbit, dur: 950, round: false },
} as const;

export type LoaderGridVariant = keyof typeof PATTERNS;

export function LoaderGrid({ variant = "drive" }: { variant?: LoaderGridVariant }) {
  const { delays, dur, round } = PATTERNS[variant];
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {delays.map((delay, index) => (
        <span
          key={index}
          className={`size-[4px] bg-ink motion-reduce:animate-none ${round ? "rounded-full" : "rounded-[1px]"}`}
          style={{
            opacity: delay === null ? 0.07 : 0.15,
            animation:
              delay === null ? "none" : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/** Elapsed run time in mono tabular figures, ticking at 100ms. */
export function useElapsed(): string {
  const [deciseconds, setDeciseconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDeciseconds((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  const total = deciseconds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}
