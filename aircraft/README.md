# Adding an airplane

Each airplane lives in `aircraft/<id>/` and exports one `AircraftDef` (see `types.ts`) from its `index.tsx`.
The shell (`components/App.tsx`, `components/scene/Scene.tsx`) knows nothing airplane-specific. `aircraft/sr20/` is the reference implementation.

To add one:

1. Add its id to `AIRCRAFT_IDS` in `lib/systems.ts` (and any new system ids to `SysId`, with their rail and part colour in `SYS_COLOR`).
2. Create `aircraft/<id>/` with the files below and export its `AircraftDef` from `index.tsx`.
3. List it in `FLEET` in `aircraft/index.ts` (picker order). The fleet picker sizes itself to the number of airplanes.

## Files

- `systems.ts`: `SysDef[]` rail entries in POH/AFM Section 7 order: id, name, page, camera `[position, target]`, overview blurb, and `ref` when a system is described in another document (e.g. a supplement). A system's colour comes from `SYS_COLOR` in `lib/systems.ts`, by id.
- `geometry.ts`: Airframe shape: fuselage station table, wing/tail/fin functions, window outlines, painted skin.
- `parts/`: The parts catalogue, one file per system group. `catalogue.ts` creates `CAT = new Catalogue(id, labelLists?)` and the helpers the sections share; each section file (`engine.ts`, `fuel.ts`, …) registers its parts, shells and control surfaces; `index.ts` imports the sections in order and re-exports the anchor positions other files use. Registration order sets part ids and which part carries a name's label pin, so add a part to the section it belongs to and keep the import order in `index.ts`.
- `rig.ts`: Flight-control linkage geometry and kinematics: stations, pulleys, cable runs, and the pose and surface deflections for given control inputs. The Cessnas build theirs with `cessnaRig()` from `aircraft/cessna/rig.ts`. Drawn by `ControlRig.tsx` or `Airplane.tsx`.
- `flows.ts`: Pipes, wires, ducts and cables (`FlowSpec[]`) and `flowRates(s, E)`.
- `model.ts`: Sim state type, `initialSim`, the pure solver `solve(s, prev?) → E` (buses, powered loads; `prev` is the last solution, for state that latches), alerts and annunciation list, breaker table, autopilot configuration (`AFCS_CFG`), and `live` (per-frame values, with their initial values).
- `store.ts`: `createSimStore(initialSim, solve)` and the scenarios ("Start from" buttons).
- `tick.ts`: Per-frame step: engine, RPM, flap motor, timers, flight state and autopilot. Writes `live`; discrete changes go through the store. No side effects at import.
- `Airplane.tsx`: The scene: `<Shells>`, `<ControlSurfaces>`, `<Parts>`, moving groups, `<Tanks>`, `<Flows>`, `<Screens>`, `<LightFX>`, `<WindowOutlines>`.
- `ControlRig.tsx`: Optional: draws the moving flight-control linkage from `rig.ts`, when it is big enough for its own file (SR20, DA40; the Cessnas draw their `rig.ts` linkage in `Airplane.tsx`).
- `Parachute.tsx` (SR20): The airplane's optional `Overlay`: a scene-level effect that gets the model groups (CAPS deployment).
- `displays.ts`: Canvas drawing for the cockpit displays. The G1000 airplanes call `lib/avionics/g1000.ts`; the SR20 calls it with `style: "perspective"` and draws its MD302 standby itself.
- `panels/*.tsx`: Side panel per system: lead paragraph, controls, readouts, facts and notes from the POH.
- `panels/distribution.tsx` (SR20, DA40): The electrical panel's live single-line power distribution diagram, drawn from the solution `E` with the symbols in `components/ui/wiring.tsx` (the Cessnas share theirs, `Nav3Diagram` in `cessna/panels.tsx`).

## Shared code

- `components/scene/` draws what the airplane declares. Parts, shells and control surfaces cache their geometry per spec and
  share materials, so switching airplanes is cheap; everything else a component builds is disposed when the airplane is switched away.
- `lib/anims.ts` holds the part animations every airplane uses (spark plugs, magnetos, brakes, glow, push-pull knobs); each takes
  getters into the airplane's own store or `live` values. `Part` applies the live animation, then enforces focus, dimming and
  ghost materials so an animation cannot override the selected view's presentation.
- `lib/trimTab.ts` builds matching elevator cutouts and trailing-edge trim tabs. Its shared hinge also places moving tab
  horns and rod attachment points; span/chord and visual clearances remain approximate unless documented for the airplane.
- `components/ui/wiring.tsx` holds the symbols for the live electrical diagrams (breaker, switch or relay contact, diode, fuse, bus box, key),
  drawn on a vertical or horizontal wire, dead or live.
- `lib/avionics/` holds the G1000 / Perspective+ display drawing, the flight-state integrator, and the GFC 700 and KAP 140 logic (pure functions;
  every GFC 700 function takes the airplane's config, built from `GFC700_BASE`). `components/avionics/` holds their panel controls.
- `aircraft/cessna/` is the Cessna NAV III base used by the C172S and C182T:

  | File                       | Role                                                                                                               |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
  | `airframe.ts`              | Station-table airframe builder (`IN`, stations → scene coordinates, wing, strut, painted skin)                     |
  | `rig.ts`                   | Figure 7-1 flight-control rig builder; `RigSpec` names the autopilot servos and an optional aft elevator bellcrank |
  | `yoke.ts`                  | NAV III control wheel ("ram's horn") geometry and the anchors for the switches on the pilot's left horn            |
  | `electrical.ts`            | NAV III buses, breaker board model, solver, EIS colour rules, `NAV3_BUSES`                                         |
  | `annunciations.ts`         | Annunciation window and EIS gauges (each airplane passes its own `Nav3AnnDef[]` list)                              |
  | `panels.tsx`, `cessna.css` | MASTER / AVIONICS / STBY BATT switches, bus diagram, breaker board, meters, annunciation table                     |
  | `tick.ts`                  | Per-frame models (vacuum pump)                                                                                     |

## Conventions

- **Axes:** x forward, y up, z toward the right wing. Units are metres; `pivotX` is the scene origin offset, and `groundY` is where the grid sits.
- **State:** View state (which system is shown, x-ray, labels, channel focus, camera) is shared in `lib/view.ts`.
  Each airplane's switches, levers, failures and quantities live in its own store, so they survive switching airplanes.
  Values that change every frame (RPM, flap angle, timers) go in a mutable `live` object, not React state.
- **Parts:** A part's `parent` puts it on a moving group that `Airplane.tsx` renders and animates
  (e.g. `"surf:elevR"` is added automatically by `<ControlSurfaces>`). `anim(mesh, t)` runs every frame for live material and position changes.
- **SR22T engine groups:** An engine part or flow carries its Engine-view toggle groups as a `groups` option (`["oil"]`,
  `["induction", "exhaust"]`; `[]` is core). Only `ENGINE_GROUPS` ids type-check, and an unknown tag throws at registration.
  Untagged items fall back to the defaults in `engine-groups.ts`; the coverage test in `tests/sr22t-engine-groups.test.ts`
  fails on any engine item that resolves to neither.
- **Labels:** The first part with a given name and `pin: true` gets a label pin and a "tap to locate" entry (`CAT.pinned(sys)`).
  `pinIn` limits its label to some views. Where a view would pile labels up, the catalogue's label lists take over by part name:
  `quiet` (listed but not labelled in that view) and `narrow` (on the phone layout, only these are labelled). Names that match no pinned
  part are reported in the development console. A screen's label follows its `sys`, or its `pin` option.
- **Accuracy:** Every number and claim in notes and panels comes from the POH/AFM for the club airplane's serial number.
  Cite figures and pages where helpful, and say so when sources differ or when the model is approximate.
  CAS and annunciation text must match the documents exactly.
- **File names:** no two paths may differ only in letter case (macOS and Windows checkouts would break).
