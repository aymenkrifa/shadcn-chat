import { useState, type MouseEvent, type ReactNode } from "react";
import { MenuIcon, PanelLeftIcon } from "lucide-react";

import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import {
  ThreadList,
  ThreadListItems,
  ThreadListNew,
  ThreadListRoot,
  ThreadListSearch,
} from "@/components/chat/thread-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatState } from "@/lib/chat/provider";
import { cn } from "@/lib/utils";

export type ChatShellProps = {
  children: ReactNode;
  railClassName?: string;
  collapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
  mobileSidebarOpen?: boolean;
  onMobileSidebarOpenChange?: (value: boolean) => void;
  headerContent?: ReactNode;
  sheetTitle?: ReactNode;
  showSearch?: boolean;
  wrapNewThreadTooltip?: boolean;
};

/**
 * The app frame: a collapsible desktop rail, a mobile sheet holding the same
 * list, and the thread itself in the remaining space.
 *
 * A 1:1 port of the reference's `apps/docs/components/examples/clone-thread-shell.tsx`
 * (read 2026-08-17) — every class string here is copied from it. The three
 * primitive translations: Base UI's `render={<X/>}` becomes Radix's `asChild`
 * with the element as a child, `useAuiState` becomes `useChatState`, and shadcn's
 * `SheetContent` brings its own close button (the reference's did too, so the
 * chrome matches).
 */
export function ChatShell({
  children,
  railClassName,
  collapsed,
  onCollapsedChange,
  mobileSidebarOpen,
  onMobileSidebarOpenChange,
  headerContent,
  sheetTitle,
  showSearch = true,
  wrapNewThreadTooltip = false,
}: ChatShellProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const hasThreads = useChatState((s) => s.threads.threadIds.length > 0);

  // A controlled value means the caller renders the chrome that drives it, so
  // the shell omits its own toggle / trigger and forwards changes instead.
  const collapsedControlled = collapsed !== undefined;
  const mobileControlled = mobileSidebarOpen !== undefined;

  const sidebarCollapsed = collapsed ?? internalCollapsed;
  const mobileOpen = mobileSidebarOpen ?? internalMobileOpen;

  const setSidebarCollapsed = (value: boolean) => {
    if (!collapsedControlled) setInternalCollapsed(value);
    onCollapsedChange?.(value);
  };
  const setMobileOpen = (open: boolean) => {
    if (!mobileControlled) setInternalMobileOpen(open);
    onMobileSidebarOpenChange?.(open);
  };

  // Picking a thread inside the sheet has to dismiss the sheet, or the reader
  // lands on a conversation they cannot see. Matching on the list's own
  // `data-slot` names keeps that decision in one place — if thread-list.tsx
  // renames a slot, this selector has to move with it.
  const closeMobileSidebarAfterNavigation = (
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (!(event.target instanceof Element)) return;
    if (
      event.target.closest(
        '[data-slot="aui_thread-list-item-trigger"], [data-slot="aui_thread-list-new"]',
      )
    ) {
      setMobileOpen(false);
    }
  };

  const newThread = (
    <ThreadListNew
      className={cn(
        "overflow-hidden transition-all duration-200",
        sidebarCollapsed
          ? "w-8 gap-0 px-2 has-[>svg]:px-2"
          : "w-full gap-2 px-2.5 has-[>svg]:px-2.5",
      )}
      labelClassName={cn(
        "overflow-hidden transition-all duration-200",
        sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-24 opacity-100",
      )}
    />
  );

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <aside
        className={cn(
          "bg-muted/30 hidden h-full shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 md:flex",
          railClassName,
          sidebarCollapsed ? "w-12" : "w-65",
        )}
      >
        <div className="flex h-12 shrink-0 items-center px-2">
          {!collapsedControlled && (
            <TooltipIconButton
              variant="ghost"
              size="icon"
              tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              side="right"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="size-8"
            >
              <PanelLeftIcon className="size-4" />
            </TooltipIconButton>
          )}
          {headerContent !== undefined
            ? headerContent
            : !sidebarCollapsed && (
                <span className="ml-2 truncate text-sm font-medium">Chats</span>
              )}
        </div>

        <ThreadListRoot
          className={cn(
            "relative flex-1 transition-[padding,width] duration-200",
            sidebarCollapsed
              ? "w-12 overflow-hidden px-2 pt-1"
              : "w-65 overflow-y-auto p-3",
          )}
        >
          {wrapNewThreadTooltip ? (
            // The reference mounts a local `TooltipProvider` here because Base UI
            // wants one per tooltip; Radix's provider carries the shared
            // open/close delay group, so we reuse the single app-level one that
            // base.tsx mounts rather than starting a second group.
            <Tooltip>
              <TooltipTrigger asChild>{newThread}</TooltipTrigger>
              {sidebarCollapsed && (
                <TooltipContent side="right">New Thread</TooltipContent>
              )}
            </Tooltip>
          ) : (
            newThread
          )}
          {showSearch && hasThreads && (
            // `aria-hidden` + `inert` are what stop the collapsed 48px rail from
            // being a keyboard trap: the controls are still in the DOM (so the
            // width transition has something to animate) but unreachable.
            <div
              aria-hidden={sidebarCollapsed}
              inert={sidebarCollapsed}
              className={cn(
                "transition-opacity duration-150",
                sidebarCollapsed && "pointer-events-none opacity-0",
              )}
            >
              <ThreadListSearch value={search} onValueChange={setSearch} />
            </div>
          )}
          <ThreadListItems
            searchQuery={showSearch && hasThreads ? search : ""}
            aria-hidden={sidebarCollapsed}
            inert={sidebarCollapsed}
            className={cn(
              "transition-[opacity,transform] duration-150",
              sidebarCollapsed
                ? "pointer-events-none opacity-0"
                : "translate-x-0 opacity-100",
            )}
          />
        </ThreadListRoot>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        {!mobileControlled && (
          <div className="absolute top-2 left-2 z-20 md:hidden">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="bg-background/70 size-8 backdrop-blur-sm"
              >
                <MenuIcon className="size-4" />
                <span className="sr-only">Open chat history</span>
              </Button>
            </SheetTrigger>
          </div>
        )}
        <SheetContent
          side="left"
          className="flex flex-col p-0"
          // Radix logs a warning for a dialog with no <Description>; the sheet is
          // a navigation panel whose title already says what it is, so opt out
          // explicitly instead of inventing prose nobody needs.
          aria-describedby={undefined}
        >
          <SheetTitle className="flex h-12 shrink-0 items-center px-4 text-sm font-medium">
            {sheetTitle ?? "Chats"}
          </SheetTitle>
          <div
            className="relative flex-1 overflow-y-auto p-3"
            onClick={closeMobileSidebarAfterNavigation}
          >
            <ThreadList />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
