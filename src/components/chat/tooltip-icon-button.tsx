import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentProps<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * An icon button that always carries an accessible name.
 *
 * The `tooltip` string is rendered TWICE on purpose: once in the floating
 * tooltip for pointer users, and once as `sr-only` text inside the button for
 * everyone else. A tooltip alone is not an accessible name — it only exists
 * while hovered, and it never exists at all on a touch device, so a
 * tooltip-only icon button is an unlabelled button for most readers.
 *
 * Ported from the reference's `TooltipIconButton`, with two changes forced by
 * the primitive underneath: shadcn/ui's tooltip is Radix, so the trigger takes
 * `asChild` rather than Base UI's `render` prop, and the `TooltipProvider` lives
 * once at the app root instead of being re-created per button (Radix's provider
 * carries the shared open/close timing — one per button means each has its own
 * delay group and the "move along a toolbar and tooltips stay open" behaviour is
 * lost).
 */
export function TooltipIconButton({
  children,
  tooltip,
  side = "bottom",
  className,
  variant = "ghost",
  size = "icon",
  ...rest
}: TooltipIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          {...rest}
          className={cn("size-6 p-1 active:scale-90", className)}
        >
          {children}
          <span className="sr-only">{tooltip}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
