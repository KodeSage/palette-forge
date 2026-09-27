"use client";

import type { ColorSpace } from "palette-forge";
import { Button } from "./ui";

export interface ForgeSettings {
  colors: number;
  downweightNeutrals: boolean;
  space: ColorSpace;
  seed: number;
}

/** Small explanatory line under a control. */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 max-w-[46ch] text-[11px] leading-snug text-faint">{children}</p>;
}

export function Controls({
  settings,
  onChange,
  onReshuffle,
  disabled,
  clusteringDisabled = false,
}: {
  settings: ForgeSettings;
  onChange: (next: Partial<ForgeSettings>) => void;
  onReshuffle: () => void;
  disabled: boolean;
  /** True when the palette didn't come from k-means, so seed and space are moot. */
  clusteringDisabled?: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
        <div>
          <label className="eyebrow flex items-center gap-2.5 text-muted">
            Colours
            <input
              type="range"
              min={2}
              max={12}
              value={settings.colors}
              disabled={disabled}
              onChange={(event) => onChange({ colors: Number(event.target.value) })}
              className="w-32 accent-accent"
            />
            <span className="w-4 tabular-nums text-txt">{settings.colors}</span>
          </label>
          <Hint>How many distinct colours to look for. Logos want 2 to 4, photos 6 to 10.</Hint>
        </div>

        <div>
          <label className="eyebrow flex cursor-pointer items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={settings.downweightNeutrals}
              disabled={disabled}
              onChange={(event) => onChange({ downweightNeutrals: event.target.checked })}
              className="accent-accent"
            />
            Ignore background greys
          </label>
          <Hint>
            Screenshots are mostly white. This stops the chrome winning every slot so brand
            colours can surface.
          </Hint>
        </div>

        <div>
          <Button onClick={onReshuffle} disabled={disabled || clusteringDisabled}>
            Try a different split
          </Button>
          <Hint>
            Re-runs clustering from a different starting point. Useful when one colour gets
            split in two and another is missed.
          </Hint>
        </div>
      </div>

      <details className="group mt-5">
        <summary className="eyebrow inline-flex cursor-pointer list-none items-center gap-1.5 text-faint transition-colors hover:text-muted [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span>
          Advanced
        </summary>

        <div className="mt-3 rounded-lg border border-line bg-surface p-3.5">
          <label className="eyebrow flex items-center gap-2 text-muted">
            Colour space
            <select
              value={settings.space}
              disabled={disabled || clusteringDisabled}
              onChange={(event) => onChange({ space: event.target.value as ColorSpace })}
              className="cursor-pointer rounded-[5px] border border-line bg-surface-2 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[.08em] text-txt hover:border-line-bright"
            >
              <option value="oklab">OKLab</option>
              <option value="lab">CIELAB</option>
            </select>
          </label>
          <Hint>
            How the algorithm measures distance between colours. Both are perceptual; OKLab is
            the newer and better-behaved one, especially in the blues. On flat artwork the two
            give identical results. The difference only shows on photographs, and rarely
            matters. Leave it alone unless you&rsquo;re matching another tool&rsquo;s output.
          </Hint>
        </div>
      </details>
    </div>
  );
}
