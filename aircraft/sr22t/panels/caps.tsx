"use client";
import { useView } from "@/lib/view";
import { live } from "../model";
import { resetCaps, startCaps, useSR22T } from "../store";
import { CAPS_CAM, SYS } from "../systems";
import { BtnRow, Caution, Ctl, Facts, H3, Notes, Slider, useTicker } from "@/components/ui/controls";

export function Caps() {
  useTicker(100);
  const { update } = useSR22T.getState(),
    { flyTo } = useView.getState();
  const capsOn = useSR22T((x) => x.s.capsOn);
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
          ["T+0", "Handle pulled; rocket fires up and aft"],
          ["≈ T+2 s", "Canopy begins to inflate (slider limits rate)"],
          ["Deceleration", "< 3 g within the envelope; slight nose-up"],
          ["Until T+8 s", "Hangs nose-low on the short rear riser"],
          ["T+8 s", "Snub line cut; tail drops to ~level"],
          ["Descent", "< 1,700 fpm + surface wind drift"],
          ["Impact", "≈ a 13 ft drop"],
        ]}
      />
      <H3>Activation</H3>
      <Notes
        items={[
          "Remove the cover by its black forward tab. Pull the T-handle to take out ~2 in. of slack.",
          "Then two hands, a steady chin-up pull straight down — up to 45 lb or more. Jerking raises the force needed.",
          "A maintenance safety pin with a streamer can lock the handle; verify it's removed before flight.",
          "At altitude the same indicated airspeed is a higher true airspeed, and inflation loads rise with it: slow to the minimum possible airspeed before deploying (POH 3-51).",
          "Level-flight deployments have lost less than 400 ft; if circumstances permit, activate at or above 2,000 ft AGL (POH 10-7).",
        ]}
      />
      <Facts
        rows={[
          ["Max demonstrated", "140 KIAS (VPD)"],
          ["Harness", "3-point: 2 forward at firewall; 1 aft at baggage bulkhead"],
          ["ELT", "Auto-activates on deployment"],
        ]}
      />
      <Notes
        items={[
          "Forward straps lie immediately under the fuselage skin and tear through their covering during deployment; the aft strap is stowed in the canister (POH 7-96).",
          "Harness paths, fitting heights and riser lengths are illustrative. The aft snub release is represented by the attitude animation.",
        ]}
      />
      <Caution title="Warning">
        The rocket can fire at any time and exits upward through the cover. Stay clear of the canister area when the
        airplane is occupied; don&apos;t leave children aboard unattended.
      </Caution>
    </>
  );
}
