"use client";
import {
  altAirOpen,
  bladeAngle,
  fuelAvail,
  live,
  mapInHg,
  overboostMayLift,
  pumpSpeed,
  RPM_WARNING_STEPS,
  titState,
  wastegateReading,
} from "../model";
import { CAT } from "../parts";
import { ENGINE_GROUPS } from "../engine-groups";
import { useEngineGroups } from "../engine-group-store";
import { useSR22T } from "../store";
import {
  BtnRow,
  Caution,
  Check,
  Ctl,
  Facts,
  H3,
  Notes,
  PartsList,
  Readouts,
  Seg,
  Slider,
  Small,
  useTicker,
} from "@/components/ui/controls";

const lever = (v: number) => (v < 0.03 ? "IDLE" : v > 0.97 ? "MAX" : Math.round(v * 100) + "%");
const rpm10 = () => String(Math.round(live.rpm / 10) * 10);

export function Engine() {
  useTicker(200);
  const s = useSR22T((x) => x.s),
    up = useSR22T((x) => x.update);
  const { shown, set } = useEngineGroups();
  const g = s.eng;
  return (
    <>
      <p className="lead">
        A Continental TSIO-550-K, twin turbocharged and fuel injected. One power lever sets the throttle only: the
        governor holds 2,500 RPM on its own. Twin turbochargers with intercoolers hold 36.0 in.Hg for takeoff (POH 4-14,
        4-17). Mixture is manual. Two magnetos fire two plugs per cylinder.
      </p>
      <Ctl>
        <H3>Show sub-systems</H3>
        {ENGINE_GROUPS.map((group) => (
          <Check
            key={group}
            id={"grp-" + group}
            label={group[0].toUpperCase() + group.slice(1)}
            checked={shown[group]}
            onChange={(on) => set(group, on)}
          />
        ))}
        <Small>
          Core parts (crankcase, cylinders, mount) always show; a part in several groups (the turbochargers, wastegate,
          throttle body) shows while any of its groups is on.
        </Small>
      </Ctl>
      <H3>Engine controls</H3>
      <Ctl>
        <Seg
          id="key"
          label="Ignition key"
          options={[
            ["OFF", "OFF"],
            ["R", "R"],
            ["L", "L"],
            ["BOTH", "BOTH"],
            ["START", "START"],
          ]}
          value={g.key}
          onChange={(v) => {
            if (v === "START") {
              live.startTimer = 1.8;
              live.crankT = 0;
            }
            up((d) => {
              d.eng.key = v;
            });
          }}
        />
        <Slider
          id="power"
          label="Power lever (IDLE → MAX)"
          min={0}
          max={1}
          step={0.01}
          value={g.lever}
          onChange={(v) =>
            up((d) => {
              d.eng.lever = v;
            })
          }
          fmt={lever}
        />
        <Slider
          id="mix"
          label="Mixture — red knob (CUTOFF → RICH)"
          min={0}
          max={1}
          step={0.01}
          value={g.mix}
          onChange={(v) =>
            up((d) => {
              d.eng.mix = v;
            })
          }
          fmt={(v) => (v <= 0.05 ? "CUTOFF" : v > 0.95 ? "FULL RICH" : "Leaned")}
        />
        <Check
          id="filterBlocked"
          label="Induction filter blocked (ice / debris)"
          checked={g.filterBlocked}
          onChange={(v) =>
            up((d) => {
              d.eng.filterBlocked = v;
            })
          }
        />
        <Readouts
          items={[
            ["Engine", g.running ? "RUNNING" : g.key === "START" ? ["CRANKING", "warnc"] : ["STOPPED", "bad"]],
            ["RPM", rpm10()],
            ["MAP in", mapInHg(s, live.rpm).toFixed(1)],
            [
              "Plugs firing",
              live.rpm < 100 ? "—" : g.key === "R" ? "R mag · 6" : g.key === "L" ? "L mag · 6" : "Both · 12",
            ],
            ["Alt air door", altAirOpen(s) ? ["OPEN", "warnc"] : "closed"],
          ]}
        />
      </Ctl>
      <Small>
        RPM follows the fixed 2,500 RPM governor (POH 7-32); MAP and % power are illustrative. Starting needs BAT 1,
        fuel at the selected tank and mixture out of cutoff. Block the induction filter to see the alternate air door
        open on its own (POH 7-37).
      </Small>
      <Turbo />
      <H3>Ignition wiring</H3>
      <Facts
        rows={[
          ["Right magneto", "Lower-right + upper-left plugs"],
          ["Left magneto", "Lower-left + upper-right plugs"],
          ["START", "Starter + both mags; springs to BOTH"],
          ["Starter power", "2 A STARTER, NON ESS BUS"],
        ]}
      />
      <H3>Engine data</H3>
      <Facts
        rows={[
          ["Rating", "315 bhp @ 2,500 RPM"],
          ["TBO", "2,000 hr"],
          ["Oil sump", "8 qt, wet sump (min 6 to fly)"],
          ["Cooler bypass", "below ~180 °F (82 °C)"],
          ["Cooling", "Aluminum baffles, louvered bottom exits, no cowl flaps"],
          ["Induction", "NACA ducts (lower cowls) → air boxes → turbos → intercoolers"],
          ["Exhaust", "Headers → turbines → tailpipes; no muffler"],
          // SR22T POH 13772-007 Reissue A 2-9, Engine Instrument Markings.
          ["Oil pressure", "30–60 psi green · 10–30 / 60–100 yellow · < 10 / > 100 red"],
          ["Oil temp", "100–240 °F green · > 240 red · 75 °F min for takeoff"],
          ["CHT", "240–420 °F green · 420–460 yellow · > 460 red"],
        ]}
      />
      <H3>Annunciations</H3>
      <Facts
        rows={[
          ["TIT", "Red: either TIT > 1750 °F (2-9, 3-30)"],
          ["MAN PRESSURE", "Amber > 36.5 · red > 37.5 in.Hg (provisional 2-9 band mapping; 3A-9, 3-29)"],
          ["ALT AIR OPEN", "Amber: alternate air door opened by a blockage (3A-11)"],
          ["OIL PRESS", "Red < 10 or > 100 psi · amber 10–30 psi at ≥ 1000 RPM (2-9, 3A-8)"],
          ["OIL TEMP", "Red > 240 °F (2-9)"],
          ["CHT", "Amber > 420 °F · red > 460 °F (2-9; AMM 77-20)"],
          ["START ENGAGED", "Amber > 15 s · red > 30 s with the starter engaged (3A-10, 3-49)"],
        ]}
      />
      <H3>Leaning (POH Section 4)</H3>
      <Notes
        items={[
          "Full rich for every takeoff, even at high elevation airports (4-14).",
          "At maximum power (2,500 RPM, 36.0 in.Hg) and any setting above 30.5 in.Hg, keep fuel flow in the green arc (4-17).",
          "Lean only at 30.5 in.Hg or less: to the cyan target fuel flow, or find peak TIT and lean until TIT is 50-75 °F below it (4-22).",
          "Keep CHT at or below 420 °F; a 0.5 GPH fuel-flow reduction lowers CHT about 15 °F (4-19, 4-22).",
          "In descent keep CHT at 240 °F or above (4-23).",
          "The SR22T POH has no Section 7 mixture-management subsection; this is from Section 4.",
        ]}
      />
      <H3>Components</H3>
      <PartsList parts={CAT.pinned("engine")} />
    </>
  );
}

/** Turbo illustration inside the Engine view; no separate system rail.
 * Panel-only TIT pending strip placement confirmation. Pressure altitude and fuel guidance
 * are modelled elsewhere. */
function Turbo() {
  const s = useSR22T((x) => x.s),
    up = useSR22T((x) => x.update);
  const map = mapInHg(s, live.rpm),
    tit = titState(s);
  return (
    <>
      <H3>Turbochargers</H3>
      <Ctl>
        <Seg
          id="turboCondition"
          label="Turbo condition"
          options={[
            ["none", "Normal"],
            ["coldOil", "Cold oil (first flight)"],
            ["leak", "Induction leak"],
            ["gateClosed", "Wastegate stuck closed"],
            ["highTit", "High TIT"],
          ]}
          value={s.turbo.fail}
          onChange={(v) =>
            up((d) => {
              d.turbo.fail = v;
            })
          }
        />
        <Readouts
          items={[
            ["MAP in", [map.toFixed(1), map > 37.5 ? "bad" : map > 36.5 ? "warnc" : ""]],
            ["TIT L / R", tit === "high" ? ["above 1750 °F", "bad"] : tit === "normal" ? "green band" : "—"],
            ["Wastegate % open", wastegateReading(s)],
            ["Overboost relief", overboostMayLift(s) ? ["may lift", "warnc"] : "—"],
          ]}
        />
      </Ctl>
      <Small>
        MAP, TIT and valve travel are illustrations. With the wastegate seized closed, MAP rises to the 37.5 in.Hg red
        line; the overboost relief valve may lift (its setting is not published consistently: AMM 81-20 gives 35, POH
        4-17 normal is 36.0). MAN PRESSURE uses the 2-9 bands provisionally. TIT is shown only as in the green band
        (illustrative, no mixture or power mapping) or, with High TIT, above the 1750 °F limit (2-9). With the engine
        stopped there is no oil pressure on the actuator, so its spring holds the wastegate open (Teledyne Continental
        Motors Overhaul Manual excerpt, 81-20 “Hydraulic Wastegate”, p. 81-04). TIT is panel-only pending Engine Strip
        placement confirmation; the POH 7-35 gauge has two bars, 1000–1800 °F in 100 °F increments.
      </Small>
      <Facts
        rows={[
          ["Turbos", "Twin, one per side (7-38)"],
          ["Intercoolers", "Two (7-37)"],
          ["Wastegate", "One, LH, oil actuated (7-38)"],
          ["Overboost valve", "LH intercooler outlet (AMM 71-60 PDF p. 2542)"],
          ["MAP", "Green 15.0–36.5 · yellow 36.5–37.5 · red 37.5–40.0 in.Hg (2-9)"],
          ["TIT", "Green 1000–1750 · red 1750–1800 °F (2-9)"],
          ["Max altitude", "25,000 ft MSL (2-19)"],
        ]}
      />
      <Notes
        items={[
          "The diaphragm controller senses upper-deck vs manifold pressure across the throttle plate and meters wastegate oil return (7-39). Upper-deck references also serve pressurized magnetos (AMM 74-00 PDF p. 2604) and the fuel pump aneroid (73-00 PDF p. 2582).",
          "Takeoff: full rich, 36.0 in.Hg. Cold oil on the first flight may give 36.0–37.0; reduce power if above 37.0 (4-14, 4-17).",
          "MAN PRESSURE: reduce below 36.5 in.Hg. If high MAP persists with oil above 150 °F, the controller needs maintenance adjustment (3-29, 3A-9).",
          "Overboost: reduce to 30.5 in.Hg or less; adjust fuel flow to top of green arc. Surging may mean a seized wastegate; land as soon as practicable if surging. Relief protects the engine but continued relief can overspeed the turbo; premature descent is unnecessary (3-30).",
          "Unexpected MAP loss: induction coupling leak (most probable), exhaust leak, loss of oil pressure to the wastegate actuator, or internal turbo failure. Performance becomes roughly normally aspirated; internal failure may vent oil through the tailpipe (3-27, 3-28).",
          "TIT is the leaning reference (7-35): cruise at 30.5 in.Hg or less, lean 50–75 °F below peak (4-22). TIT warning: fuel flow to top of green, check ignition BOTH; if still high, reduce power and land as soon as practicable (3-30).",
          "Above 18,000 ft MSL keep MAP at least 15 in.Hg (2-6). Alternate air lowers critical altitude (3A-11); the POH gives no numeric critical altitude and this model uses a fixed 4,500 ft illustration, not an altitude curve.",
          "MAT sensor feeds power and fuel-flow guidance (AMM 77-00 PDF p. 2690, 77-20 PDF p. 2706). Intercooler rear ports supply cabin heat exchanger ram air (POH 7-64).",
        ]}
      />
    </>
  );
}

export function Propeller() {
  useTicker(200);
  const s = useSR22T((x) => x.s),
    up = useSR22T((x) => x.update);
  return (
    <>
      <p className="lead">
        A composite, three-blade, constant-speed propeller. The governor is factory-set to 2,500 RPM: there is no prop
        lever and no governor cable, and the power lever only moves the throttle (POH 7-32, 7-39; AMM 61-20).
      </p>
      <H3>Power lever</H3>
      <Ctl>
        <Slider
          id="power2"
          label="Power lever (IDLE → MAX)"
          min={0}
          max={1}
          step={0.01}
          value={s.eng.lever}
          onChange={(v) =>
            up((d) => {
              d.eng.lever = v;
            })
          }
          fmt={lever}
        />
        <Check
          id="govFail"
          label="Governor failure"
          checked={s.eng.govFail}
          onChange={(v) =>
            up((d) => {
              d.eng.govFail = v;
            })
          }
        />
        <Readouts
          items={[
            ["Governor setting", "2,500 (fixed)"],
            ["RPM", live.rpm > 2550 ? [rpm10(), "bad"] : rpm10()],
            ["Blade angle", bladeAngle(s).toFixed(0) + "°"],
          ]}
        />
      </Ctl>
      <Small>
        Blade angle here is illustrative — it coarsens as power rises so the governor can hold RPM. With the governor
        failed the blades sit at fine pitch and RPM follows the power lever, reaching 3,000 at MAX (illustrative; POH
        3-33 says 3000 RPM or more).
      </Small>
      <H3>How the hub moves</H3>
      <Notes
        items={[
          "Oil pressure on the hub piston twists the blades toward high pitch (low RPM) (POH 7-39).",
          "Pressure relieved: centrifugal force, assisted by an internal spring, twists them toward low pitch (high RPM) (POH 7-39).",
          "Lose oil pressure and the blades go to low pitch — expect an overspeed (POH 7-39, 3-33).",
          "In climb and cruise the governor holds 2,500 RPM; any change in airspeed or load becomes a pitch change (POH 7-39).",
        ]}
      />
      <H3>RPM warning</H3>
      <Notes
        items={[
          "RPM (red) after more than 2,560 RPM for ten seconds or more than 2,580 RPM for five seconds (AMM 77-10).",
          ...RPM_WARNING_STEPS,
          "Governor failure: power to the minimum for sustained flight, 85-90 KIAS, monitor oil pressure, land as soon as practicable (POH 3-33).",
        ]}
      />
      <Facts
        rows={[
          ["Propeller", "Hartzell composite, 3-blade, 78.0 in."],
          ["Models", "PHC-J3Y1F-1N/N7605(B) · N7605C(B)"],
          ["Governor", "Fixed 2,500 RPM, lower left front of crankcase"],
          ["Max RPM", "2,500"],
          ["RPM marking", "Green 500–2,550 · red > 2,550"],
          ["Ground check", "2,480–2,500 at full power (AMM 61-20)"],
        ]}
      />
    </>
  );
}

export function Fuel() {
  useTicker(500);
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
  const f = s.fuel;
  const speed = pumpSpeed(s, E, live.rpm, mapInHg(s, live.rpm), s.paFt);
  return (
    <>
      <p className="lead">
        Each wing is a sealed tank that gravity-feeds a collector sump. The engine-driven pump pulls from whichever
        collector the selector points at; the electric fuel pump is for priming and vapor suppression. Excess fuel
        returns to the selected tank (POH 13772-007 7-40).
      </p>
      <H3>Try it</H3>
      <Ctl>
        <Seg
          id="fsel"
          label="Fuel selector"
          options={[
            ["L", "LEFT"],
            ["R", "RIGHT"],
            ["OFF", "OFF"],
          ]}
          value={f.sel}
          onChange={(v) =>
            up((d) => {
              d.fuel.sel = v;
            })
          }
        />
        <Seg
          id="fpump"
          label="Fuel pump"
          options={[
            ["OFF", "OFF"],
            ["BOOST", "BOOST"],
            ["HIGH", "HIGH BOOST/PRIME"],
          ]}
          value={f.pump}
          onChange={(v) =>
            up((d) => {
              d.fuel.pump = v;
            })
          }
        />
        <Slider
          id="qL"
          label="Left tank"
          min={0}
          max={46}
          step={0.1}
          value={f.qL}
          onChange={(v) =>
            up((d) => {
              d.fuel.qL = v;
            })
          }
          fmt={(v) => v.toFixed(1) + " gal"}
        />
        <Slider
          id="qR"
          label="Right tank"
          min={0}
          max={46}
          step={0.1}
          value={f.qR}
          onChange={(v) =>
            up((d) => {
              d.fuel.qR = v;
            })
          }
          fmt={(v) => v.toFixed(1) + " gal"}
        />
        <BtnRow>
          {(
            [
              ["Full · 92", 46, 46],
              ["Tabs · 60", 30, 30],
              ["Low · 6 / 5", 6, 5],
              ["Imbalance", 20, 6],
            ] as const
          ).map(([t, l, r]) => (
            <button
              key={t}
              type="button"
              className="btn"
              onClick={() =>
                up((d) => {
                  d.fuel.qL = l;
                  d.fuel.qR = r;
                })
              }
            >
              {t}
            </button>
          ))}
        </BtnRow>
        <Slider
          id="paFt"
          label="Pressure altitude"
          min={0}
          max={25000}
          step={500}
          value={s.paFt}
          onChange={(v) =>
            up((d) => {
              d.paFt = v;
            })
          }
          fmt={(v) => v.toLocaleString("en-US") + " ft"}
        />
        <Readouts
          items={[
            ["Total usable", (f.qL + f.qR).toFixed(1)],
            [
              "Feeding",
              f.sel === "OFF"
                ? ["OFF", "bad"]
                : fuelAvail(s)
                  ? f.sel === "L"
                    ? "LEFT"
                    : "RIGHT"
                  : ["DRY TANK", "bad"],
            ],
            [
              "Pump",
              f.pump === "OFF"
                ? "OFF"
                : !E.boostPwr
                  ? ["NO PWR", "bad"]
                  : speed === "high"
                    ? "HIGH BOOST"
                    : f.pump === "HIGH"
                      ? "BOOST · locked"
                      : "BOOST · 4–6 psi",
            ],
            ["Pressure altitude", s.paFt.toLocaleString("en-US") + " ft"],
            ["Engine", s.eng.running ? "RUNNING" : ["STOPPED", "bad"]],
          ]}
        />
      </Ctl>
      <Small>
        Selecting OFF or a dry tank with the engine running stops it after a few seconds — restart from the Engine
        panel. HIGH BOOST/PRIME runs high speed below 500 RPM, or with MAP ≥ 24 inHg and pressure altitude ≥ 10,000 ft;
        otherwise it runs BOOST (POH 7-41, software 2647.M4 or later). The altitude control ends at the maximum
        operating altitude, 25,000 ft (POH 2-19).
      </Small>
      <H3>Annunciations</H3>
      <Facts
        rows={[
          ["FUEL LOW LEFT / RIGHT", "Red: that tank < 1 gal (POH 3-34)"],
          ["FUEL LOW TOTAL", "Amber ≤ 14 gal · red < 9 gal (sensed or totalizer; POH 3-35, 3A-12)"],
          ["FUEL FLOW", "Red: high fuel flow (not simulated; POH 3-36 gives no trigger)"],
          ["FUEL IMBALANCE", "L/R difference: white > 8 · amber > 10 · red > 12 gal (POH 3-35, 3A-12, 3A-13)"],
        ]}
      />
      <Caution title="Caution">
        At ¼ tank or less, prolonged slips or skids can unport the tank outlet. With a tank that low (or one dry), stay
        coordinated — no more than 30 seconds uncoordinated (POH 7-43).
      </Caution>
      <H3>Details</H3>
      <Facts
        rows={[
          ["Capacity", "47.25 gal per tank · 46 usable (POH 2-18, 7-40)"],
          ["Total usable", "92 gal · 94.5 gal capacity (POH 1-7, 2-18)"],
          ["Filled to tabs", "30 gal/side · 60 total (POH 7-40, placard 2-25)"],
          ["Fuel pump", "BOOST 4–6 psi / HIGH BOOST/PRIME lockout · 5 A, MAIN BUS 2 (POH 7-41)"],
          ["Max imbalance", "10 gal (POH 2-18)"],
          ["Drains", "5: 2 tank, 2 collector, gascolator (POH 7-40, Fig 7-8)"],
          ["Vents", "NACA vent under each wing near tip (POH 7-40)"],
          ["Gauge", "0–46 gal · yellow 0–14 · green 14–46 (POH 2-10, 7-43)"],
          [
            "Fuel flow",
            "0–45 GPH; narrow full-rich green arc above 30.5 inHg, expands down to 10 GPH at ≤30.5 (POH 2-10, 7-43, 7-44; band illustrative)",
          ],
          ["Target flow", "Cyan target at ≤30.5 inHg, removed below 55% power (POH 7-44); not simulated"],
          [
            "Totalizer",
            "Independent of float sensors; red < 9 · yellow 9–14 · green > 14 gal (POH 2-10, 7-44); not simulated",
          ],
          [
            "Pump backup",
            "Electric pump cannot supply sufficient pressure after complete engine-driven pump failure (POH 3-24)",
          ],
          [
            "Source conflicts",
            "AMM 13773-002 Rev 7 28-10 (PDF p. 1088) says 47.5 gal capacity; 28-40 (PDF p. 1138) says 3 A FUEL QTY. POH 2-18 / 7-94 governs: 47.25 gal / 5 A.",
          ],
        ]}
      />
      <H3>Components</H3>
      <PartsList parts={CAT.pinned("fuel")} />
    </>
  );
}
