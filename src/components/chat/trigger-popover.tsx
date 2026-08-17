import { useCallback, useEffect, useMemo, useState } from "react";
import type { FC, KeyboardEvent } from "react";
import {
  FileTextIcon,
  GlobeIcon,
  HelpCircleIcon,
  LanguagesIcon,
  SlashIcon,
  WrenchIcon,
} from "lucide-react";

import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/**
 * The `@` / `/` trigger picker.
 *
 * The reference builds this on Lexical: the composer input is a rich-text editor,
 * the trigger run becomes a directive chip, and the popover follows the caret.
 * We do not take Lexical, so two things change and only one of them is visible:
 *
 *  1. The popover is anchored to the COMPOSER SHELL, not to the caret. This is
 *     the one deliberate divergence in this file. Caret-following in a plain
 *     `<textarea>` needs a hidden mirror element that duplicates every font,
 *     padding and wrap rule of the real one, and re-measures on each keystroke —
 *     a lot of fragile code to move a 16rem panel a few dozen pixels sideways.
 *     Anchored to the shell it lands exactly where the reference's
 *     `absolute start-0 bottom-full mb-2` puts it in the common case (caret on
 *     the first line), so the design reads the same.
 *  2. A selection inserts PLAIN TEXT (`@weather `, `/summarize `) where the
 *     reference inserts a serialized directive (`:tool[weather]`) that Lexical
 *     renders as a chip. Same trigger-run replacement, no chip.
 *
 * Detection itself is a straight port of the reference's `detectTrigger`
 * (assistant-ui `packages/react/src/primitives/composer/trigger/detectTrigger.ts`,
 * read 2026-08-17) so the open/close feel is identical.
 */

export type TriggerIcon = FC<{ className?: string }>;

/** One row in the picker. The adapter has already resolved the icon. */
export interface TriggerItem {
  id: string;
  /**
   * `"tool"` / `"file"` / `"command"`. Nothing visual keys off it here — it is
   * kept because the reference's items carry it and a real backend will want it.
   */
  type: string;
  label: string;
  description?: string;
  Icon: TriggerIcon;
}

/**
 * A key the popover may claim before the textarea sees it. Returning `true`
 * means "handled, stop" — the composer's own Enter-to-send must not also fire.
 */
export type TriggerKeyHandler = (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;

/** What an adapter hook hands to `<ComposerTriggerPopover>` (spread, like the reference). */
export interface TriggerAdapter {
  items: readonly TriggerItem[];
  onSelect: (item: TriggerItem) => void;
}

export interface ComposerTriggerPopoverProps extends TriggerAdapter {
  /** The character that opens this picker, e.g. `"@"` or `"/"`. */
  char: string;
  emptyItemsLabel?: string;
  /**
   * Live composer text and caret index. Detection is a pure function of these
   * two, which is why they are props rather than something read from the store:
   * the composer already owns the textarea, and passing them keeps this
   * component free of any DOM knowledge.
   */
  text: string;
  caret: number;
  /** Commit the trigger-run replacement. The composer moves the DOM caret. */
  onReplace: (nextText: string, nextCaret: number) => void;
  /**
   * Hand the composer a key handler to consult from the textarea's `onKeyDown`.
   * Returns an unregister function, so this is called from an effect.
   */
  registerKeyHandler: (handler: TriggerKeyHandler) => () => void;
}

const WHITESPACE_RE = /\s/u;

/**
 * Find a trigger run that ends at the caret, or `null`.
 *
 * Ported from the reference: scan backwards from the caret, bail at the first
 * whitespace (the run must be contiguous with the caret), and require the
 * trigger char itself to sit at a word boundary — otherwise an email address
 * would open the mention picker on every keystroke.
 */
function detectTrigger(
  text: string,
  triggerChar: string,
  caret: number,
): { query: string; offset: number } | null {
  const upToCaret = text.slice(0, caret);

  for (let i = upToCaret.length - 1; i >= 0; i--) {
    const char = upToCaret[i];
    if (WHITESPACE_RE.test(char)) return null;

    if (upToCaret.startsWith(triggerChar, i)) {
      if (i > 0 && !WHITESPACE_RE.test(upToCaret[i - 1])) continue;
      return { query: upToCaret.slice(i + triggerChar.length), offset: i };
    }
  }

  return null;
}

/** The reference's `matchesQuery`: id, label and description all count. */
function matchesQuery(item: TriggerItem, lower: string): boolean {
  if (!lower) return true;
  if (item.id.toLowerCase().includes(lower)) return true;
  if (item.label.toLowerCase().includes(lower)) return true;
  if (item.description?.toLowerCase().includes(lower)) return true;
  return false;
}

export function ComposerTriggerPopover({
  char,
  items,
  onSelect,
  emptyItemsLabel = "No matching items",
  text,
  caret,
  onReplace,
  registerKeyHandler,
}: ComposerTriggerPopoverProps) {
  const trigger = useMemo(() => detectTrigger(text, char, caret), [text, char, caret]);

  /**
   * Escape (or an outside click) closes the picker without clearing the text,
   * so "is it dismissed?" has to be remembered against something. The trigger's
   * offset is that key: keep typing into the same run and it stays closed, move
   * the caret to a different `@` and it opens again.
   */
  const [dismissedOffset, setDismissedOffset] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const filtered = useMemo(() => {
    if (!trigger) return [];
    const lower = trigger.query.toLowerCase();
    return items.filter((item) => matchesQuery(item, lower));
  }, [items, trigger]);

  const open = trigger !== null && dismissedOffset !== trigger.offset;

  // A new query is a new candidate list, so the highlight goes back to the top.
  useEffect(() => {
    setHighlighted(0);
  }, [trigger?.query, open]);

  // Clamp on read rather than in an effect: filtering can shrink the list in the
  // same commit that a key moved the highlight, and an effect-based clamp would
  // paint one frame with nothing highlighted.
  const index = filtered.length === 0 ? 0 : Math.min(highlighted, filtered.length - 1);

  const selectItem = useCallback(
    (item: TriggerItem) => {
      if (!trigger) return;
      // Plain-text stand-in for the reference's directive chip. Trailing space so
      // the next word does not re-open the picker.
      const insert = `${char}${item.id} `;
      const nextText = `${text.slice(0, trigger.offset)}${insert}${text.slice(caret)}`;
      onReplace(nextText, trigger.offset + insert.length);
      onSelect(item);
      setDismissedOffset(null);
    },
    [char, text, caret, trigger, onReplace, onSelect],
  );

  useEffect(() => {
    if (!open || trigger === null) return;
    const count = filtered.length;
    const current = count === 0 ? undefined : filtered[index];

    const handler: TriggerKeyHandler = (event) => {
      switch (event.key) {
        case "ArrowDown":
          if (count === 0) return false;
          event.preventDefault();
          setHighlighted((previous) => (previous + 1) % count);
          return true;
        case "ArrowUp":
          if (count === 0) return false;
          event.preventDefault();
          setHighlighted((previous) => (previous - 1 + count) % count);
          return true;
        case "Enter":
        case "Tab":
          // Shift+Enter is the composer's newline and must never be swallowed.
          // An IME candidate list also owns Enter — see the composer's comment.
          if (event.shiftKey || event.nativeEvent.isComposing) return false;
          if (!current) return false;
          event.preventDefault();
          selectItem(current);
          return true;
        case "Escape":
          event.preventDefault();
          setDismissedOffset(trigger.offset);
          return true;
        default:
          return false;
      }
    };

    return registerKeyHandler(handler);
  }, [open, trigger, filtered, index, selectItem, registerKeyHandler]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && trigger) setDismissedOffset(trigger.offset);
      }}
    >
      {/*
        The anchor is a zero-cost overlay of the composer box: this component is
        a SIBLING of the composer shell inside the composer's `relative` wrapper,
        so `absolute inset-0` makes the anchor exactly the composer's rectangle.
        `side="top" align="start" sideOffset={8}` then reproduces the reference's
        `absolute start-0 bottom-full mb-2`. `pointer-events-none` because the
        overlay sits on top of the textarea.
      */}
      <PopoverAnchor className="pointer-events-none absolute inset-0" />
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        // Focus must stay in the textarea: the reader is still typing the query,
        // and Radix's default is to move focus into the panel on open.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Class string copied from the reference's ComposerTriggerPopover
        // (2026-08-17) minus `absolute start-0 bottom-full mb-2`, which Radix's
        // popper owns; `p-0` overrides shadcn's PopoverContent padding.
        className="bg-popover text-popover-foreground z-50 w-64 overflow-hidden rounded-xl border p-0 shadow-lg"
      >
        {/*
          cmdk does our filtering nowhere — `shouldFilter={false}`, because the
          adapter's `matchesQuery` is the reference's semantics (id OR label OR
          description) and cmdk's fuzzy scorer would also reorder rows.
          What cmdk is here for is the roving-highlight plumbing: `value` drives
          `data-selected` on the row, which is what shadcn's CommandItem styles,
          and hovering a row reports back through `onValueChange` so pointer and
          keyboard cannot disagree about which row is active.
        */}
        <Command
          shouldFilter={false}
          label={`${char} suggestions`}
          value={filtered.length === 0 ? "" : filtered[index].id}
          onValueChange={(next) => {
            const hovered = filtered.findIndex((item) => item.id === next);
            if (hovered !== -1) setHighlighted(hovered);
          }}
        >
          {/* `flex flex-col py-1` is the reference's items wrapper (2026-08-17). */}
          <CommandList className="flex flex-col py-1">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground px-3 py-2 text-sm">{emptyItemsLabel}</div>
            ) : (
              filtered.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => selectItem(item)}
                  // Verbatim from the reference's TriggerPopoverItem (2026-08-17),
                  // plus `rounded-none` because shadcn's CommandItem rounds its
                  // corners and the reference's rows are full-bleed. The
                  // `data-[highlighted]` half is the reference's own attribute
                  // name and is inert here — cmdk writes `data-selected`, which
                  // shadcn's CommandItem base classes already style.
                  className="hover:bg-accent focus:bg-accent data-[highlighted]:bg-accent flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-none px-3 py-2 text-start transition-colors outline-none"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <item.Icon className="text-primary size-3.5" />
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="text-muted-foreground ms-5.5 text-xs leading-tight">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** An adapter's item before its icon is resolved. */
interface TriggerItemDef {
  id: string;
  type: string;
  label?: string;
  description?: string;
  Icon?: TriggerIcon;
}

function resolveItems(defs: readonly TriggerItemDef[], fallbackIcon: TriggerIcon): TriggerItem[] {
  return defs.map((def) => ({
    id: def.id,
    type: def.type,
    label: def.label ?? def.id,
    ...(def.description !== undefined ? { description: def.description } : {}),
    Icon: def.Icon ?? fallbackIcon,
  }));
}

/**
 * `@` mentions.
 *
 * In the reference this pool is whatever tools are registered in model context,
 * and `unstable_useMentionAdapter({ fallbackIcon: WrenchIcon })` gives none of
 * them a per-item icon — so every row in the base demo shows the wrench. These
 * stand-ins keep that: no icons, wrench fallback. Names are underscore-cased and
 * space-free on purpose, because they are inserted into the text as `@id ` and a
 * space would split the run detection.
 */
const MENTION_ITEMS: readonly TriggerItemDef[] = [
  { id: "weather", type: "tool", description: "Look up the forecast for a city" },
  { id: "search_web", type: "tool", description: "Search the web and cite sources" },
  { id: "run_code", type: "tool", description: "Execute a snippet in a sandbox" },
  { id: "chart", type: "tool", description: "Plot a series as a chart" },
  { id: "project_brief.md", type: "file", description: "Attached document" },
];

export function useMentionAdapter(): TriggerAdapter {
  return useMemo<TriggerAdapter>(
    () => ({
      items: resolveItems(MENTION_ITEMS, WrenchIcon),
      onSelect: (item) => {
        console.log(`[base clone] @${item.id} mentioned`);
      },
    }),
    [],
  );
}

/**
 * `/` commands — the reference's four, with its `iconMap` inlined as the per-item
 * icon and `SlashIcon` as the fallback. Labels are `/id` exactly as the
 * reference's `toItem` builds them.
 *
 * Selecting one runs the command AND leaves `/id ` in the composer, which is the
 * reference's default (`removeOnExecute: false` keeps the directive as an audit
 * trail of what the reader invoked).
 */
const SLASH_COMMANDS: readonly (TriggerItemDef & { execute: () => void })[] = [
  {
    id: "summarize",
    type: "command",
    label: "/summarize",
    description: "Summarize the conversation",
    Icon: FileTextIcon,
    execute: () => console.log("[base clone] /summarize invoked"),
  },
  {
    id: "translate",
    type: "command",
    label: "/translate",
    description: "Translate text to another language",
    Icon: LanguagesIcon,
    execute: () => console.log("[base clone] /translate invoked"),
  },
  {
    id: "search",
    type: "command",
    label: "/search",
    description: "Search the web for information",
    Icon: GlobeIcon,
    execute: () => console.log("[base clone] /search invoked"),
  },
  {
    id: "help",
    type: "command",
    label: "/help",
    description: "List available commands",
    Icon: HelpCircleIcon,
    execute: () => console.log("[base clone] /help invoked"),
  },
];

export function useSlashCommandAdapter(): TriggerAdapter {
  return useMemo<TriggerAdapter>(
    () => ({
      items: resolveItems(SLASH_COMMANDS, SlashIcon),
      onSelect: (item) => {
        SLASH_COMMANDS.find((command) => command.id === item.id)?.execute();
      },
    }),
    [],
  );
}
