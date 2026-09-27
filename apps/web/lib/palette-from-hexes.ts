/**
 * Rebuild a `Palette` from bare hex codes.
 *
 * Share links carry colours but not the image they came from, so coverage is
 * genuinely unknown. Rather than invent plausible-looking percentages, every
 * swatch gets an equal share and the metadata records that nothing was sampled.
 * The UI can then be honest about which numbers are measured and which are not.
 */

import {
  assignRoles,
  bestTextColor,
  fromHex,
  nameSwatches,
  relativeLuminance,
  rgbToHsl,
  rgbToOklch,
  type Palette,
  type Role,
  type Swatch,
} from "palette-forge";

/**
 * `weights`, when known (e.g. how often a site's CSS uses each colour), become
 * real shares so role inference can favour the colours that dominate.
 */
export function paletteFromHexes(hexes: string[], weights?: number[]): Palette {
  const total = weights?.reduce((sum, w) => sum + w, 0) ?? 0;
  const candidates = hexes.map((hex, i) => {
    const rgb = fromHex(hex);
    const share = weights && total > 0 ? weights[i]! / total : 1 / hexes.length;
    return { rgb, oklch: rgbToOklch(rgb), share };
  });

  const roles = assignRoles(candidates);
  const names = nameSwatches(roles);

  const swatches: Swatch[] = candidates.map((candidate, i) => ({
    hex: hexes[i]!.toLowerCase(),
    rgb: [
      Math.round(candidate.rgb[0]),
      Math.round(candidate.rgb[1]),
      Math.round(candidate.rgb[2]),
    ] as Swatch["rgb"],
    hsl: rgbToHsl(candidate.rgb),
    oklch: candidate.oklch,
    share: candidate.share,
    role: roles[i]!,
    name: names[i]!,
    luminance: relativeLuminance(candidate.rgb),
    on: bestTextColor(candidate.rgb),
  }));

  const byRole: Partial<Record<Role, Swatch[]>> = {};
  for (const swatch of swatches) (byRole[swatch.role] ??= []).push(swatch);

  return {
    swatches,
    byRole,
    meta: {
      pixelsSampled: 0,
      sampledWidth: 0,
      sampledHeight: 0,
      iterations: 0,
      requestedColors: hexes.length,
      space: "oklab",
      seed: 0,
      durationMs: 0,
    },
  };
}
