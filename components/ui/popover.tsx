"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 6, collisionPadding = 16, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // Keeps the popover fully on-screen (flips side / slides along the
      // trigger) instead of running off the viewport edge when its trigger
      // sits near a corner — e.g. a "Filters" button at the right end of a
      // toolbar. `collisionPadding` is Radix's own prop; still overridable.
      collisionPadding={collisionPadding}
      className={cn(
        "z-50 w-72 max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-y-auto rounded-lg border bg-popover p-4 text-popover-foreground shadow-panel outline-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
