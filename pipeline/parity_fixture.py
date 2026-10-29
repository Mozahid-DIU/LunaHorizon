"""Write reference az/el from the full SPICE engine so the browser engine can be tested against it.

Output: web/src/lib/__fixtures__/parity.json  (5 sites x 20 times, Sun and Earth)
Usage: python parity_fixture.py
"""
import json
from pathlib import Path

import numpy as np

from ephemeris import sun_earth_altaz
from sites import load_sites

OUT = Path(__file__).parent.parent / "web" / "src" / "lib" / "__fixtures__" / "parity.json"
RNG = np.random.default_rng(7)
TIMES = sorted(
    f"{y}-{m:02d}-{d:02d} {h:02d}:00"
    for y, m, d, h in zip(
        RNG.integers(2026, 2031, 20), RNG.integers(1, 13, 20), RNG.integers(1, 29, 20), RNG.integers(0, 24, 20)
    )
)


def main() -> None:
    cases = []
    for site in load_sites():
        ref = sun_earth_altaz(site["lat"], site["lon"], TIMES)
        for i, utc in enumerate(TIMES):
            cases.append({
                "site": site["id"], "lat": site["lat"], "lon": site["lon"], "utc": utc.replace(" ", "T") + "Z",
                **{f"{b}_{k}": round(float(ref[b][k][i]), 6) for b in ("sun", "earth") for k in ("az", "el")},
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"source": "Skyfield + NASA SPICE (pipeline/ephemeris.py)", "cases": cases}, indent=1))
    print(f"{OUT.name}: {len(cases)} cases")


if __name__ == "__main__":
    main()
