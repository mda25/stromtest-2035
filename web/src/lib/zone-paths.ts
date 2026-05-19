import "server-only";
import { geoMercator, geoPath } from "d3-geo";
import zonesGeoJson from "@/data/zones.json";

/**
 * Server-side projection of the zones GeoJSON into SVG path strings.
 *
 * Returning paths instead of raw GeoJSON to the Client Component reduces
 * the bundle weight from ~246 KB to ~5 KB while keeping the geometry
 * correct. The Client Component just renders the <path d="..." /> with
 * dynamic fills.
 */

export interface ZonePathBundle {
  viewBoxWidth: number;
  viewBoxHeight: number;
  zones: ZonePath[];
}

export interface ZonePath {
  name: string;
  fullName: string;
  d: string;
  centroidX: number;
  centroidY: number;
}

const VIEWBOX_W = 360;
const VIEWBOX_H = 460;

export function buildZonePaths(): ZonePathBundle {
  const projection = geoMercator().fitSize(
    [VIEWBOX_W, VIEWBOX_H],
    zonesGeoJson as GeoJSON.FeatureCollection,
  );
  const path = geoPath(projection);

  const features = (
    zonesGeoJson as GeoJSON.FeatureCollection<
      GeoJSON.Geometry,
      { name: string; full_name: string }
    >
  ).features;

  const zones: ZonePath[] = features.map((feature) => {
    const d = path(feature as unknown as GeoJSON.Feature) ?? "";
    const [cx, cy] = path.centroid(feature as unknown as GeoJSON.Feature);
    return {
      name: feature.properties.name,
      fullName: feature.properties.full_name,
      d,
      centroidX: cx,
      centroidY: cy,
    };
  });

  return {
    viewBoxWidth: VIEWBOX_W,
    viewBoxHeight: VIEWBOX_H,
    zones,
  };
}
