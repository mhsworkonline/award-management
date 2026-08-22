import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A 0-100 percentage input with a right-aligned "%" affix, capped at 2
 *  decimal places to match what the field can actually store (see
 *  validators.ts' `round2`, which rounds silently on save regardless).
 *  Forwards every other prop straight through to Input, so it works equally
 *  with react-hook-form's `register()` spread or a plain controlled
 *  value/onChange. */
export const PercentInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step="0.01"
        className={cn("tabular pr-7", className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
        %
      </span>
    </div>
  ),
);
PercentInput.displayName = "PercentInput";
