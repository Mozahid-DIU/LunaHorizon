"""Sub-points and DSN masks for the years of the real landings that Mission Replay plays back.

The app's own data covers 2026-2030. Mission Replay needs the years the missions flew, so this
writes the same two hourly files, made by the same code, into web/public/data/replay/:
1969 (Apollo 11), 2023 (Chandrayaan-3), 2024 (IM-1) and 2025 (IM-2, Blue Ghost Mission 1).
The kernels cover these years: DE440s from 1849 to 2150, the Moon's orientation from 1900 to 2050.

The DSN masks use today's three 70 m antennas. They are written for every year so the files
line up, but the app does not show DSN or Golden hours for 1969, when those stations did not all
exist and Apollo used another network.

Usage: python replay_data.py
"""
import json

import dsn
import subpoints

REPLAY_YEARS = (1969, 2023, 2024, 2025)
OUT_DIR = subpoints.OUT_DIR / "replay"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for year in REPLAY_YEARS:
        for name, build in (("subpoints", subpoints.build_year), ("dsn", dsn.build_year)):
            path = OUT_DIR / f"{name}-{year}.json"
            path.write_text(json.dumps(build(year), separators=(",", ":")))
            print(f"{path.name}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
