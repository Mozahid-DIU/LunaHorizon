/** A site's horizon, from its terrain file, its height tiles, or flat where neither exists. */
import type { SelectedSite } from "../sites";
import type { HeightAt } from "../terrain/customTerrain";
import type { DataLoader } from "./loader";

/** A flat horizon for custom sites, which have no terrain file. */
const NO_TERRAIN: readonly number[] = Array.from({ length: 360 }, () => 0);

export interface SiteTerrain {
  profile: readonly number[];
  hasTerrain: boolean;
  /** Heights from tiles, for a custom site; null for demo sites and flat horizons. */
  heightAt: HeightAt | null;
}

export async function loadTerrain(loader: DataLoader, site: SelectedSite): Promise<SiteTerrain> {
  if (site.id !== null) {
    const file = await loader.loadHorizon(site.id);
    return { profile: file.elevation_deg, hasTerrain: true, heightAt: null };
  }
  if (!site.has_terrain) return { profile: NO_TERRAIN, hasTerrain: false, heightAt: null };
  const { profile, heightAt } = await loader.loadCustomTerrain(site.lat, site.lon);
  return { profile, hasTerrain: true, heightAt };
}
