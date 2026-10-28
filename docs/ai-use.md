# AI use log

Tool: **Claude Code** (Anthropic), used as a pair programmer. Every entry lists what we asked, what the AI produced, and how we checked it.

| Date | Prompt (summary) | AI output | How we verified |
|---|---|---|---|
| 2026-10-28 | "Set up the project and compute Sun and Earth positions from a point on the Moon using NASA SPICE data; validate against JPL Horizons." | `pipeline/ephemeris.py` (Skyfield + DE440 + Moon ME frame), `pipeline/horizons_ref.py`, tests, kernel download script | 24 test cases against JPL Horizons (3 sites × 4 times × Sun/Earth); all within 0.1°, observed difference < 0.0001° |

In the app, AI is used only to explain numbers that our own code computed. It never calculates positions or windows.
