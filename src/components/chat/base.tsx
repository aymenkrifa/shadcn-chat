import { MenuIcon, PanelLeftIcon, ShareIcon } from "lucide-react";
import { useState } from "react";

import { respond, seed } from "@/components/chat/demo-data";
import { ChatShell } from "@/components/chat/shell";
import { Thread } from "@/components/chat/thread";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatProvider, useThreadTitle } from "@/lib/chat/provider";

/**
 * The whole screen.
 *
 * Ported from the reference's `Base` / `Header` / `Logo` / `ThreadTitle`
 * (assistant-ui/apps/docs/components/examples/base.tsx, read 2026-08-17). Class
 * strings are verbatim, including the physical `md:pl-0` and `ml-auto`.
 */

/**
 * The reference renders a Next `<Image>` of the assistant-ui favicon here. We
 * have neither Next nor that asset — and copying someone else's mark into a
 * clean-room clone would be the one thing in this project that is actually
 * borrowed — so this is a plain inline SVG in `currentColor`, at the size the
 * reference's image occupies (`size-5 shrink-0`).
 *
 * The reference also carries `dark:hue-rotate-180 dark:invert` on the image,
 * which is how you force a fixed-colour raster asset to survive a dark theme.
 * A `currentColor` mark inherits the theme already, so those two utilities are
 * deliberately dropped rather than copied — with them, the mark would invert
 * itself back out of contrast in dark mode.
 */
function Logo() {
  return (
    <div className="flex items-center gap-2 px-2 text-sm font-medium">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-5 shrink-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bubble and tail as one path, so the two shapes cannot show a seam
            where a semi-transparent fill would otherwise overlap itself. */}
        <path
          d="M6.5 3H17.5A4.5 4.5 0 0 1 22 7.5V13.5A4.5 4.5 0 0 1 17.5 18H11L7 21.5V18H6.5A4.5 4.5 0 0 1 2 13.5V7.5A4.5 4.5 0 0 1 6.5 3Z"
          fill="currentColor"
          fillOpacity={0.16}
        />
        <path
          d="M6.75 8.75H17.25M6.75 12.25H13"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-foreground/90 truncate">shadcn chat</span>
    </div>
  );
}

function ThreadTitle() {
  const title = useThreadTitle();

  return (
    <span className="min-w-0 truncate text-sm font-medium">
      {title ?? "New Chat"}
    </span>
  );
}

function Header({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4">
      {/*
        Plain Button, not TooltipIconButton: this one is only rendered below
        `md`, where there is no hover and a tooltip never appears — hence the
        explicit `sr-only` name, which is what the reference does too.
      */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 md:hidden"
        onClick={onOpenMobileSidebar}
      >
        <MenuIcon className="size-4" />
        <span className="sr-only">Toggle menu</span>
      </Button>
      <TooltipIconButton
        variant="ghost"
        size="icon"
        tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        side="bottom"
        onClick={onToggleSidebar}
        className="hidden size-8 md:flex"
      >
        <PanelLeftIcon className="size-4" />
      </TooltipIconButton>
      <ThreadTitle />
      {/* Disabled in the reference as well — the demo has nothing to share. */}
      <TooltipIconButton
        variant="ghost"
        size="icon"
        tooltip="Share"
        side="bottom"
        disabled
        className="ml-auto size-8"
      >
        <ShareIcon className="size-4" />
      </TooltipIconButton>
    </header>
  );
}

export function Base() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    // One TooltipProvider for the whole app: every TooltipIconButton in the
    // tree needs an ancestor provider, and Radix keeps the shared open/close
    // timing on it — one provider per button would give each its own delay
    // group and lose the "move along a toolbar, tooltips stay open" behaviour.
    <TooltipProvider>
      <ChatProvider seed={seed} respond={respond}>
        <ChatShell
          railClassName="border-r-0"
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          mobileSidebarOpen={mobileSidebarOpen}
          onMobileSidebarOpenChange={setMobileSidebarOpen}
          headerContent={<Logo />}
          sheetTitle={<Logo />}
          showSearch={false}
          wrapNewThreadTooltip
        >
          {/*
            The design's signature, and the reason for both `md:pl-0` here and
            `border-r-0` on the rail: a single muted field spans the whole
            window, the rail sits directly in it with no divider, and the
            conversation is a `bg-background rounded-lg` card floating in the
            same field. Dropping the left padding at `md` is what removes the
            gap between rail and card so the card reads as one edge-to-edge
            surface. Physical `pl`, as written in the reference — the port keeps
            physical properties throughout rather than mixing conventions.
          */}
          <div className="bg-muted/30 flex h-full flex-col overflow-hidden p-2 md:pl-0">
            <div className="bg-background flex flex-1 flex-col overflow-hidden rounded-lg">
              <Header
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              />
              <main className="flex-1 overflow-hidden">
                <Thread />
              </main>
            </div>
          </div>
        </ChatShell>
      </ChatProvider>
    </TooltipProvider>
  );
}
