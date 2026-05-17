import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ScenarioFile,
  formatGW,
  formatPercent,
  formatTWh,
  zoneSum,
} from "@/lib/scenarios";

interface Props {
  file: ScenarioFile;
  highlight?: boolean;
}

export function ScenarioCard({ file, highlight }: Props) {
  const s = file.scenario;
  const caps = s.capacities_2035_gw;
  return (
    <Card className={highlight ? "border-foreground" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl">{s.display_name}</CardTitle>
          <Badge variant="outline">{file.version}</Badge>
        </div>
        <CardDescription className="text-pretty">{s.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Wind onshore" value={formatGW(zoneSum(caps.wind_onshore))} />
          <Stat label="Wind offshore" value={formatGW(zoneSum(caps.wind_offshore))} />
          <Stat label="Solar PV" value={formatGW(zoneSum(caps.solar_pv))} />
          <Stat label="Gas backup" value={formatGW(zoneSum(caps.gas_backup))} />
          <Stat
            label="H₂ electrolyzer"
            value={formatGW(zoneSum(caps.hydrogen_electrolyzer))}
          />
          <Stat
            label="Battery storage"
            value={`${caps.battery_storage_gwh.value.toFixed(0)} GWh`}
          />
          <Stat label="Demand" value={formatTWh(s.demand_2035.baseline_twh)} />
          <Stat label="HP share" value={formatPercent(s.demand_2035.heat_pump_share)} />
        </dl>
        <div className="text-xs text-muted-foreground">
          {s.sources.length} cited sources ·{" "}
          <Link
            href={`/scenarios/${file.family}`}
            className="underline-offset-4 hover:underline"
          >
            view details
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
