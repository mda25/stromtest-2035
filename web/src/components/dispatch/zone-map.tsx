import { geoMercator, geoPath } from "d3-geo";
import zonesGeoJson from "@/data/zones.json";
import { type DispatchBundle, formatMWh } from "@/lib/dispatch-utils";

const ZONE_NAMES = ["50hertz", "tennet", "amprion", "transnetbw"] as const;
type ZoneName = (typeof ZONE_NAMES)[number];

interface Props {
  bundle: DispatchBundle;
}

interface ZoneMetrics {
  gen: number;
  load: number;
  topCarrier: string | null;
}

const VIEWBOX_W = 360;
const VIEWBOX_H = 460;

/**
 * Stylized SVG map of Germany with the four ÜNB Regelzonen.
 *
 * Server-rendered — d3-geo runs at build time, only the resulting SVG
 * ships to the client. Each zone is colored by its net balance
 * (generation − load): green = exporter, red = importer, intensity
 * proportional to |net|/|max|.
 *
 * Native ``<title>`` tooltips give zone numbers on hover; CSS handles
 * the cursor + outline. No JavaScript state, no client bundle cost.
 */
export function ZoneMap({ bundle }: Props) {
  const metrics = computeZoneMetrics(bundle);
  const maxAbs = Math.max(
    ...Object.values(metrics).map((m) => Math.abs(m.gen - m.load)),
    1,
  );

  const projection = geoMercator().fitSize(
    [VIEWBOX_W, VIEWBOX_H],
    zonesGeoJson as GeoJSON.FeatureCollection,
  );
  const path = geoPath(projection);

  type Feature = GeoJSON.Feature<GeoJSON.Geometry, { name: string; full_name: string }>;
  const features = (zonesGeoJson as GeoJSON.FeatureCollection<
    GeoJSON.Geometry,
    { name: string; full_name: string }
  >).features as Feature[];

  return (
    <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
      <div className="rounded-lg border bg-card">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="h-auto w-full"
          aria-label="Map of Germany showing the four ÜNB Regelzonen colored by net balance"
        >
          {features.map((f) => {
            const zone = f.properties.name as ZoneName;
            const m = metrics[zone];
            const net = m ? m.gen - m.load : 0;
            const fill = netBalanceColor(net, maxAbs);
            const d = path(f as unknown as GeoJSON.Feature) ?? "";
            const centroid = path.centroid(f as unknown as GeoJSON.Feature);
            return (
              <g key={zone} className="zone-group">
                <path
                  d={d}
                  fill={fill}
                  stroke="#1f2937"
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                  className="transition-opacity hover:opacity-80"
                >
                  <title>
                    {f.properties.full_name}
                    {m && `\nGen: ${formatMWh(m.gen)}\nLoad: ${formatMWh(m.load)}\nNet: ${net >= 0 ? "+" : ""}${formatMWh(net)}`}
                  </title>
                </path>
                <text
                  x={centroid[0]}
                  y={centroid[1] - 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#111827"
                  pointerEvents="none"
                >
                  {labelFor(zone)}
                </text>
                {m && (
                  <text
                    x={centroid[0]}
                    y={centroid[1] + 10}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#111827"
                    pointerEvents="none"
                  >
                    {net >= 0 ? "+" : ""}
                    {(net / 1000).toFixed(0)} GWh
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ZoneLegend metrics={metrics} maxAbs={maxAbs} />
    </div>
  );
}

function ZoneLegend({
  metrics,
  maxAbs,
}: {
  metrics: Record<ZoneName, ZoneMetrics>;
  maxAbs: number;
}) {
  const rows: { zone: ZoneName; gen: number; load: number }[] = ZONE_NAMES.map(
    (z) => ({ zone: z, gen: metrics[z]?.gen ?? 0, load: metrics[z]?.load ?? 0 }),
  );
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground text-xs">
        Net balance per zone (generation − load). Green tones export, red
        tones import. Intensity scales with magnitude.
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-md">
        <div
          className="h-full flex-1"
          style={{ background: `linear-gradient(to right, ${netBalanceColor(-maxAbs, maxAbs)}, ${netBalanceColor(0, maxAbs)})` }}
        />
        <div
          className="h-full flex-1"
          style={{ background: `linear-gradient(to right, ${netBalanceColor(0, maxAbs)}, ${netBalanceColor(maxAbs, maxAbs)})` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>−{(maxAbs / 1000).toFixed(0)} GWh</span>
        <span>0</span>
        <span>+{(maxAbs / 1000).toFixed(0)} GWh</span>
      </div>

      <div className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const net = r.gen - r.load;
          return (
            <div
              key={r.zone}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b py-1 text-xs last:border-0"
            >
              <span
                className="inline-block size-3 rounded"
                style={{ background: netBalanceColor(net, maxAbs) }}
              />
              <span>{r.zone}</span>
              <span
                className={`font-mono tabular-nums ${
                  net >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {net >= 0 ? "+" : ""}
                {formatMWh(net)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeZoneMetrics(bundle: DispatchBundle): Record<ZoneName, ZoneMetrics> {
  const out: Record<string, ZoneMetrics> = {};
  for (const zone of ZONE_NAMES) {
    out[zone] = { gen: 0, load: 0, topCarrier: null };
  }
  for (const r of bundle.per_zone_totals) {
    if (!ZONE_NAMES.includes(r.zone as ZoneName)) continue;
    if (r.metric === "generation_mwh") out[r.zone].gen += r.value;
    if (r.metric === "load_mwh") out[r.zone].load += r.value;
  }
  // Top carrier per zone from the daily long table.
  const perZoneByCarrier = new Map<string, Map<string, number>>();
  for (const r of bundle.daily) {
    if (r.metric !== "generation_mwh") continue;
    if (!ZONE_NAMES.includes(r.zone as ZoneName)) continue;
    const sub = perZoneByCarrier.get(r.zone) ?? new Map<string, number>();
    sub.set(r.technology, (sub.get(r.technology) ?? 0) + r.value);
    perZoneByCarrier.set(r.zone, sub);
  }
  for (const zone of ZONE_NAMES) {
    const sub = perZoneByCarrier.get(zone);
    if (!sub) continue;
    let topName: string | null = null;
    let topValue = -Infinity;
    for (const [name, value] of sub.entries()) {
      if (value > topValue) {
        topValue = value;
        topName = name;
      }
    }
    out[zone].topCarrier = topName;
  }
  return out as Record<ZoneName, ZoneMetrics>;
}

/**
 * Maps a net balance value to a fill color.
 * Negative (importer) -> red shades; positive (exporter) -> green shades.
 * Neutral mid-tone for ~zero.
 */
function netBalanceColor(net: number, maxAbs: number): string {
  if (maxAbs === 0) return "#e5e7eb"; // gray-200
  const ratio = Math.max(-1, Math.min(1, net / maxAbs));
  if (ratio >= 0) {
    // 0 -> light gray, +1 -> emerald-600
    const t = ratio;
    return interpolate("#e5e7eb", "#059669", t);
  }
  // 0 -> light gray, -1 -> rose-600
  return interpolate("#e5e7eb", "#e11d48", -ratio);
}

function interpolate(a: string, b: string, t: number): string {
  const ah = parseHex(a);
  const bh = parseHex(b);
  const r = Math.round(ah[0] + (bh[0] - ah[0]) * t);
  const g = Math.round(ah[1] + (bh[1] - ah[1]) * t);
  const bl = Math.round(ah[2] + (bh[2] - ah[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function labelFor(zone: ZoneName): string {
  switch (zone) {
    case "50hertz":
      return "50Hertz";
    case "tennet":
      return "TenneT";
    case "amprion":
      return "Amprion";
    case "transnetbw":
      return "TransnetBW";
  }
}
