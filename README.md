# Airplane Systems

Interactive 3D study models of six airplanes' systems, built from **POH/AFM Section 7 – Airplane and Systems** (or, for the Mooney, the Owner's Manual's Part I): the Cirrus SR20 G6, the Cirrus SR22T G6 (turbocharged TSIO-550-K, TKS ice protection, built-in oxygen, guided preflight walk-around), the Cessna 172S NAV III (G1000 + GFC 700), the Cessna 182T NAV III (G1000 + KAP 140), the Diamond DA40 XLS (G1000 + GFC 700) and a 1968 Mooney M20C Ranger (N6947N: Johnson-bar gear, hand-pumped flaps, Brittain PC, steam gauges). Pick an airplane and a system to fly the camera to it, hover parts for notes, and operate switches, levers and failures. The systems are linked: pull an alternator and the buses, displays and alert window respond. Each airplane keeps its own switch positions when you switch to another, and the URL path (`/c172s/electrical`) names the view shown.

Built with **Next.js 16 (App Router)**, **React Three Fiber**, **drei** and **zustand**.

> Unofficial study aid. Always use the POH/AFM and supplements for your serial number.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run test:ui:m20c # desktop and phone browser regressions (after build; also run in CI)
npm run check      # formatting, typecheck and tests (what CI runs, plus the build)
npm run format     # format everything with Prettier
npm run shot -- c172s/electrical   # screenshot a view (or an airplane, or "all") into .shots/
```

`npm install` also sets up a pre-commit hook that formats staged files. `npm run shot` needs Chromium for Playwright
(`npx playwright-core install chromium`); with `--compare <dir>` it reports which views changed against an earlier set.

## What's modelled

The SR20 is described below. The SR22T covers its own POH Section 7 the same way, adding the twin-turbocharged, intercooled TSIO-550-K, two alternators and two batteries, FIKI TKS ice protection (optional: clear it on the Overview panel to see the airplane without it), the built-in oxygen system, and a guided preflight walk-around (the toolbar's Preflight button). The Cessnas and the DA40 cover their own POH/AFM Section 7 the same way (see each airplane's rail), with a NAV III / DA40 electrical solver and its live power distribution diagram, live G1000 PFD/MFD textures and a working autopilot (GFC 700 or KAP 140) driving a simple flight-state model. The M20C has no glass: its panel is one live canvas of round mph gauges, and its systems are the manual Johnson-bar gear with its horn and lights, the hydraulic hand-pump flaps (stroke by stroke), the whole-tail pitch trim, the vacuum-powered Brittain Positive Control wing leveler (with cut-off button and roll trim), a carbureted O-360 with throttle-pump priming and carburetor ice, a single-bus 12 V alternator system with switch-breakers, and the vacuum system that feeds the gyros and PC.

| SR20 system          | Interactive                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flight controls      | Cable runs from POH Figs 7-1/7-2/7-3: torque tube, sectors, pulleys, push-pull tubes and bellcranks move with the yokes and pedals; per-channel focus (elevator / aileron / rudder); horn balances, trim tabs, static wicks |
| Wing flaps           | UP / 50% / 100% with position lights and VFE; needs the FLAPS breaker and NON ESS bus                                                                                                                                       |
| Gear & brakes        | Differential braking castering the nose wheel, parking brake                                                                                                                                                                |
| Engine & propeller   | Ignition key (magneto → plug mapping), power lever (governor schedule), mixture, alternate air                                                                                                                              |
| Fuel                 | Selector, boost pump, tank quantities (clipped fuel level), starvation                                                                                                                                                      |
| Electrical           | Master switches, failures, battery endurance, live power distribution diagram, **pullable circuit breakers**, G6 CAS names                                                                                                  |
| Lighting             | NAV / STROBE / LAND / ICE switches: wingtip nav, strobe, aft position and landing lights (no tail light, no cowl light), ice inspection lights; cabin and convenience lights                                                |
| Environmental        | OFF–0–1–2–3 fan knob, temperature blend, vent modes, A/C, recirculation                                                                                                                                                     |
| Pitot-static & stall | Pitot heat logic and annunciations, stall-warning suction peak and horn                                                                                                                                                     |
| Avionics             | Live Perspective+ PFD / MFD (shared Garmin renderer) and MD302 standby that go dark with their buses; DISPLAY BACKUP reversion                                                                                              |
| CAPS                 | Scrubbable deployment: rocket extraction, slider, snubbed riser, line cut, descent                                                                                                                                          |

## Project structure

```
app/                  Next.js App Router entry (layout, page, icon, global CSS)
components/
  App.tsx             Shell: fleet picker, system rail, toolbar, alert window, HUD, tooltip, panel; URL and tab title
  Tour.tsx            Welcome tour shown on a first visit (skipping or finishing it is remembered; the toolbar's ? replays it)
  scene/              Shared React Three Fiber scene: Scene (canvas, camera flights, sim clock), Part / Shells,
                      ControlSurface, Flows, Links, Tanks, Screens, LightFX, WindowOutlines, PinDeclutter
  avionics/           GFC 700 and KAP 140 panel controls (keys, AFCS status strip, G1000 knobs)
  ui/controls.tsx     Seg, Slider, Check, Rocker, Readouts, Facts, HoldButton, …
  ui/wiring.tsx       Symbols for the live single-line electrical diagrams (breaker, switch, diode, bus box, key)
aircraft/             One folder per airplane, plus cessna/ (shared Cessna NAV III base) — see aircraft/README.md
lib/
  view.ts             View state shared by every airplane (airplane, system, toggles, theme, camera); phone breakpoint
  fleet.ts            Airplane / system selection, remembered view, URL path
  systems.ts          Airplane ids, system ids, palette
  catalogue.ts        Declarative part catalogue: parts, shells, lofted control surfaces and the parts riding on them, label lists
  anims.ts            Part animations shared by every airplane (spark plugs, magnetos, brakes, glow, push-pull knobs)
  simStore.ts         createSimStore: one zustand store per airplane (discrete state + derived solution)
  avionics/           G1000 / Perspective+ display drawing, flight-state integrator, GFC 700 and KAP 140 logic (pure functions)
  geometry.ts, materials.ts, math.ts, registry.ts, canvas.ts
tests/                Vitest: fleet-wide invariants, electrical solvers, scenarios, GFC 700 and KAP 140 logic
scripts/shot.mjs      Screenshots of any view (npm run shot), with a comparison mode
AGENTS.md             Working notes for coding agents (CLAUDE.md points to it)
```

### State model

- **View state** (which airplane and system, x-ray, labels, theme, camera requests, hover) is shared in `lib/view.ts`.
- **Discrete state** (switches, levers, selections) lives in each airplane's zustand store as an immutable `Sim` object. Every update recomputes that airplane's solution `E` (buses, powered loads, …) with a pure `solve` function that is easy to test.
- **Continuous values** (RPM, flap angle, flight state, autopilot state, CAPS time) live in each airplane's mutable `live` object advanced in `useFrame`, so animation doesn't re-render React. Panels that show them use a small `useTicker` hook.

How to add an airplane, and where each kind of code goes: [aircraft/README.md](aircraft/README.md).

## Sources

SR20 (each other airplane cites its POH/AFM, supplements and CRG in its files and panels):

- Cirrus SR20 POH, P/N 11934-005 Reissue A — Section 7 (systems), Section 1 Figure 1-1 (three view, used for the fuselage profile), Section 2 limits and markings, Sections 3 and 3A (CAS message names, best glide), the Section 4 speeds used on the PFD, and the Section 5 cruise table (percent power).
- Garmin Cirrus Perspective+ Pilot's Guide 190-02183-03 and the Cirrus Perspective+ brochure — display layout and bezels.
- Mid-Continent MD302 Standby Attitude Module Pilot's Guide and Installation Manual — the standby instrument.
- Side photos of SR20 G6 OO-CBB (s/n 2347), Wikimedia Commons — tailcone, fin and window outlines.
- M20C: the 1965 Mark 21 (M20C) Owner's Manual with its 1962–64 supplement, the M20C Ranger Operator's Manual (Dec 1974), the 1963 FAA Approved Flight Manual for s/n 2394, FAA TCDS 2A3 (limits, control travels, stations, equipment), the 1968 Ranger manual's dimensioned three-view, Lycoming and Hartzell manuals and ADs, Mooney's serial chronology and type-club material (marked where used). N6947N is registered as a 1968 M20C, s/n 680194.
- Costanzo Air Flight School, _Cirrus SR20 Systems_ deck — electrical readouts, battery-endurance rule of thumb, and photo detail (horn balances, static wicks, OAT probes, ECS knob). Where it differs from the POH, the POH wins and the page says so.

Geometry is approximate. CAS and annunciation text follow the documents; the conditions that trigger them are simplified.

## License

The code is under the [MIT License](LICENSE). It doesn't cover the POH/AFM documents, Garmin pilot's guides or photos listed under Sources; those belong to their owners.
