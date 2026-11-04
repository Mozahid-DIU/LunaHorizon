/** Curated landing sites, generated from nasa-data/sites.json by pipeline/export_sites.py. */
import siteList from "@/data/sites.json";

export interface CuratedSite {
  id: string;
  name: string;
  agency: string;
  mission: string;
  category: string;
  lat: number;
  lon: number;
  landed: string | null;
  source: string;
  has_terrain: boolean;
  /** Part of the horizon comes from LOLA's 237 m global map, which smooths close ground. */
  is_coarse_terrain: boolean;
}

export interface CustomSite {
  id: null;
  name: string;
  lat: number;
  lon: number;
  has_terrain: boolean;
}

/** Height tiles reach 60 S; rays run 5 degrees, so a whole horizon needs a site south of this. */
export const TERRAIN_COVERAGE_LAT = -65;

export type SelectedSite = CuratedSite | CustomSite;

export const SITES: readonly CuratedSite[] = siteList;

export function hasHeightTiles(lat: number): boolean {
  return lat <= TERRAIN_COVERAGE_LAT;
}

export function findSite(id: string): CuratedSite | undefined {
  return SITES.find((site) => site.id === id);
}

/** The name without its bracketed detail, for labels. */
export function shortName(site: SelectedSite): string {
  return site.name.split(" (")[0];
}
