/**
 * components/FillBar.tsx
 *
 * Fill bar visualization conforming to Section 15.2.
 * Shows sold/capacity as filled part, with a thin marker at projectedFill.
 */

interface FillBarProps {
  sold: number;
  capacity: number;
  projectedFill: number;
}

export function FillBar({ sold, capacity, projectedFill }: FillBarProps) {
  const currentRatio = capacity > 0 ? Math.min(1, Math.max(0, sold / capacity)) : 0;
  const currentPercent = (currentRatio * 100).toFixed(1);

  const projectedRatio = Math.min(1, Math.max(0, projectedFill));
  const projectedPercent = (projectedRatio * 100).toFixed(1);
  const roundedProjected = Math.round(projectedRatio * 100);

  return (
    <div className="w-full space-y-1.5">
      <div className="flex justify-between text-xs text-zinc-600 font-medium">
        <span>
          {sold} of {capacity} sold
        </span>
        <span className="text-zinc-500">{currentPercent}%</span>
      </div>

      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 ring-1 ring-inset ring-zinc-200">
        {/* Current sold fill */}
        <div
          className="h-full bg-zinc-800 transition-all duration-300 rounded-full"
          style={{ width: `${currentPercent}%` }}
        />

        {/* Projected fill marker */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-amber-500 shadow-sm"
          style={{ left: `${projectedPercent}%` }}
          title={`Projected fill: ${roundedProjected}%`}
        />
      </div>

      <div className="text-xs text-zinc-500">
        Projected fill (estimate): {roundedProjected}%
      </div>
    </div>
  );
}
