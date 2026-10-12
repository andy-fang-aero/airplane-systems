"use client";
import { useView } from "@/lib/view";
import { live } from "../model";
import { resetCaps, startCaps, useSR20 } from "../store";
import { CAPS_CAM, SYS } from "../systems";
import { BtnRow, Caution, Ctl, Facts, H3, Notes, Slider, Small, useTicker } from "@/components/ui/controls";

export function Caps() {
  useTicker(100);
  const { update } = useSR20.getState(),
    { flyTo } = useView.getState();
  const capsOn = useSR20((x) => x.s.capsOn);
  return (
    <>
      <p className="lead">
        A solid-propellant rocket pulls a 2,400 ft² round canopy out of a canister behind the baggage bulkhead. A slider
        slows inflation, and a snubbed rear riser keeps the nose from pitching up too far until it&apos;s cut at 8
        seconds.
      </p>
      <H3>Deployment sequence</H3>
      <Ctl>
        <BtnRow>
          <button type="button" className="btn primary" onClick={startCaps}>
            Pull the handle
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!capsOn) {
                startCaps();
                return;
              }
              live.capsPlaying = !live.capsPlaying;
            }}
          >
            Pause / play
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetCaps();
              const [p, t] = SYS.find((d) => d.id === "caps")!.cam;
              flyTo(p, t);
            }}
          >
            Reset
          </button>
        </BtnRow>
        <Slider
          id="capsT"
          label="Timeline"
          min={0}
          max={16}
          step={0.05}
          value={Math.max(0, live.capsT)}
          onChange={(v) => {
            if (!capsOn) {
              update((d) => {
                d.capsOn = true;
              });
              flyTo(...CAPS_CAM);
            }
            live.capsT = v;
            live.capsPlaying = false;
          }}
          fmt={(v) => "T+" + v.toFixed(1) + " s"}
        />
      </Ctl>
      <H3>Timeline</H3>
      <Facts
        rows={[
          ["T+0", "Handle pulled; slack taken up and igniter activated"],
          ["≈ T+2 s", "Canopy begins to inflate (slider limits rate)"],
          ["Deceleration", "< 3 g within the envelope; slight nose-up"],
          ["Until T+8 s", "Hangs nose-low on the short rear riser"],
          ["T+8 s", "Snub line cut; tail drops to ~level"],
          ["Descent", "< 1,700 fpm + surface wind drift"],
          ["Impact", "≈ a 10 ft drop"],
        ]}
      />
      <H3>Activation</H3>
      <Notes
        items={[
          "Remove the cover by its black forward tab. Pull the T-handle to take out ~2 in. of slack.",
          "Then two hands, a steady chin-up pull straight down — up to 45 lb or more. Jerking raises the force needed.",
          "A maintenance safety pin with a streamer can lock the handle; verify it's removed before flight.",
        ]}
      />
      <Facts
        rows={[
          ["Max demonstrated", "133 KIAS (VPD)"],
          ["Harness", "3-point: 2 forward at firewall; 1 aft at baggage bulkhead"],
          ["ELT", "Auto-activates on deployment"],
        ]}
      />
      <Notes
        items={[
          "The forward straps run just under the fuselage skin and pull through its covering on deployment; the aft strap is stowed in the canister (POH 7-98).",
          "Harness paths, fitting heights and riser lengths are illustrative. The aft snub release is shown by the change in attitude.",
        ]}
      />
      <H3>Mechanical path and stowed hardware</H3>
      <Notes
        items={[
          "The T-handle sits horizontally in its overhead receptacle beneath a placarded hook-and-loop cover. A mechanical cable runs aft to the electronic igniter: slack take-up, then steady pull to arm and release the switch plunger (POH 7-98). Aircraft bus power is not represented as an activation prerequisite.",
          "Inside the canister, the extraction rocket pulls a deployment bag that stages line extension before canopy opening. The annular slider rides down suspension lines through its perimeter grommets to limit inflation (POH 7-97).",
          "The two forward straps attach at the firewall; the aft strap attaches at the aft baggage-compartment bulkhead. Its snub line limits opening pitch before the eight-second cut permits the tail to drop (POH 7-98–99). Fittings and line-cutter locations are functional schematics.",
          "The Artex ELT 1000 automatically activates on CAPS deployment and uses its own battery. Its remote indicator and shelf-mounted buzzer announce transmission (POH 7-92–94; AMM 25-60 p. 1).",
        ]}
      />
      <Facts
        rows={[
          ["Rocket motor", "10-year replacement/recharge interval"],
          ["Parachute", "10-year replacement/repack interval"],
          ["Reefing line cutters", "6-year replacement interval"],
        ]}
      />
      <Small>
        SR20 AMM 12137-002, 4-00 pp. 2–3 (19 Dec 2019): intervals run from component manufacture or the recorded
        expiration date. Applicable records and the current maintenance documents govern each airplane.
      </Small>
      <Small>
        Sources: POH 11934-005, 7-97–99 (Revision A1), with AMM airworthiness limitations and ELT description. The
        publicly available SR20 AMM copy omits Chapter 95; igniter internals, line-cutter count and detailed maintenance
        routing are not inferred from the SR22T. Shapes, strap/cable routes and intermediate animation timings are
        illustrative; approximately two-second inflation and the eight-second snub release follow the POH.
      </Small>
      <Caution title="Warning">
        The rocket can fire at any time and exits upward through the cover. Stay clear of the canister area when the
        airplane is occupied; don&apos;t leave children aboard unattended.
      </Caution>
    </>
  );
}
