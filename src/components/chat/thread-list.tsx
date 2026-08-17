import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type Ref,
} from "react";
import {
  ArchiveIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useChat, useChatState } from "@/lib/chat/provider";
import { cn } from "@/lib/utils";

/**
 * The sidebar thread list, ported from assistant-ui's
 * `packages/ui/src/components/assistant-ui/thread-list.tsx` (read 2026-08-17).
 *
 * Every Tailwind string below is the reference's, verbatim. What changed is only
 * where the data comes from: the reference's `ThreadListPrimitive` /
 * `ThreadListItemPrimitive` context (`s.threadListItem.title`) is replaced by an
 * explicit `threadId` prop plus `useChatState` reads off our store, because our
 * runtime has no per-item context provider. The `data-slot` names are kept
 * exactly as the reference writes them: the mobile sheet in `shell.tsx` closes
 * itself by matching `[data-slot="aui_thread-list-item-trigger"]` and
 * `[data-slot="aui_thread-list-new"]` on the click target, so renaming one here
 * silently breaks that.
 */

export function ThreadList() {
  const [search, setSearch] = useState("");
  const hasThreads = useChatState((state) => state.threads.threadIds.length > 0);

  return (
    <ThreadListRoot>
      <ThreadListNew />
      {hasThreads && (
        <ThreadListSearch value={search} onValueChange={setSearch} />
      )}
      <ThreadListItems searchQuery={hasThreads ? search : ""} />
    </ThreadListRoot>
  );
}

export function ThreadListSearch({
  className,
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div data-slot="aui_thread-list-search" className="relative px-0.5 py-1">
      <SearchIcon
        data-slot="aui_thread-list-search-icon"
        className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label="Search threads"
        placeholder="Search threads"
        className={cn("h-8 ps-8 text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function ThreadListRoot({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="aui_thread-list-root"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
}

export function ThreadListItems({
  className,
  searchQuery = "",
  ...props
}: ComponentProps<"div"> & { searchQuery?: string }) {
  // The reference gates these two branches with `<AuiIf condition={...}>`; a
  // plain ternary is the same thing without the primitive.
  const isLoading = useChatState((state) => state.threads.isLoading);

  return (
    <div
      data-slot="aui_thread-list-items"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    >
      {isLoading ? (
        <ThreadListSkeleton />
      ) : (
        <ThreadListItemGroups searchQuery={searchQuery} />
      )}
    </div>
  );
}

const DAY_IN_MS = 86_400_000;

/**
 * `undefined` sorts as "Today" so a freshly created, never-used thread stays at
 * the top instead of falling into "Earlier".
 */
const dateGroupLabel = (
  timestamp: number | undefined,
  startOfToday: number,
): string => {
  if (timestamp === undefined || timestamp >= startOfToday) return "Today";
  if (timestamp >= startOfToday - DAY_IN_MS) return "Yesterday";
  return "Earlier";
};

type ThreadListGroup = { label: string; indices: number[] };

function ThreadListItemGroups({ searchQuery = "" }: { searchQuery?: string }) {
  const threadIds = useChatState((state) => state.threads.threadIds);
  const items = useChatState((state) => state.threads.items);

  const query = searchQuery.trim().toLowerCase();

  const { filteredIndices, groups } = useMemo(() => {
    const dates = threadIds.map((id) => items[id]?.lastMessageAt);
    const filteredIndices = threadIds
      .map((id, index) => ({ id, index }))
      .filter(
        ({ id }) =>
          !query ||
          (items[id]?.title || "New Chat").toLowerCase().includes(query),
      )
      .map(({ index }) => index);
    // `!== undefined` rather than the reference's truthiness test: our
    // `lastMessageAt` is epoch ms, and a falsy `0` would silently drop a thread
    // out of the grouped rendering path where a falsy `Date` could not exist.
    if (!filteredIndices.some((index) => dates[index] !== undefined)) {
      return { filteredIndices, groups: null };
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const time = (index: number) => dates[index] ?? Number.MAX_SAFE_INTEGER;
    const sorted = [...filteredIndices].sort((a, b) => time(b) - time(a));

    const result: ThreadListGroup[] = [];
    for (const index of sorted) {
      const label = dateGroupLabel(dates[index], startOfToday);
      const lastGroup = result[result.length - 1];
      if (lastGroup?.label === label) {
        lastGroup.indices.push(index);
      } else {
        result.push({ label, indices: [index] });
      }
    }
    return { filteredIndices, groups: result };
  }, [threadIds, items, query]);

  if (query && filteredIndices.length === 0) {
    return (
      <div
        data-slot="aui_thread-list-empty"
        className="text-muted-foreground px-2.5 py-4 text-sm"
      >
        No threads found
      </div>
    );
  }

  if (!groups) {
    return (
      <>
        {filteredIndices.map((index) => (
          <ThreadListItem key={threadIds[index]} threadId={threadIds[index]} />
        ))}
      </>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.label}>
          <div
            data-slot="aui_thread-list-group-label"
            className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium"
          >
            {group.label}
          </div>
          {group.indices.map((index) => (
            <ThreadListItem key={threadIds[index]} threadId={threadIds[index]} />
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function ThreadListNew({
  className,
  labelClassName,
  children,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { labelClassName?: string }) {
  const { newThread } = useChat();

  return (
    <Button
      variant="ghost"
      className={cn(
        "hover:bg-muted data-active:bg-muted h-8 justify-start gap-2 rounded-md px-2.5 text-sm font-normal",
        className,
      )}
      {...props}
      // After the spread, deliberately. `shell.tsx` wraps this button in a Radix
      // `<TooltipTrigger asChild>`, whose Slot merges the trigger's own props —
      // including `data-slot="tooltip-trigger"` — into this component's props. Set
      // before the spread, that injected value wins and the slot name disappears
      // from the DOM, which silently kills the mobile sheet's dismiss-on-new-thread
      // (shell.tsx's `closeMobileSidebarAfterNavigation` matches on it). Verified in
      // the rendered DOM, 2026-08-17: before this move the button shipped as
      // `data-slot="tooltip-trigger"`. Nothing selects `tooltip-trigger` in CSS.
      data-slot="aui_thread-list-new"
      // Composed rather than replaced: when `shell.tsx` wraps this button in a
      // Radix tooltip, the trigger injects its own `onClick` (that is how the
      // tooltip closes on click), and overwriting it leaves a tooltip stuck open.
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) newThread();
      }}
    >
      {children ?? (
        <>
          <PlusIcon
            data-slot="aui_thread-list-new-icon"
            className="size-4 shrink-0"
          />
          <span
            data-slot="aui_thread-list-new-label"
            className={cn("whitespace-nowrap", labelClassName)}
          >
            New Thread
          </span>
        </>
      )}
    </Button>
  );
}

function ThreadListSkeleton() {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          data-slot="aui_thread-list-skeleton-wrapper"
          className="flex h-8 items-center px-2.5"
        >
          <Skeleton
            data-slot="aui_thread-list-skeleton"
            className="h-3.5 w-full"
          />
        </div>
      ))}
    </div>
  );
}

function ThreadListItem({ threadId }: { threadId: string }) {
  const isRunning = useChatState(
    (state) => state.threads.items[threadId]?.isRunning ?? false,
  );
  const title = useChatState((state) => state.threads.items[threadId]?.title);
  const isMain = useChatState(
    (state) => state.threads.mainThreadId === threadId,
  );
  const { switchThread } = useChat();

  const [isRenaming, setIsRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  // Renaming swaps the trigger out for an input; when the rename settles the
  // trigger remounts, so focus has to be put back explicitly or the keyboard
  // user is dumped on <body>.
  useEffect(() => {
    if (isRenaming || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);

  /**
   * Up/down between rows, right into the row's menu, left back out — the
   * behaviour `ThreadListItemPrimitive.Root` implements with a Radix collection.
   * Ported with a DOM query over the enclosing items container instead, since we
   * have no collection primitive. The reference flips left/right under
   * `Direction.useDirection()`; we cannot import Radix directly here, so these
   * stay physical arrows (LTR-correct, and the list is FR/EN in practice).
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const trigger = triggerRef.current;
    const more = moreRef.current;

    if (trigger && event.target === trigger) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const list = event.currentTarget.closest(
          '[data-slot="aui_thread-list-items"]',
        );
        const triggers = list
          ? Array.from(
              list.querySelectorAll<HTMLButtonElement>(
                '[data-slot="aui_thread-list-item-trigger"]',
              ),
            )
          : [];
        const next =
          triggers[
            triggers.indexOf(trigger) + (event.key === "ArrowDown" ? 1 : -1)
          ];
        if (next) {
          next.focus();
          event.preventDefault();
        }
      } else if (event.key === "ArrowRight" && more) {
        more.focus();
        event.preventDefault();
      }
    } else if (more && event.target === more && event.key === "ArrowLeft") {
      trigger?.focus();
      event.preventDefault();
    }
  };

  return (
    <div
      data-slot="aui_thread-list-item"
      // The primitive emits `data-active="true"` + `aria-current="true"` on the
      // open thread (checked in the reference's ThreadListItemRoot, 2026-08-17);
      // the value matters because `data-active:` has to match the attribute.
      {...(isMain ? { "data-active": "true", "aria-current": "true" } : null)}
      onKeyDown={onKeyDown}
      className="group hover:bg-muted focus-visible:bg-muted data-active:bg-muted has-focus-visible:bg-muted has-data-[state=open]:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none"
    >
      {isRenaming ? (
        <ThreadListItemRename
          threadId={threadId}
          title={title ?? ""}
          onDone={(restoreFocus) => {
            restoreFocusRef.current = restoreFocus;
            setIsRenaming(false);
          }}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          data-slot="aui_thread-list-item-trigger"
          onClick={() => switchThread(threadId)}
          className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-9 group-has-focus-visible:pe-9 group-has-data-[state=open]:pe-9 group-data-active:pe-9 focus-visible:ring-[3px]"
        >
          {isRunning && (
            <Loader2Icon
              aria-hidden
              data-slot="aui_thread-list-item-running"
              className="text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin"
            />
          )}
          <span
            data-slot="aui_thread-list-item-title"
            className="min-w-0 flex-1 truncate"
          >
            {title ?? "New Chat"}
          </span>
          {isRunning && <span className="sr-only">Running</span>}
        </button>
      )}
      <ThreadListItemMore
        ref={moreRef}
        threadId={threadId}
        onRename={() => setIsRenaming(true)}
      />
    </div>
  );
}

function ThreadListItemRename({
  threadId,
  title,
  onDone,
}: {
  threadId: string;
  title: string;
  onDone: (restoreFocus: boolean) => void;
}) {
  const { renameThread } = useChat();
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = (restoreFocus: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;

    const next = value.trim();
    if (!next || next === title) {
      onDone(restoreFocus);
      return;
    }

    // Deferred so a synchronous throw lands on the rejection path too.
    Promise.resolve()
      .then(() => renameThread(threadId, next))
      .then(
        () => onDone(restoreFocus),
        () => {
          settledRef.current = false;
          if (restoreFocus) inputRef.current?.focus();
        },
      );
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone(true);
  };

  return (
    <Input
      ref={inputRef}
      autoFocus
      data-slot="aui_thread-list-item-rename"
      aria-label="Rename thread"
      value={value}
      className="h-7 min-w-0 flex-1 ps-2.5 pe-9 text-sm"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => commit(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
}

/**
 * The reference's item styling relies on the icons inheriting the item's own
 * colour (foreground, or destructive on Delete). shadcn's `DropdownMenuItem`
 * forces unlabelled svgs to `text-muted-foreground`, so each item re-asserts
 * `text-current` with the identical arbitrary selector — same variant + same
 * property means tailwind-merge keeps ours and drops shadcn's.
 */
const MENU_ITEM_SVG_INHERITS = "[&_svg:not([class*='text-'])]:text-current";

function ThreadListItemMore({
  ref,
  threadId,
  onRename,
}: {
  ref: Ref<HTMLButtonElement>;
  threadId: string;
  onRename: () => void;
}) {
  const { archiveThread, deleteThread } = useChat();
  const suppressCloseFocusRef = useRef(false);

  return (
    // `modal={false}`: Radix's modal menu locks body scroll and pads the
    // scrollbar away, which visibly shifts the whole shell the moment a row menu
    // opens. Base UI's menu in the reference does not do that.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          data-slot="aui_thread-list-item-more"
          className="data-[state=open]:bg-accent absolute end-1.5 top-1/2 size-6 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 group-data-active:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">More options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={6}
        data-slot="aui_thread-list-item-more-content"
        // Radix hands focus back to this trigger when the menu closes. Picking
        // Rename mounts an autofocused input in the same commit, and the restore
        // lands after it — so that one path opts out and the input keeps focus.
        onCloseAutoFocus={(event) => {
          if (!suppressCloseFocusRef.current) return;
          suppressCloseFocusRef.current = false;
          event.preventDefault();
        }}
        className="bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-32 overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
      >
        <DropdownMenuItem
          data-slot="aui_thread-list-item-more-item"
          className={cn(
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none",
            MENU_ITEM_SVG_INHERITS,
          )}
          onSelect={() => {
            suppressCloseFocusRef.current = true;
            onRename();
          }}
        >
          <PencilIcon className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          data-slot="aui_thread-list-item-more-item"
          className={cn(
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none",
            MENU_ITEM_SVG_INHERITS,
          )}
          onSelect={() => archiveThread(threadId)}
        >
          <ArchiveIcon className="size-4" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          data-slot="aui_thread-list-item-more-item"
          className={cn(
            "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none",
            MENU_ITEM_SVG_INHERITS,
          )}
          onSelect={() => deleteThread(threadId)}
        >
          <TrashIcon className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
