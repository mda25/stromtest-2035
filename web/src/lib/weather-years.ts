/**
 * Catalog of weather years we plan to run against each scenario.
 *
 * Used by the dispatch panel's weather-year selector — committed years
 * show as active chips, the rest as "pending" chips so the user can see
 * the roadmap. When a year gets a committed dispatch JSON, the selector
 * automatically switches it from "pending" to "active".
 *
 * Client-safe — no fs, no server-only imports.
 */

export interface WeatherYearMeta {
  year: number;
  label: string;
  /** One-line characterization for the chip tooltip + selector description. */
  description: string;
}

export const WEATHER_YEAR_CATALOG: WeatherYearMeta[] = [
  {
    year: 2010,
    label: "Dunkelflaute",
    description:
      "Notorious cold + low-wind period in late January / early February 2010. The canonical stress test for renewable-dominant power systems in Central Europe.",
  },
  {
    year: 2013,
    label: "Reference",
    description:
      "Median weather year used by PyPSA-Eur's tutorial. Bundled cutout on data.pypsa.org, no CDS download needed.",
  },
  {
    year: 2018,
    label: "Heatwave + drought",
    description:
      "European summer heatwave with extended drought. Stresses thermal cooling, hydropower, and PV efficiency simultaneously.",
  },
  {
    year: 2020,
    label: "Median",
    description:
      "Recent representative year. Used as a stable baseline to compare against the stress years.",
  },
];

export function findYearMeta(year: number): WeatherYearMeta | undefined {
  return WEATHER_YEAR_CATALOG.find((y) => y.year === year);
}
