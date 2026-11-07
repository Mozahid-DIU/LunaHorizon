# Data and method

Where every number in LunaHorizon comes from, how it is worked out, how well it matches independent references, and what it leaves out.

## 1. How the work is split

```
Python pipeline (run once, on a laptop)            Browser (the website)
  NASA SPICE kernels  ─▶ hourly Sun/Earth sub-points ─▶ Sun and Earth az/el for any site and minute
  JPL Horizons API    ─▶ checks only                    windows, countdowns, best dates, power, ellipse
  LRO LOLA, SLDEM2015 ─▶ terrain horizons, tiles     ─▶ horizon for a custom point (from tiles)
                       ─▶ validation.json            ─▶ Proof page
```

The heavy astronomy runs once in Python. The browser repeats only the last step: turning a sub-point into an azimuth and elevation for one site. That step is checked against the full SPICE result (section 5). No AI model computes any number. The in-app AI only rewords figures the engine has already produced, and every number in its answer must appear in those figures.

## 2. Source datasets

| Dataset | Provider | Version / resolution | Used for |
|---|---|---|---|
| Planet positions | NASA JPL / NAIF | `de440s.bsp` (JPL DE440, 1849–2150) | Sun, Earth and Moon positions |
| Moon orientation | NASA JPL / NAIF | `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00008.tpc` | Moon-fixed frame, including libration |
| JPL Horizons | NASA JPL Solar System Dynamics | Online API, airless, surface observer on body 301 | Independent check only |
| LRO LOLA polar DEMs | NASA LRO / PDS Geosciences Node | `ldem_875s_20m`, `ldem_80s_80m`, `ldem_75s_120m`, `ldem_60s_240m` | South polar terrain and horizons |
| LRO LOLA global DEM | NASA LRO / PDS | `ldem_128` (128 pixels per degree, about 237 m at the equator) | Terrain for sites outside the polar and SLDEM maps |
| SLDEM2015 | NASA PDS (Barker et al., 2016), LOLA + JAXA SELENE/Kaguya | 512 pixels per degree, two tiles | Terrain at the Apollo 11 region and other low-latitude sites |
| DSN antenna positions | NASA DSN Telecommunications Link Design Handbook 810-005, module 301 | DSS-14 Goldstone, DSS-63 Madrid, DSS-43 Canberra (70 m) | When a station can see the Moon |
| Site coordinates | NASA NSSDCA, LROC, IAU/USGS Gazetteer | One official source per site, in `pipeline/data/sites.json` | The 20 curated sites |
| Mission Replay facts | NASA, ISRO, PIB, Firefly Aerospace | Landing and end times with links | Mission Replay only |

## 3. Derived files (in `web/public/data/`)

| File | Content | Sampling |
|---|---|---|
| `subpoints-2026…2030.json` | Sub-solar and sub-Earth latitude, longitude and distance | Every hour; the browser interpolates between hours |
| `dsn-2026…2030.json` | Which of the three DSN stations has the Moon's centre at least 10° up | Every hour |
| `replay/` | The same two files for 1969, 2023, 2024 and 2025 | Every hour |
| `horizon/<site>.json` | Terrain horizon: the skyline's elevation in each direction | 360 directions, 1° apart, out to 150 km, eye 2 m above the ground |
| `horizon/<site>-ellipse.json` | Horizons for the target and 8 points on rings 100 m, 500 m and 1 km away | IM-1, IM-2 and the Shackleton rim |
| `heights/` | LOLA polar heights cut into small tiles, for custom points south of 65° S | Finest map within 10 km, 240 m or finer within 40 km, 480 m out to 150 km |
| `map/golden-grid.json` | Share of hours with Sun, Earth and Golden for 2026–2030 | A node every 5 km, within 300 km of the pole, checked every hour |
| `terrain/` | Height tiles for the 3D view around IM-1, IM-2 and the Shackleton rim | 20 m cells to 3 km, 200 m to 30 km, 1 km to 150 km |
| `validation.json` | Every check on the Proof page | 128 checks |
| `map/relief.webp`, `map/heights.png`, `sky/*.webp` | Pictures and display heights for the Atlas and Sky pages | Display only; no number is read from them |

## 4. Rules the engine uses

- **Position:** the azimuth and elevation of the Sun's and Earth's centres from the site, with no atmosphere and no refraction, because the Moon has none.
- **Horizon:** for each of 360 directions, the highest angle of the ground out to 150 km. The calculation accounts for the Moon's curvature and puts the eye 2 m above the ground, about the height of a lander's panels and antenna. Samples start 10 m apart and grow 0.2% per step.
- **Sun up (lit):** the Sun's centre is above the skyline in its direction.
- **Earth in view:** Earth's centre is above the skyline in its direction.
- **DSN listening:** at least one of Goldstone, Madrid or Canberra has the Moon's centre 10° or more above its horizon.
- **Comms:** Earth in view and a DSN station listening.
- **Golden:** Sun up and Comms at the same time.
- **Windows:** the time is scanned in 10-minute steps, and each change is narrowed down to 30 seconds.
- **Countdown:** the next sunset, sunrise, Earthset or Earthrise is searched up to 60 days ahead, never past the data.
- **Best dates:** every landing hour in the 12 months from the chosen date is scored by the Golden hours of a 14-day mission. The five best are kept, at least 14 days apart.
- **Power (illustrative):**
  - Sunlight is 1361 W/m², scaled by the Sun's real distance and by how much of the Sun's disc clears the skyline.
  - The example lander's panel turns to face the Sun or is fixed vertical.
  - The battery is simulated every 10 minutes.
- **Landing ellipse:** the target and 8 compass points on rings 100 m, 500 m and 1 km away, each with its own horizon, scored for the same 14-day mission.

## 5. How we know it is right

The Proof page shows all 128 checks, read straight from `validation.json`. All pass, and the largest angle difference is 0.000742°. For scale, the Sun is about 0.53° wide.

| Check | Count | Against | Limit |
|---|---|---|---|
| Sun and Earth position from 3 sites at 4 times | 24 | NASA JPL Horizons | 0.1° |
| Browser engine for every curated site | 80 | Full Skyfield + SPICE calculation | 0.02° |
| Moon elevation from each DSN station | 12 | NASA JPL Horizons | Listed on the page |
| Terrain heights and illumination | 12 | LROC landing heights and published results | Listed on the page |

**Further checks in the test suites**

- Mission Replay files: within 0.01° of JPL Horizons at each real touchdown. The worst difference is 0.0004°.
- Custom-point horizons from tiles: within 0.061° of the full maps at 32 test points.
- The browser code: 892 unit tests and 461 browser tests.

## 6. Limits

- **Terrain detail:** A skyline is only as fine as its map.
  - Near the pole the map is 20 m to 240 m.
  - At sites marked as coarse terrain it is the 237 m global map, so close slopes are smoothed. At Apollo 11 the coarse and fine skylines differ by up to about 2°.
- **Exact points:** Every result is for one point. Ground nearby can differ, which is why the Landing Ellipse page exists.
- **Map regions:** The map finds regions, not the best spot. A map node and a nearby point can differ widely: the Shackleton rim point gets 84.8% sunlight, the nearest node 28.2%.
- **Comms is geometry:** Antenna pointing, the link budget and station scheduling are not modelled. Relay satellites for the far side are not included.
- **Sun centre, not limb:** "Sun up" uses the centre of the disc. The power model does count the part of the disc above the skyline.
- **Power model:** It is illustrative. It leaves out temperature, heaters, charging and wiring losses, dust, and the lander shading itself.
- **Ellipse rings:** The rings are circles of sample points. A real landing ellipse depends on the approach.
- **Data years:** The planner covers 2026–2030; Mission Replay also covers 1969 and 2023–2025.
- **Pictures:** The Atlas light, the relief image, the sky art and the 3D view only draw the engine's numbers. The Atlas Moon is lit from the real Sun direction, but ground in shadow is shown dim so it stays readable.
