"use client";
import { bladeAngle, fuelAvail, live, mapInHg } from "../model";
import { CAT } from "../parts";
import { useSR20 } from "../store";
import { engineOperation } from "../operation";
import { ENGINE_GROUPS } from "../engine-groups";
import { useEngineGroups } from "../engine-group-store";
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
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const g = s.eng,
    operation = engineOperation(s, E, live.rpm);
  const { shown, set } = useEngineGroups();
  return (
    <>
      <p className="lead">
        The G6&apos;s normally aspirated Lycoming IO-390-C3B6 has four opposed cylinders, continuous-flow fuel
        injection, and two magnetos firing two plugs per cylinder. One power lever operates separate throttle and
        governor cables; the red mixture lever meters fuel independently (POH 7-33–7-34).
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
          Core cylinders, crankcase, mount and cooling baffles remain visible. These viewing controls do not change
          operation.
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
          id="altAir"
          label="ALT AIR pulled (bypass filter)"
          checked={g.altAir}
          onChange={(v) =>
            up((d) => {
              d.eng.altAir = v;
            })
          }
        />
        <Check
          id="filterBlocked"
          label="Block the normal induction filter"
          checked={g.filterBlocked}
          onChange={(on) =>
            up((d) => {
              d.eng.filterBlocked = on;
            })
          }
        />
        <Readouts
          items={[
            ["Air source", g.altAir ? "WARM · UNFILTERED" : g.filterBlocked ? ["FILTER BLOCKED", "bad"] : "FILTERED"],
            [
              "Engine",
              g.running
                ? "RUNNING"
                : operation.cranking
                  ? ["CRANKING", "warnc"]
                  : g.key === "START"
                    ? ["START — NO STARTER POWER", "bad"]
                    : ["STOPPED", "bad"],
            ],
            ["RPM", rpm10()],
            ["MAP in", mapInHg(s, live.rpm).toFixed(1)],
            [
              "Plugs firing",
              operation.leftMag && operation.rightMag
                ? "Both · 8"
                : operation.leftMag
                  ? "L mag · 4"
                  : operation.rightMag
                    ? "R mag · 4"
                    : "—",
            ],
          ]}
        />
      </Ctl>
      <Small>
        RPM follows the POH governor schedule (2,500 target from idle through cruise, 2,700 at full power); actual idle
        RPM depends on available power. MAP and flow speeds are illustrative. Starting needs BAT 1, selected-tank fuel,
        mixture out of cutoff and an available air source. With the normal filter blocked, pull ALT AIR to admit warm
        unfiltered air manually. Shutdown after blockage is a simplified demonstration, not a timed POH procedure.
      </Small>
      <H3>Ignition wiring</H3>
      <Facts
        rows={[
          ["Right magneto", "Lower-right + upper-left plugs"],
          ["Left magneto", "Lower-left + upper-right plugs"],
          ["OFF", "Both P-leads grounded; no spark"],
          ["R / L", "Selected magneto works; other is grounded"],
          ["START", "Starter + SlickSTART; key returns to BOTH"],
          ["Start control", "2 A STARTER · NON ESS BUS"],
          ["Ignition in flight", "Engine-driven; independent of aircraft buses"],
        ]}
      />
      <Small>
        POH 7-39 says START activates both magnetos; AMM 12137-002 74-00 p. 1 describes the right magneto grounded and a
        left retard-breaker circuit. This study animation follows the POH. The SlickSTART module and starter motor are
        separate components; the 2 A breaker represents the control circuit, not motor current.
      </Small>
      <H3>Oil circulation</H3>
      <Facts
        rows={[
          ["Supply", "7 qt wet sump → suction screen → pumping circuit"],
          ["Cooler / bypass", "Remote cooler; bypass below 170 °F or above 18 psi Δp"],
          ["Distribution", "Full-flow filter → pressure relief → oil galleries"],
          ["Oil consumers", "Rotating parts, piston inner domes, propeller governor"],
          ["Breather", "Firewall separator → oil return + overboard vent"],
          ["Preflight", "6–7 qt; filler / dipstick at right rear"],
        ]}
      />
      <Small>
        POH 7-38; AMM 79-00, 79-20 and 79-30. Oil hoses meet the cooler and filter; internal galleries appear as
        particles without an external hose. Cooler and bypass both animate to explain their routes: oil temperature,
        pressure and valve position are not simulated.
      </Small>
      <H3>Induction, injection and cooling</H3>
      <Notes
        items={[
          "Normal air: right-forward paper filter → induction duct → servo throttle butterfly → plenum → four individual intake tubes. Alternate air enters from the sheltered warm side of the baffling and bypasses the filter (POH 7-35, 7-39; AMM 71-60 p. 1).",
          "Fuel: engine-driven pump → servo → separate fuel-flow transducer → diaphragm flow divider → four injector lines and nozzles. This is continuous-flow injection. The power lever changes airflow; the servo proportions fuel, and the mixture lever adjusts its metering valve (POH 7-34, 7-40; AMM 73-00 and 73-30 p. 1).",
          "At CUTOFF the servo closes the metering valve. Divider pressure falls to zero, its valve closes, and the engine stops (POH 7-34).",
          "Cooling air enters both cowling inlets. Baffles and seals direct it through the fins before it exits aft; there are no movable cowl flaps. Leaking seals can divert air from another cylinder and cause uneven cooling (POH 7-40; AMM 71-00 pp. 1, 19).",
          "Each cylinder has an exhaust header. Right-bank pipes descend alongside the engine; left-bank pipes cross below it to the right collector, muffler and lower-cowl tailpipe. The heat shroud carries separate cabin air outside the exhaust (AMM 78-00 and 78-10 p. 1). POH 7-39 calls the muffler left-side; this installation geometry follows the AMM right-side route.",
        ]}
      />
      <H3>Engine sensing</H3>
      <Facts
        rows={[
          ["CHT / EGT", "4 head sensors + 4 individual exhaust probes"],
          ["RPM", "Magnetic pickup on the right magneto"],
          ["MAP / MAT", "Pressure and temperature in the induction manifold"],
          ["Oil sensors", "Rear case pressure + temperature sensors"],
          ["Fuel flow", "Transducer between servo and divider"],
          ["Indicating power", "3 A ENGINE INSTR · ESS BUS 2 → GEA 71"],
        ]}
      />
      <Small>
        The GEA 71 sends sensor data to the displays (POH 7-35–7-38; AMM 73-30, 77-10, 77-20, 79-30). Sensors and signal
        wiring are shown independently from the self-powered magneto ignition harness. Display temperatures are
        illustrative; the added geometry does not introduce a thermal engine simulation.
      </Small>
      <H3>Limits and mixture</H3>
      <Facts
        rows={[
          ["Rating / TBO", "215 hp @ 2,700 RPM · published 2,200 hr TBO"],
          ["Oil pressure", "55–95 psi normal · 25 psi minimum at idle"],
          ["Oil temperature", "100 °F minimum for takeoff · 235 °F maximum"],
          ["CHT", "240–435 °F green · 435–465 amber · > 465 red"],
          ["Magneto check", "≤ 175 RPM drop each · ≤ 50 RPM difference"],
          ["Power lever", "More than 3 seconds across full range"],
        ]}
      />
      <Notes
        items={[
          "Best power: 100 °F rich of peak EGT. Best economy at 75% power or less: between peak EGT and 50 °F lean of peak, depending on conditions and without misfire. The cyan target fuel-flow caret is advisory; enrich if a CHT exceeds 435 °F (POH 4-20).",
          "The 2,200-hour TBO may qualify for extension under Lycoming SI 1009; use the instructions applicable to the installed engine. Limits above come from POH 2-6, 2-9 and the magneto check from 4-14 (POH 7-33).",
          "Component envelopes, mount braces and hose routing are approximate. Internal passages and flow particles explain system connections; they are not dimensions, actual flow rates or maintenance instructions.",
        ]}
      />
    </>
  );
}

export function Propeller() {
  useTicker(200);
  const s = useSR20((x) => x.s),
    up = useSR20((x) => x.update);
  return (
    <>
      <p className="lead">
        The governor senses RPM with flyweights and senses the power-lever position through its own cable, then meters
        boosted engine oil into the hub to hold RPM. There&apos;s no separate prop lever.
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
        <Readouts
          items={[
            ["Governor target", s.eng.lever >= 0.93 ? "2,700" : "2,500"],
            ["RPM", rpm10()],
            ["Blade angle", bladeAngle(s).toFixed(0) + "°"],
          ]}
        />
      </Ctl>
      <Small>
        Blade angle is illustrative. POH 7-34 commands 2,500 RPM through the cruise range and 2,700 at full power; AMM
        61-00 p. 1 additionally describes approximately 1,900 RPM at lower power. The model follows the POH target
        schedule and lets actual RPM fall when there is insufficient power to govern.
      </Small>
      <H3>How the hub moves</H3>
      <Notes
        items={[
          "Lever forward: governor meters less high-pressure oil to the hub; centrifugal force twists blades to lower pitch for higher RPM.",
          "Lever back: more oil to the hub forces blades to higher pitch and lower RPM.",
          "The hub piston, pitch-change rod and fork move the three blades together. Governor oil pushes high pitch; a spring and centrifugal twisting moment drive low pitch when oil drains (AMM 61-10 p. 1).",
          "Loss of governor oil pressure moves the blades toward their low-pitch stop. The propeller is non-feathering; the spring also brings it to low pitch when stationary (AMM 61-00 and 61-10 p. 1).",
          "In steady flight, any change in airspeed or load is absorbed by a pitch change, not an RPM change.",
        ]}
      />
      <Facts
        rows={[
          ["Standard", "Metal HC-E3YR-1RF/F7392S-1 · 74 in."],
          ["Optional", "Composite 3C1-R919A1/76C03-2 · 74 in."],
          ["Governor", "Upper left forward crankcase; separate control cable"],
          ["Hub", "Hydraulic piston, rod, fork and low-pitch spring"],
          ["RPM schedule", "2,500 idle→cruise · 2,700 full"],
          ["Max RPM", "2,700; POH describes possible temporary overshoot"],
        ]}
      />
      <Small>POH 2-6, 2-8, 7-34, 7-40; AMM 61-10 and 61-20 p. 1. Blade, governor and hub shapes are approximate.</Small>
    </>
  );
}

export function Fuel() {
  useTicker(500);
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const f = s.fuel;
  return (
    <>
      <p className="lead">
        Each wing is a sealed tank that gravity-feeds a collector sump. The engine-driven pump pulls from whichever
        collector the selector points at; the electric boost pump is for priming, vapor suppression and backup.
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
        <Check
          id="boost"
          label="BOOST PUMP on"
          checked={f.boost}
          onChange={(v) =>
            up((d) => {
              d.fuel.boost = v;
            })
          }
        />
        <Slider
          id="qL"
          label="Left tank"
          min={0}
          max={28}
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
          max={28}
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
              ["Full · 56", 28, 28],
              ["Tabs · 26", 13, 13],
              ["Low · 5 / 4", 5, 4],
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
            ["Boost", f.boost ? (E.boostPwr ? "23 psi" : ["NO PWR", "bad"]) : "OFF"],
            ["Engine", s.eng.running ? "RUNNING" : ["STOPPED", "bad"]],
          ]}
        />
      </Ctl>
      <Small>
        Selecting OFF or a dry tank with the engine running stops it after a few seconds — restart from the Engine
        panel.
      </Small>
      <H3>Annunciations</H3>
      <Facts
        rows={[
          ["FUEL LOW LEFT / RIGHT", "Red: that tank < 1 gal"],
          ["FUEL LOW TOTAL", "Amber ≤ 10 gal · red < 7 gal (sensed or totalizer)"],
          ["FUEL IMBALANCE", "L/R difference: white > 5.5 · amber > 7.5 · red > 9.5 gal"],
        ]}
      />
      <Caution title="Caution">
        At ¼ tank or less, prolonged slips or skids can unport the tank outlet. With a tank that low (or one dry), stay
        coordinated — no more than 30 seconds uncoordinated.
      </Caution>
      <H3>Details</H3>
      <Facts
        rows={[
          ["Capacity", "29.3 gal per tank · 28 usable"],
          ["Total usable", "56 gal"],
          ["Filled to tabs", "13 gal/side · 26 total"],
          ["Boost pump", "23 psi · 5 A, MAIN BUS 2"],
          ["Training deck", "Lists 26.5 gal usable/side — this G6 POH says 28"],
          ["Drains", "5: 2 tank, 2 collector, gascolator"],
          ["Vents", "NACA vent under each wing near tip"],
          ["Gauge", "0–28 gal · yellow 0–10 · green 10–28"],
          ["Totalizer", "Independent of float sensors"],
        ]}
      />
      <H3>Components</H3>
      <PartsList parts={CAT.pinned("fuel")} />
      <H3>Storage and injection paths</H3>
      <Notes
        items={[
          "Two strainers in each wing feed through a flapper into its collector. Tank ribs limit slosh; each tank has its own vent path. The drawing separates gravity collection from the selected pressure-feed path (AMM 28-10).",
          "Selector → electric boost pump → gascolator → engine-driven pump → servo → flow transducer → divider → four continuous-flow nozzles. The boost pump and gascolator are forward of the firewall; drawn bend paths are schematic (POH 7-40–43; AMM 28-20).",
          "Two float sensors per tank feed sensed quantity. The totalizer independently subtracts measured flow from the fuel entered by the pilot; it cannot detect an incorrect initial fuel entry or replace quantity checks. This model varies sensed quantity and does not simulate a separate totalizer (POH 7-44–45; AMM 28-40).",
          "POH 7-95 specifies a 5 A FUEL QTY circuit; POH 7-44 marks the quantity gauge yellow to 10 gal. AMM 28-40 describes 3 A and 8.2 gal; the study indications follow the POH.",
          "Return-port labels retained in Figure 7-8 do not establish the older Continental return circuit for this Lycoming installation. Only the documented supply and drain paths are drawn.",
        ]}
      />
    </>
  );
}
