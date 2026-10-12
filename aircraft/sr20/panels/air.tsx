"use client";
import { useSR20 } from "../store";
import { cabinOperation } from "../environment";
import { Caution, Check, Ctl, Facts, H3, Notes, Readouts, Seg, Slider, Small } from "@/components/ui/controls";

export function Environment() {
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const env = s.env,
    cabin = cabinOperation(s, E);
  return (
    <>
      <p className="lead">
        A lower RH cowl NACA inlet supplies ventilation air, while a separate heater duct passes air around the exhaust
        muffler. Hot and fresh inlet valves blend the supplies in a firewall mixing chamber. Its airflow flapper admits
        the blend through the cabin air coupler to a separate distribution manifold and eleven cabin outlets.
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
          label="A/C on (optional, needs fan 1–3)"
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
            ["Blower", cabin.blower ? "Running" : env.fan > 0 ? ["NO PWR", "bad"] : "Off"],
            ["A/C", cabin.ac ? "Cooling" : env.ac ? [s.eng.running ? "NO PWR" : "ENGINE STOPPED", "warnc"] : "Off"],
            ["Recirculation", cabin.recirc ? "Active" : "Off"],
            ["Hot-air valve", cabin.hotValve === 0 ? "Closed" : Math.round(cabin.hotValve * 100) + "%"],
            ["Fresh-air valve", cabin.freshValve === 0 ? "Closed" : Math.round(cabin.freshValve * 100) + "%"],
            [
              "Outlets",
              { P: "Panel", PF: "Panel · floor", PFW: "Panel · floor · wind", W: "Panel · windshield" }[env.vent],
            ],
          ]}
        />
      </Ctl>
      <Caution title="Smoke & fumes">If the source is forward of the firewall, turn the airflow selector OFF.</Caution>
      <H3>Valves, ducts and outlets</H3>
      <Notes
        items={[
          "OFF closes the mixing-chamber airflow flapper; 0 opens the ram-air path without the fan. 1–3 add low, medium and high blower speed (POH 7-66). The hot/fresh inlet blend and the manifold floor/defrost butterflies are separate mechanisms.",
          "Four crew eyeball outlets sit outboard of the displays and inboard on the bolster panels; two passenger eyeball outlets sit chest high in the rear side trim. These branches are fed directly and each occupant can shut the nozzle. Two adjustable crew kick-plate outlets, two fixed passenger foot-warmers and one windshield diffuser complete the eleven outlets (POH 7-65–66; AMM 21-20).",
          "Panel closes both manifold butterflies. Panel-Foot opens the floor branch; Panel-Foot-Windshield opens floor and defrost; Windshield closes the floor branch for maximum defog (POH 7-66–67). Panel branches have no selector butterfly.",
          "The ECS display panel and bracket-mounted controller are separate from the cabin air coupler actuator and manifold dual actuator. A mechanical linkage passes through the firewall to the mixing-chamber lever (AMM 21-60 pp. 4–12).",
          "Hot or fresh air rejected by its inlet valve discharges into the engine compartment and leaves with engine cooling air (POH 7-65). The heater exchanges heat across the exhaust-muffler wall; exhaust gas is not the cabin-air supply.",
        ]}
      />
      <H3>Optional vapor-cycle air conditioning</H3>
      <Facts
        rows={[
          ["Refrigerant path", "Compressor → condenser → receiver-drier → expansion valve → evaporator → compressor"],
          ["Compressor", "Engine driven at the flywheel belt; electrical clutch"],
          ["Condenser", "Under baggage floor; separate outside-air blower and belly screens"],
          ["Evaporator", "Under RH crew seat; blower wheel/motor alongside"],
          ["Moisture", "Condensate drain overboard through belly"],
        ]}
      />
      <Notes
        items={[
          "The compressor pressurizes R134A vapor. The condenser rejects heat and changes it into liquid; the receiver-drier filters it and removes moisture. The expansion valve meters liquid into the evaporator, where vaporization absorbs heat from cabin air (POH 7-66; AMM 21-50 p. 1).",
          "The engine must run for refrigeration. A/C closes the hot-air supply; recirculation returns cabin air through the evaporator for maximum cooling. Neither mode is available at fan 0, and recirculation requires A/C (POH 7-62, 7-67).",
          "This study configuration includes the optional blower and A/C hardware; their installation on the photographed reference airplane is unconfirmed. Component sizes, belt geometry, refrigerant hose routes and underfloor locations are schematic. Refrigerant pressures, humidity and charge are not simulated.",
        ]}
      />
      <Facts
        rows={[
          ["Control panel", "2 A CABIN AIR CONTROL, MAIN BUS 1"],
          ["Blower (opt)", "15 A CABIN FAN, A/C BUS 2"],
          ["A/C condenser", "15 A A/C COND, A/C BUS 1"],
          ["A/C compressor", "5 A A/C COMPR, A/C BUS 2"],
        ]}
      />
      <Small>
        Sources: SR20 POH 11934-005, 7-62–68 (Revision A1), and SR20 AMM 12137-002 Reissue A/Revision A1, chapters
        21-00, 21-20, 21-40, 21-50 and 21-60. The AMM identifies the heater-air supply as the upper RH cowl inlet; POH
        7-65 calls it the NACA inlet. The model follows the AMM routing. POH 7-67 describes fresh-air closure and
        selectable recirculation at full cool, while AMM 21-60 describes automatic recirculation and a different
        inlet/flapper rigging check; the controls here follow the POH operating description.
      </Small>
      <Small>
        Airflow and valve-opening fractions are illustrative. Ram air is assumed while the engine runs. Loss of power
        removes blower/refrigeration, while valve selections remain represented; powered valve travel, automatic
        temperature thresholds and pressure losses are not modeled.
      </Small>
    </>
  );
}

export function Pitot() {
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E),
    up = useSR20((x) => x.update);
  const stalled = s.stall.aoa >= 14;
  return (
    <>
      <p className="lead">
        One heated pitot under the left wing and two fuselage static ports feed the air-data computers and standby. A
        separate electro-pneumatic stall warning system (an inlet in the right wing leading edge and a pressure switch,
        powered through the 2 A STALL WARNING breaker on ESS BUS 2) sounds the horn about 5 knots before the stall.
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
          label="Inlet iced / contaminated (fault)"
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
          ["PITOT HEAT FAIL", "Switch on, heater drawing no current"],
          ["PITOT HEAT REQD", "OAT < 41 °F (5 °C) with switch off"],
          ["STALL (red)", "Horn + autopilot disconnect"],
          ["STALL WARN FAIL", "Fault detected; horn muted until clear"],
        ]}
      />
      <H3>Details</H3>
      <Facts
        rows={[
          ["Pitot heat", "7.5 A, NON ESS BUS"],
          ["Stall warning", "2 A, ESS BUS 2"],
          ["Horn margin", "~5 kt above stall, full flaps, idle, wings level"],
          ["OAT probes", "RH wing; second probe with optional ADAHRS 2 (AMM 34-10)"],
          ["Water traps", "Pitot, static floor and static console; drains per AMM 34-10"],
        ]}
      />
      <Small>
        Section 7 puts the stall-warning inlet on the <b>right</b> wing leading edge (modeled here). The Costanzo
        training deck photographs it on the left wing — check the airplane you fly.
      </Small>
      <Caution title="Alternate static">
        Cabin pressure varies with heater and vents. Apply the Section 5 airspeed and altitude corrections. The standby
        altimeter has no automatic position-error correction, so it will differ from the PFD.
      </Caution>
      <H3>Pressure and signal paths</H3>
      <Notes
        items={[
          "The heated mast near the left wingtip feeds the pitot water trap, then separate pressure branches to each fitted GSU 75 and the MD302. The mast heater and current-sensing circuit are separate from the pressure line (POH 7-69–72; AMM 34-10).",
          "Both static buttons feed sumps and a crossover tee. The alternate-source valve substitutes cabin pressure before the static branches reach the instruments. Selecting it changes the highlighted source path; calibrated pressure/airspeed errors are not computed.",
          "Pressure paths remain physically connected when avionics power is lost. Animated particles illustrate connectivity; they do not represent a constant flow of air through the instruments.",
          "A separate right-wing pneumatic inlet leads through a trap to the stall pressure switch. The electrical signal reaches the warning circuit and avionics; blockage and loss of STALL WARNING power suppress the modeled horn. The angle-of-attack slider is illustrative, not a certified trigger angle.",
        ]}
      />
    </>
  );
}
