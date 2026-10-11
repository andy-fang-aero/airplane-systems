"use client";
import { LIFT_HEAT_REF, LIFT_HEAT_GROUND_LIMIT, liftHeatDuty, live } from "../model";
import { useSR22T } from "../store";
import { airflowValveOpen, freshValveOpen, hotValveOpen, valveEnv } from "../parts";
import {
  useTicker,
  Caution,
  Check,
  Ctl,
  Facts,
  H3,
  Notes,
  Readouts,
  Seg,
  Slider,
  Small,
} from "@/components/ui/controls";

export function Environment() {
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
  const env = s.env,
    held = valveEnv(s, E);
  return (
    <>
      <p className="lead">
        Fresh air from a NACA inlet on the RH cowl goes to the fresh-air valve. Heat comes from ram air leaving the
        intercoolers' rear ports, heated in an exchanger around the exhaust crossover tube, then the hot-air valve. The
        temperature knob blends the two in the mixing chamber on the firewall (POH 7-64).
      </p>
      <H3>Climate panel</H3>
      <Ctl>
        <Seg
          id="fan"
          label="Airflow / fan knob"
          options={[
            [-1, "OFF"],
            [0, "0"],
            [1, "1"],
            [2, "2"],
            [3, "3"],
          ]}
          value={env.fan}
          onChange={(v) =>
            up((d) => {
              d.env.fan = v;
              if (v < 1) {
                d.env.ac = false;
                d.env.recirc = false;
              }
            })
          }
        />
        <Slider
          id="temp"
          label="Temperature (cool → hot)"
          min={0}
          max={1}
          step={0.01}
          value={env.temp}
          onChange={(v) =>
            up((d) => {
              d.env.temp = v;
            })
          }
          fmt={(v) => (v < 0.15 ? "Full cool" : v > 0.85 ? "Full hot" : "Blend " + Math.round(v * 100) + "% hot")}
        />
        <Seg
          id="vent"
          label="Vents"
          options={[
            ["P", "Panel"],
            ["PF", "Panel+Foot"],
            ["PFW", "P+F+Wind"],
            ["W", "Windshield"],
          ]}
          value={env.vent}
          onChange={(v) =>
            up((d) => {
              d.env.vent = v;
            })
          }
        />
        <Check
          id="ac"
          label="A/C on (needs fan 1–3)"
          checked={env.ac}
          onChange={(v) =>
            up((d) => {
              d.env.ac = v && d.env.fan >= 1;
              if (!d.env.ac) d.env.recirc = false;
            })
          }
        />
        <Check
          id="recirc"
          label="Recirculate (A/C only)"
          checked={env.recirc}
          onChange={(v) =>
            up((d) => {
              d.env.recirc = v && d.env.ac;
            })
          }
        />
        <Readouts
          items={[
            ["Airflow valve", airflowValveOpen(held) ? "Open" : "Closed"],
            ["Hot-air valve", hotValveOpen(held) === 0 ? "Closed" : Math.round(hotValveOpen(held) * 100) + "%"],
            ["Fresh-air valve", freshValveOpen(held) === 0 ? "Closed" : Math.round(freshValveOpen(held) * 100) + "%"],
            [
              "Outlets",
              { P: "Panel", PF: "Panel · floor", PFW: "Panel · floor · wind", W: "Panel · windshield" }[held.vent],
            ],
          ]}
        />
      </Ctl>
      <Caution title="Recirculation">Use of RECIRC mode prohibited in flight (POH 2-24, 4-14).</Caution>
      <Caution title="Smoke & fumes">If the source is forward of the firewall, turn the airflow selector OFF.</Caution>
      <H3>How air is routed</H3>
      <Notes
        items={[
          "Panel and armrest eyeball outlets are always fed; each occupant twists the nozzle to shut it off.",
          "Floor butterfly opens for Panel-Foot; the windshield butterfly adds defrost for Panel-Foot-Windshield; Windshield alone closes the floor valve for maximum defog.",
          "Over-temperature protection: the hot-air source may exceed 300 °F. A controller reads a sensor downstream of the mixing chamber and, above the duct temperature limit, reduces hot air and increases fresh air, cycling the valves automatically (POH 7-64).",
          "A/C: R134a, engine-driven compressor, evaporator under the front passenger seat, condenser under the baggage compartment floor (POH 7-61, 7-64, 7-65; AMM 21-50). Engine must be running; the snowflake closes the hot-air valve. With the A/C selected all cabin air passes through the evaporator, which carries the blower (POH 7-64; AMM 21-50, Fig 21-50-1 sheet 3).",
          "A/C and recirculation are unavailable with the fan at 0; recirculation needs the A/C running.",
          "Airflow OFF closes only the mixing-chamber valve; the inlet valves follow temperature selection (POH 13772-007 7-62–7-66; AMM 13773-002 Rev 7 21-60, PDF pp. 524–525; 7waz ruling N1).",
          "The control panel airflow knob reads OFF – 0 – 1 – 2 – 3 (POH 7-62, Fig 7-13): OFF shuts cabin airflow, 0 is ram air only (POH 7-66; AMM 21-60), 1–3 add blower speed.",
        ]}
      />
      <Facts
        rows={[
          ["Control panel", "2 A CABIN AIR CONTROL, MAIN BUS 1"],
          ["Blower (opt)", "15 A CABIN FAN, A/C BUS 2"],
          ["A/C condenser", "15 A A/C COND, A/C BUS 1"],
          ["A/C compressor", "5 A A/C COMPR, A/C BUS 2"],
          [
            "A/C costs",
            "BHP reduced by approximately 6 BHP (POH 5-3); with A/C ON for takeoff add 100 ft ground roll and 150 ft over a 50 ft obstacle (5-19); max rate of climb reduced by approximately 50 fpm (5-23, 5-25); cruise reduced by 2 knots (5-32); range decreased by 1% (5-35)",
          ],
        ]}
      />
    </>
  );
}

export function Pitot() {
  useTicker(200);
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E),
    up = useSR22T((x) => x.update);
  const stalled = s.stall.aoa >= 14;
  return (
    <>
      <p className="lead">
        One heated pitot under the left wing and two fuselage static ports feed the air-data computers and standby.{" "}
        {s.equip.fiki
          ? "With FIKI ice protection, a separate stall warning system (a heated lift transducer on the right wing leading edge and a stall warning computer under cabin access panel CF3R, AMM 27-31 ¶B, PDF 1032) replaces the pneumatic inlet and signals the avionics aural warning and STALL."
          : "A separate electro-pneumatic stall warning system (an inlet in the right wing leading edge, a pressure switch on the mid-console LH side panel, and the avionics aural warning, powered through the 2 A STALL WARNING breaker on ESS BUS 2) sounds the horn about 5 knots before the stall with full flaps, power off and wings level (POH 7-68; AMM 27-31 ¶A, PDF 1032)."}
      </p>
      <H3>Pitot heat</H3>
      <Ctl>
        <Check
          id="pheat"
          label="PITOT HEAT switch on"
          checked={s.pitot.heat}
          onChange={(v) =>
            up((d) => {
              d.pitot.heat = v;
            })
          }
        />
        <Slider
          id="oat"
          label="Outside air temperature"
          min={-20}
          max={30}
          step={1}
          value={s.pitot.oat}
          onChange={(v) =>
            up((d) => {
              d.pitot.oat = v;
            })
          }
          fmt={(v) => `${v} °C / ${Math.round((v * 9) / 5 + 32)} °F`}
        />
        <Check
          id="hfail"
          label="Heater element open (no current)"
          checked={s.pitot.heaterFail}
          onChange={(v) =>
            up((d) => {
              d.pitot.heaterFail = v;
            })
          }
        />
        <Check
          id="altstat"
          label="Alternate static source selected"
          checked={s.pitot.alt}
          onChange={(v) =>
            up((d) => {
              d.pitot.alt = v;
            })
          }
        />
      </Ctl>
      {s.equip.fiki && (
        <>
          <H3>Lift transducer heat</H3>
          <Ctl>
            <Check
              id="liftground"
              label="On ground (study input)"
              checked={s.stall.onGround}
              onChange={(v) =>
                up((d) => {
                  d.stall.onGround = v;
                })
              }
            />
            <Check
              id="liftfail"
              label="Lift transducer heater failed"
              checked={s.stall.heaterFail}
              onChange={(v) =>
                up((d) => {
                  d.stall.heaterFail = v;
                })
              }
            />
            <Readouts
              items={[
                ["Lift heat", `${Math.round(liftHeatDuty(s, E) * 100)}%`],
                ["Ground heat", `${live.liftHeatGroundSec.toFixed(1)} / ${LIFT_HEAT_GROUND_LIMIT} s`],
              ]}
            />
          </Ctl>
          <Small>
            Two mounting-plate heaters, one vane heater and one case heater (AMM 13773-002 Rev 7, 27-31 ¶B(3)(d), PDF p.
            1039) follow the PITOT HEAT switch (¶B(2)(f), PDF p. 1038). STALL VANE HEAT supplies them from NON ESS BUS
            (POH 13772-007 Fig 7-11, 7-52; AMM 27-31 ¶B(2)(e), PDF p. 1038). Power is 25% on the ground and 100%
            airborne (p. 45; {LIFT_HEAT_REF}). The basic POH leaves the STALL VANE HEAT rating unpublished (Fig 7-11,
            7-52); the reference's 10 A (p. 45; {LIFT_HEAT_REF}) does not replace it.
          </Small>
          <Small>
            The study model requires both STALL VANE HEAT and PITOT HEAT breaker power. The PITOT HEAT control
            dependency is inferred from the heater-failure procedure, which cycles both breakers (p. 15;
            {LIFT_HEAT_REF}); the circuit topology is not established here.
          </Small>
          <Caution
            title={live.liftHeatGroundSec > LIFT_HEAT_GROUND_LIMIT ? "Ground heat limit exceeded" : "Ground heat limit"}
          >
            Limit ground operation to 45 seconds (p. 6; {LIFT_HEAT_REF}). This is a pilot limit; the model does not
            automatically switch heat off or infer a thermal warning at 45 seconds.
          </Caution>
          <Small>
            Heated Lift Transducer Malfunction: ice on the vane may cause premature warning. Cycle STALL VANE HEAT and
            the PITOT HEAT switch; if ice remains, expect no reliable stall indication (p. 11; {LIFT_HEAT_REF}). Heater
            failure is simulated separately from the stall warning computer fault.
          </Small>
        </>
      )}
      <H3>Stall warning</H3>
      <Ctl>
        <Slider
          id="aoa"
          label="Angle of attack (illustrative)"
          min={0}
          max={18}
          step={0.1}
          value={s.stall.aoa}
          onChange={(v) =>
            up((d) => {
              d.stall.aoa = v;
            })
          }
          fmt={(v) => v.toFixed(1) + "°"}
        />
        <Check
          id="sfault"
          label={s.equip.fiki ? "Stall warning system fault" : "Inlet iced / contaminated (fault)"}
          checked={s.stall.fault}
          onChange={(v) =>
            up((d) => {
              d.stall.fault = v;
            })
          }
        />
        <Readouts
          items={[
            ["Horn", s.stall.fault ? ["MUTED", "warnc"] : stalled && E.stallPwr ? ["SOUNDING", "bad"] : "Quiet"],
            ["Autopilot", stalled && !s.stall.fault && E.stallPwr ? ["DISCONNECT", "bad"] : "—"],
            ["Static source", s.pitot.alt ? ["CABIN", "warnc"] : "Ports"],
          ]}
        />
      </Ctl>
      <H3>Annunciations</H3>
      <Facts
        rows={[
          ["PITOT HEAT FAIL", "Switch on, heater drawing no current (POH 7-69, 3A-20)"],
          ["PITOT HEAT REQD", "OAT < 41 °F (5 °C) with switch off, after 15 s (POH 3A-20)"],
          ["STALL (red)", "Horn + autopilot disconnect if engaged (POH 7-68)"],
          ["STALL WARN FAIL", "Fault detected; horn muted until clear (POH 7-68)"],
          ...(s.equip.fiki
            ? [
                [
                  "ANTI ICE HTR",
                  `Stall warning/AoA heater has failed. Switch on with failed heater or lost STALL VANE HEAT feed / inferred PITOT HEAT control power; simplified detection (p. 15; ${LIFT_HEAT_REF})`,
                ] as [string, string],
              ]
            : []),
        ]}
      />
      <H3>Details</H3>
      <Facts
        rows={[
          ["Pitot heat", "7.5 A, NON ESS BUS (POH 7-68)"],
          ["Stall warning", "2 A, ESS BUS 2 (POH 7-68)"],
          ...(s.equip.fiki
            ? ([["STALL VANE HEAT", "NON ESS BUS; rating unpublished (POH Fig 7-11, 7-52)"]] as [string, string][])
            : []),
          ["Horn margin", "~5 kt above stall, full flaps, power off, wings level (POH 7-68)"],
          ["OAT 1", "RH wing, RW12 → ADAHRS 1 (AMM 34-10 PDF pp. 1629, 1665; Fig 34-10-6 PDF p. 1666)"],
          [
            "OAT 2",
            "RH wing beside OAT 1 → ADAHRS 2; operator observation of the modelled airplane, plus AMM Fig 34-10-6 (PDF p. 1666); side-by-side spacing approximate",
          ],
          ["Water traps", "At each line low point; drain at annual (POH 7-68)"],
        ]}
      />
      <Small>
        PITOT HEAT REQD appears immediately in this study model; the airplane delays it 15 seconds (POH 3A-20). The AoA
        control uses an illustrative 14° trigger, not a POH stall angle. STALL WARN FAIL is shown as a caution; POH 7-68
        calls it an alert without specifying a level.
      </Small>
      <Small>
        Stall warning hardware follows the FIKI option: without ice protection, the electro-pneumatic inlet, line and
        pressure switch (POH 7-68; AMM 27-31 ¶A, PDF 1032); with it, the lift transducer, its wiring and the stall
        warning computer under CF3R (AMM 27-31 ¶B, PDF 1032, 1038–1039; Fig. 27-31-2, PDF 1044). STALL, STALL WARN FAIL,
        the horn margin and the 2 A STALL WARNING breaker cite the basic POH 13772-007 7-68 in both configurations. AMM
        13773-002 Rev 7, 27-31 ¶B (PDF 1032) specifies a 5 A STALL WRN / STCK SHKR (or STALL WARNING) circuit breaker on
        Essential Bus 2 with ice protection; the POH governs. The breaker discrepancy remains unresolved until the
        airplane’s actual supplement is identified in its POH Section 9 Log of Supplements. Heater behavior absent from
        the POH/AMM uses {LIFT_HEAT_REF}.
      </Small>
      <Notes
        items={[
          s.equip.fiki
            ? "FIKI stall warning check: the AMM ground operational check gently raises the lift-transducer tab with a wooden tongue depressor to verify the audible horn; the heated vane and plate must not be touched (AMM 13773-002 Rev 7, 27-31 2.C(4), pp. 10–11, PDF 1041–1042). Use the installed supplement for preflight procedures. The basic POH 13772-007 4-5 inlet suction test applies to the pneumatic system."
            : "Preflight: test the stall warning by suction on the inlet (POH 4-5).",
          "Cold weather: pitot probe warms within 30 s of PITOT HEAT ON (POH 4-4); verify it is hot (POH 4-5).",
          "Pitot heat ON at 41 °F (5 °C) or less, IMC or visible moisture (POH 4-15).",
        ]}
      />
      <Caution title="Alternate static">
        Cabin pressure varies with heater and vents. Apply the Section 5 airspeed and altitude corrections. The standby
        altimeter has no automatic position-error correction, so it will differ from the PFD (POH 7-21, 7-69; 3A-19).
      </Caution>
    </>
  );
}
