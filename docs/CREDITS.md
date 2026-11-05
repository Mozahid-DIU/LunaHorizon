# Credits and licenses

LunaHorizon uses only data, code, fonts and media that are public domain or under an open licence that allows reuse. Each item below lists its licence and the credit we give. Nothing with an unclear or restrictive licence is used.

## Data

| Data | Provider | Terms | Credit |
|---|---|---|---|
| SPICE kernels (DE440, Moon PA DE421, Moon frames, PCK) | NASA JPL / NAIF | NASA data, not subject to U.S. copyright | NASA/JPL-Caltech, NAIF |
| JPL Horizons results | NASA JPL Solar System Dynamics | NASA data, not subject to U.S. copyright | NASA/JPL Horizons |
| LRO LOLA elevation maps | NASA LRO / PDS Geosciences Node | NASA data, not subject to U.S. copyright | NASA/GSFC LOLA Science Team |
| SLDEM2015 (LOLA + Kaguya) | NASA PDS (Barker et al., 2016) | Distributed openly through NASA PDS | Barker et al. (2016), NASA LOLA and JAXA SELENE/Kaguya |
| LROC landing-site pages (coordinates only) | NASA / Arizona State University | Facts cited; no images copied | NASA/GSFC/Arizona State University |
| NSSDCA Apollo site coordinates | NASA NSSDCA | NASA data, not subject to U.S. copyright | NASA NSSDCA |
| Crater names and positions | IAU / USGS Gazetteer of Planetary Nomenclature | U.S. government work, public domain | IAU WGPSN / USGS |
| DSN complex locations | NASA Deep Space Network | Public facts | NASA DSN |

Landing coordinates are facts and are cited for transparency. We do not copy images, text or logos from mission pages.

## Software

| Library | Licence |
|---|---|
| Skyfield, jplephem, sgp4 | MIT |
| NumPy | BSD-3-Clause |
| requests | Apache-2.0 |
| Pillow | MIT-CMU |
| pytest | MIT |
| Next.js, React | MIT |
| d3-scale | ISC |
| Three.js | MIT |
| qrcode-generator (Kazuhiko Arase) | MIT |
| Vitest | MIT |
| Playwright | Apache-2.0 |

## AI model in the app

| Model | Licence | Served by |
|---|---|---|
| gpt-oss-120b (OpenAI, open-weight) | Apache-2.0 | Groq API, free plan |

The model only rewords figures our engine computed. It receives those figures and nothing a visitor types. Groq says it does not keep inputs by default, but may log them for up to 30 days to check reliability and abuse.

## Fonts and media

| Item | Licence | Credit |
|---|---|---|
| IBM Plex Sans, Sans Condensed, Mono | SIL Open Font License 1.1 | IBM |
| Video music: "Lightless Dawn" | CC BY 4.0 | Kevin MacLeod (incompetech.com) |
| All diagrams, icons and illustrations in the app and docs | MIT (this project) | Team Astral |
| Atlas relief map | NASA data; image MIT (this project) | Rendered by Team Astral from NASA/GSFC LOLA elevation maps |
| Sky View terrain art | NASA data; images MIT (this project) | Rendered by Team Astral from LOLA maps and SLDEM2015 (NASA LOLA + JAXA Kaguya) |

## Rules we follow

- No NASA logos ("meatball" or "worm"), agency flags or mission insignia, as required by Space Apps.
- No images from news sites, Wikipedia or stock libraries.
- New dependencies are added only if their licence is MIT, BSD, ISC, Apache-2.0 or similar permissive licence; the licence is recorded here.
- LunaHorizon is not affiliated with or endorsed by NASA.
