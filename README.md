# 🌙 LunaHorizon

> **Find the right place and the right time to land on the Moon.**

**Team Astral** · Cumilla, Bangladesh
NASA Space Apps Challenge 2026 · Challenge: **Lunar Landing Site Navigator** (formerly listed as *CLPS Lunar Mission Browser*)
Team page: https://www.spaceappschallenge.org/2026/find-a-team/team-astral3/

---

> ⚠️ **Project status: Concept stage**
>
> This repository has the **concept and plan** for LunaHorizon. It contains no working code yet.
> NASA Space Apps rules say teams may not start building before the hackathon. Development will begin during the official hackathon (November 2026).

---

## 🛰️ The Problem

At the Moon's south pole, the Sun stays only a few degrees above or below the horizon, and Earth keeps rising and setting from view. Crater walls and mountains can block both.

For a lander, this means:

- ☀️ **Power:** if the Sun is too low or blocked, solar panels produce little or no power.
- 🌍 **Communication:** if Earth is below the horizon, the lander cannot talk directly to Earth.

If a mission picks the wrong site or the wrong date, it can lose both. Tools that calculate Sun and Earth positions already exist, but they are hard to use. It takes an expert to read their results quickly.

## 💡 Our Solution

**LunaHorizon** is a planned interactive web tool. A user picks a **landing site** (from a curated list or their own coordinates) and a **date**, and LunaHorizon shows:

| Feature | What the user sees |
|---|---|
| 📍 **Curated and custom sites** | Apollo, CLPS, other nations' missions (e.g. Chandrayaan-3, Chang'e, SLIM), Artemis III regions, or any latitude/longitude |
| 🌄 **Sky View** | The Sun's path and Earth's position against the real terrain horizon, with an animation over a lunar day |
| ⏳ **Sunset / Earthset countdown** | Time left before sunset and Earthset, and the current solar elevation |
| 📡 **Power and comms windows** | When the site has sunlight, when Earth is visible, and the **Golden Window** when both happen together |
| ⚖️ **Compare** | Up to three sites or dates side by side |
| 📅 **Best dates + Schedule Slip Planner** | The best landing dates in the next 6–12 months, and what changes if the date slips or the site moves |
| ✅ **Validation Panel** | Our numbers next to JPL Horizons, with the difference |
| 💬 **Plain-language summary** | A short explanation of the results for non-experts |

Planned next: a south pole **Golden Window Map**, a **"small change, big impact"** view, **Mission Replay** of real landings, and a **Classroom mode with Bangla**.

### Example view (concept)

```
┌──────────────────────────────────────────┐
│  🌙 LunaHorizon                           │
├──────────────────────────────────────────┤
│  Landing site:  [ South pole site A ▼ ]  │
│  Date & time:   [ 2027-01-14  14:30 UTC ]│
│                                          │
│   ☀️ Sun elevation:    +1.8°             │
│   🔋 Power potential:  ███████░░░  High  │
│   🌍 Earth elevation:  +4.2°             │
│   📡 Communication:    ✅ Available       │
│                                          │
│   [ + Compare another site ]             │
└──────────────────────────────────────────┘
```

*Values above are placeholders for illustration only.*

## 👥 Who It's For

- **Mission planners:** quick first check of sites and dates
- **Educators and students:** a visual way to learn why the lunar south pole is hard
- **The public:** anyone curious about returning to the Moon

## ⚙️ How It Will Work

```
NASA open data  →  Position calculation  →  Visualization  →  Plain-language summary
(ephemeris +        (Sun & Earth elevation    (sky view,         (short explanation
 terrain)            and azimuth per site)     charts, compare)   of the results)
```

1. **Data:** Sun and Earth positions come from NASA ephemeris data. Terrain data shows where hills or crater walls block the horizon.
2. **Calculation:** For each site and time, compute Sun and Earth elevation and azimuth, then check them against the local horizon.
3. **Visualization:** An interactive sky view, elevation charts over time, and a side-by-side comparison.
4. **Summary:** The calculated numbers are turned into a short, easy explanation. The calculation always comes from the data; the summary only explains it.

## 🗂️ NASA Data Sources (planned)

| Source | Use |
|---|---|
| [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Sun and Earth positions seen from a point on the Moon |
| [NAIF SPICE](https://naif.jpl.nasa.gov/naif/) | Official ephemeris data used by NASA missions |
| [LRO LOLA elevation data](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) | Terrain, to find the real local horizon (no atmosphere, so no refraction) |
| [NASA Moon Trek](https://trek.nasa.gov/moon/) and [LROC QuickMap](https://quickmap.lroc.asu.edu) | Reference maps and layers |
| [NASA CLPS](https://www.nasa.gov/commercial-lunar-payload-services/), Apollo and other agencies' mission pages | Real landing sites to compare |

The official challenge resources will be published on 13 November 2026. We will update this list to match them.

## 🧰 Planned Tech Stack

- **Frontend:** React / Next.js, TypeScript
- **Visualization:** D3.js for charts, Three.js or CesiumJS for 3D views
- **Calculation / data:** Python (Skyfield or SpiceyPy), JPL Horizons API
- **Deployment:** Vercel

## 🗓️ Hackathon Plan

| Phase | Goal |
|---|---|
| Hours 0–4 | Project setup, fetch Sun and Earth positions for one site |
| Hours 4–14 | Core UI: site and date picker, sky view, elevation charts |
| Hours 14–22 | Site and date comparison, power and communication indicators, plain-language summary |
| Final hours | Testing, deployment, documentation, final video |

## 👩‍🚀 Team Astral

| Member | Role |
|---|---|
| **Khorshed Alam Mozahid** | Team Lead & Lead Developer: coordination, frontend, architecture, QA |
| **Jannatul Nur Tuli** | UI/UX & Presentation: design, storytelling, pitch |
| **Omar Faruk Javed** | Data & Research: NASA data, Sun and Earth position research |
| **Navid Hasan** | Backend & Integration: APIs, data pipeline |
| **Riyan Khalashi** | Documentation & Testing: docs, test cases, demo preparation |

## 🤖 AI Use Disclosure

Following NASA Space Apps rules, we disclose our AI use:

- This README and our pitch material were drafted with help from an AI assistant (Claude by Anthropic) and reviewed and edited by the team.
- During the hackathon, we plan to use AI-assisted development (Claude Code) for code generation and review. All AI use will be listed here.
- Any AI-generated images or video will carry a visible watermark.
- This project uses no NASA logos, flags or mission insignia.

## 🎵 Video Credits

- Background music: "Lightless Dawn" by Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
- South pole illumination map: NASA/GSFC/Arizona State University (LRO).
- Subtitles were generated with AI speech recognition (Whisper) and checked by the team.

## 📄 Disclaimer

LunaHorizon is a student hackathon project. It is not affiliated with or endorsed by NASA.
