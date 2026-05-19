"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type DispatchBundle,
  colorFor,
  formatMWh,
} from "@/lib/dispatch-utils";
import type { ZonePathBundle } from "@/lib/zone-paths";

interface Props {
  bundle: DispatchBundle;
  paths: ZonePathBundle;
}

const ZONE_LABEL: Record<string, string> = {
  "50hertz": "50Hertz",
  tennet: "TenneT",
  amprion: "Amprion",
  transnetbw: "TransnetBW",
};

const STEPS_PER_HOUR = 4; // 15-minute slider resolution

/**
 * Interactive scrubber over the hourly dispatch.
 *
 * The PyPSA-Eur model solves at 1-hour resolution (ERA5 weather is
 * hourly), but the slider exposes 15-minute steps so motion feels
 * smooth. Each 15-min slider position snaps to the underlying hourly
 * bucket — the value display reflects the hour, the timestamp display
 * reflects the slider position to the nearest 15 minutes.
 *
 * Keyboard: ← / → step 15 min, Shift+arrow steps an hour, Home / End
 * jump to the run start / end. Space toggles play.
 */
export function TimeMachine({ bundle, paths }: Props) {
  const { hourlySnapshots, hourlyByZone, hourlyByCarrier, totalLoadByHour } =
    usePrepared(bundle);

  const totalSteps = hourlySnapshots.length * STEPS_PER_HOUR;
  // Default to mid-afternoon of day 2 — usually a high-solar moment that
  // sells the visual story before the user has to touch anything.
  const initialStep = useMemo(() => {
    const targetHourIdx = Math.min(
      hourlySnapshots.length - 1,
      24 + 13, // day 2, 13:00
    );
    return Math.max(0, targetHourIdx * STEPS_PER_HOUR);
  }, [hourlySnapshots.length]);

  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);
  const hourIdx = Math.floor(step / STEPS_PER_HOUR);
  const minuteOffset = (step % STEPS_PER_HOUR) * 15;
  const snapshot = hourlySnapshots[hourIdx] ?? "";

  // Play/pause loop. Advances 4 steps (1 hour) per ~400 ms so the
  // visualization moves at a watchable rate (~1.5 simulated days/sec).
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((s) => {
        const next = s + 4;
        if (next >= totalSteps) {
          setPlaying(false);
          return totalSteps - 1;
        }
        return next;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [playing, totalSteps]);

  // Keyboard nudges.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target &&
        (e.target as HTMLElement).tagName === "INPUT" &&
        (e.target as HTMLInputElement).type !== "range"
      ) {
        return;
      }
      let delta = 0;
      if (e.key === "ArrowLeft") delta = e.shiftKey ? -STEPS_PER_HOUR : -1;
      else if (e.key === "ArrowRight") delta = e.shiftKey ? STEPS_PER_HOUR : 1;
      else if (e.key === "Home") {
        setStep(0);
        e.preventDefault();
        return;
      } else if (e.key === "End") {
        setStep(totalSteps - 1);
        e.preventDefault();
        return;
      } else if (e.key === " ") {
        setPlaying((p) => !p);
        e.preventDefault();
        return;
      }
      if (delta !== 0) {
        setStep((s) => Math.max(0, Math.min(totalSteps - 1, s + delta)));
        e.preventDefault();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [totalSteps]);

  // Snapshot data for the current hour.
  const zoneSnapshot = hourlyByZone[hourIdx] ?? {};
  const carrierSnapshot = hourlyByCarrier[hourIdx] ?? [];
  const totalLoadNow = totalLoadByHour[hourIdx] ?? 0;
  const totalGenNow = carrierSnapshot.reduce((acc, c) => acc + c.value, 0);

  // Build a smoothed max for the map color scale across the whole horizon
  // so colors don't whip from saturated to washed-out hour-to-hour.
  const globalMaxNet = useMemo(() => {
    let max = 0;
    for (const byZone of hourlyByZone) {
      for (const m of Object.values(byZone)) {
        const net = Math.abs(m.gen - m.load);
        if (net > max) max = net;
      }
    }
    return max || 1;
  }, [hourlyByZone]);

  const displayTime = formatTimestamp(snapshot, minuteOffset);

  return (
    <div
      ref={ref}
      tabIndex={0}
      className="space-y-6 outline-hidden"
      aria-label="Interactive dispatch time machine"
    >
      <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Time · 15-minute steps · 1-hour underlying model
            </p>
            <p className="font-mono text-3xl tabular-nums tracking-tight md:text-4xl">
              {displayTime}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? "Pause" : "Play"}
            </button>
            <StepButton onClick={() => setStep((s) => Math.max(0, s - 1))}>
              ← 15m
            </StepButton>
            <StepButton
              onClick={() =>
                setStep((s) => Math.min(totalSteps - 1, s + 1))
              }
            >
              15m →
            </StepButton>
            <StepButton
              onClick={() =>
                setStep((s) => Math.max(0, s - STEPS_PER_HOUR))
              }
            >
              ← 1h
            </StepButton>
            <StepButton
              onClick={() =>
                setStep((s) =>
                  Math.min(totalSteps - 1, s + STEPS_PER_HOUR),
                )
              }
            >
              1h →
            </StepButton>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={step}
          step={1}
          onChange={(e) => setStep(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          aria-label="Dispatch time slider"
        />

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTimestamp(hourlySnapshots[0] ?? "", 0)}</span>
          <span>
            Hour {hourIdx + 1} / {hourlySnapshots.length}
          </span>
          <span>
            {formatTimestamp(
              hourlySnapshots[hourlySnapshots.length - 1] ?? "",
              45,
            )}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Keyboard: ←/→ step 15 min · ⇧←/⇧→ step 1 hour · Space play/pause
          · Home / End jump
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <SnapshotMap
          paths={paths}
          zoneSnapshot={zoneSnapshot}
          globalMaxNet={globalMaxNet}
        />
        <SnapshotMix
          carrierSnapshot={carrierSnapshot}
          totalGen={totalGenNow}
          totalLoad={totalLoadNow}
        />
      </div>
    </div>
  );
}

function StepButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-full border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 1.5v9l8-4.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.5" y="1.5" width="2.5" height="9" />
      <rect x="7" y="1.5" width="2.5" height="9" />
    </svg>
  );
}

interface ZoneMomentMetrics {
  gen: number;
  load: number;
}

function SnapshotMap({
  paths,
  zoneSnapshot,
  globalMaxNet,
}: {
  paths: ZonePathBundle;
  zoneSnapshot: Record<string, ZoneMomentMetrics>;
  globalMaxNet: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Net balance · this moment
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          ← import &nbsp;|&nbsp; export →
        </p>
      </div>
      <svg
        viewBox={`0 0 ${paths.viewBoxWidth} ${paths.viewBoxHeight}`}
        className="h-auto w-full"
        aria-label="Germany map with the four ÜNB Regelzonen colored by current-hour net balance"
      >
        {paths.zones.map((zone) => {
          const m = zoneSnapshot[zone.name] ?? { gen: 0, load: 0 };
          const net = m.gen - m.load;
          const fill = netColor(net, globalMaxNet);
          return (
            <g key={zone.name}>
              <path
                d={zone.d}
                fill={fill}
                stroke="#1f2937"
                strokeWidth={0.8}
                strokeLinejoin="round"
                style={{ transition: "fill 200ms ease-out" }}
              >
                <title>
                  {zone.fullName}
                  {`\nGen: ${formatMWh(m.gen)}\nLoad: ${formatMWh(m.load)}\nNet: ${net >= 0 ? "+" : ""}${formatMWh(net)}`}
                </title>
              </path>
              <text
                x={zone.centroidX}
                y={zone.centroidY - 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="#111827"
                pointerEvents="none"
              >
                {ZONE_LABEL[zone.name] ?? zone.name}
              </text>
              <text
                x={zone.centroidX}
                y={zone.centroidY + 10}
                textAnchor="middle"
                fontSize="10"
                fill="#111827"
                pointerEvents="none"
              >
                {net >= 0 ? "+" : ""}
                {Math.round(net).toLocaleString()} MW
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SnapshotMix({
  carrierSnapshot,
  totalGen,
  totalLoad,
}: {
  carrierSnapshot: { technology: string; value: number }[];
  totalGen: number;
  totalLoad: number;
}) {
  const visible = carrierSnapshot.filter((c) => Math.abs(c.value) > 0.5);
  const maxValue = Math.max(...visible.map((c) => c.value), 1);
  const net = totalGen - totalLoad;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Generation mix · this moment
          </p>
          <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
            {Math.round(totalGen).toLocaleString()} MW
          </p>
          <p className="text-xs text-muted-foreground">
            Load: {Math.round(totalLoad).toLocaleString()} MW · Net:{" "}
            <span
              className={
                net >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
              }
            >
              {net >= 0 ? "+" : ""}
              {Math.round(net).toLocaleString()} MW
            </span>
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {visible.length === 0 ? (
          <li className="text-xs text-muted-foreground">
            No carrier dispatch &gt; 0.5 MW at this moment.
          </li>
        ) : (
          visible.map((c) => {
            const widthPct = (c.value / maxValue) * 100;
            const share = totalGen > 0 ? (c.value / totalGen) * 100 : 0;
            return (
              <li
                key={c.technology}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  {c.technology}
                </span>
                <span className="relative block h-3 rounded-sm bg-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${widthPct}%`,
                      background: colorFor(c.technology),
                      transition: "width 200ms ease-out",
                    }}
                  />
                </span>
                <span className="font-mono tabular-nums">
                  {Math.round(c.value).toLocaleString()} MW
                  <span className="ml-2 text-muted-foreground">
                    {share.toFixed(0)}%
                  </span>
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

// --- Preparation helpers --------------------------------------------------

function usePrepared(bundle: DispatchBundle) {
  return useMemo(() => {
    const hourlySnapshots = bundle.hourly_snapshots ?? [];
    const snapshotIndex = new Map<string, number>();
    hourlySnapshots.forEach((s, i) => snapshotIndex.set(s, i));

    // Per-hour, per-zone gen/load.
    const hourlyByZone: Record<string, ZoneMomentMetrics>[] = hourlySnapshots.map(
      () => ({}),
    );
    for (const r of bundle.per_zone_hourly ?? []) {
      const idx = snapshotIndex.get(r.snapshot);
      if (idx === undefined) continue;
      const slot = hourlyByZone[idx];
      const existing = slot[r.zone] ?? { gen: 0, load: 0 };
      if (r.metric === "generation_mwh") existing.gen = r.value;
      else if (r.metric === "load_mwh") existing.load = r.value;
      slot[r.zone] = existing;
    }

    // Per-hour, per-carrier (sorted desc within each hour).
    const hourlyByCarrier: { technology: string; value: number }[][] =
      hourlySnapshots.map(() => []);
    for (const r of bundle.stacked_generation_hourly ?? []) {
      const idx = snapshotIndex.get(r.snapshot);
      if (idx === undefined) continue;
      hourlyByCarrier[idx].push({
        technology: r.technology,
        value: r.value,
      });
    }
    for (const list of hourlyByCarrier) {
      list.sort((a, b) => b.value - a.value);
    }

    // Per-hour total load.
    const totalLoadByHour = hourlyByZone.map((byZone) => {
      let total = 0;
      for (const m of Object.values(byZone)) total += m.load;
      return total;
    });

    return {
      hourlySnapshots,
      hourlyByZone,
      hourlyByCarrier,
      totalLoadByHour,
    };
  }, [bundle]);
}

function netColor(net: number, maxAbs: number): string {
  if (maxAbs === 0) return "#e5e7eb";
  const ratio = Math.max(-1, Math.min(1, net / maxAbs));
  if (ratio >= 0) return interpolate("#e5e7eb", "#059669", ratio);
  return interpolate("#e5e7eb", "#e11d48", -ratio);
}

function interpolate(a: string, b: string, t: number): string {
  const ah = parseHex(a);
  const bh = parseHex(b);
  return `rgb(${Math.round(ah[0] + (bh[0] - ah[0]) * t)}, ${Math.round(ah[1] + (bh[1] - ah[1]) * t)}, ${Math.round(ah[2] + (bh[2] - ah[2]) * t)})`;
}

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatTimestamp(isoHour: string, minuteOffset: number): string {
  // ISO is "YYYY-MM-DDTHH:MM"; bump minutes by offset (0/15/30/45).
  // Year is intentionally dropped — the panel header already pins the
  // weather year; surfacing it inside every slider stamp confuses
  // readers into thinking the simulation year is historical.
  if (!isoHour) return "";
  const [date, hm] = isoHour.split("T");
  const [, monthStr, dayStr] = date.split("-");
  const monthIdx = Math.max(0, Math.min(11, parseInt(monthStr, 10) - 1));
  const day = parseInt(dayStr, 10);
  const [hour] = (hm ?? "00:00").split(":");
  const minutes = minuteOffset.toString().padStart(2, "0");
  return `${MONTH_ABBR[monthIdx]} ${day} · ${hour}:${minutes}`;
}
