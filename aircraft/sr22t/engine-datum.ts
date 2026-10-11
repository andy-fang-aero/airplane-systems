/**
 * TSIO-550-K registration between the Continental installation drawing and the scene, side-effect free so the turbo,
 * exhaust and engine sections share it without a registration cycle.
 * Source: Continental M-18 (TSIO-550 Permold Series Engine Maintenance and Overhaul Manual, 21 Sep 2017), installation
 * drawing 657645: Fig 5-33 sheet 1 p. 5-53 (PDF p. 148), Fig 5-34 sheet 2 p. 5-54 (PDF p. 149), Fig 5-35 sheet 3
 * p. 5-55 (PDF p. 150). https://www.csobeech.com/files/TCM-TSIO550-Maint-Ohaul-Manual.pdf
 */
/** Inches to scene metres. */
export const IN = 0.0254;
/** Crankshaft centre line height: the propeller axis (engine.ts `PROP`) and every cylinder origin. */
export const CRANK_Y = -0.14;
/**
 * Fig 5-34 sheet 2 (PDF p. 149): each bank's pitch is 7.31 in.; the accessory-face offsets are 5.42 in. for #1 and
 * 7.89 in. for #2, so the LEFT bank is forward by 2.47 in., not half a pitch. AMM 13773-002 Rev 7 Fig 74-20-2
 * (PDF p. 2625) confirms right 5-3-1 / left 6-4-2, with #1 rearmost.
 */
export const CYL_PITCH = 7.31 * IN;
export const CYL_STAGGER = (7.89 - 5.42) * IN;
/** The engine's scene station is illustrative; retain the old six-cylinder mean x. */
export const CYL_CENTER_X = 3.11;
/** Cylinder #1, the right bank's rearmost. */
export const CYL_RIGHT_REAR_X = CYL_CENTER_X - CYL_PITCH - CYL_STAGGER / 2;
/** Accessory mounting face: #1 is 5.42 in. forward of it (Fig 5-34, dimensioned). Every turbo station hangs from it. */
export const ACCESSORY_FACE_X = CYL_RIGHT_REAR_X - 5.42 * IN;
/** Rear cylinder station of each bank: #1 right, #2 left (left bank forward by the stagger). */
export const REAR_CYL_X = (s: number) => CYL_RIGHT_REAR_X + (s < 0 ? CYL_STAGGER : 0);
