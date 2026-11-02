"use client";

import { dataLoader } from "./loader";
import { useDataFile, type DataFile } from "./useDataFile";
import type { MapGrid } from "./validate";

/** Loads the Golden Window Map grid. */
export const useMapGrid = (): DataFile<MapGrid> => useDataFile(dataLoader.loadMapGrid);
