import { Fragment, useState } from "react";
import { BotIcon, CheckIcon, ChevronDownIcon, CpuIcon, SparklesIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChat, useSelectedModelId } from "@/lib/chat/provider";
import { MODELS } from "@/lib/chat/store";
import type { ModelOption } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * The model picker in the composer's footer row.
 *
 * Ported from the reference's `ModelSelector` (class strings copied verbatim
 * 2026-08-17). Two structural collapses, both because our surface is narrower
 * than the published component's:
 *
 *  - The reference is a compound component (`Root`/`Trigger`/`Value`/`Content`/
 *    `List`/`Item`/…) with controllable `value`/`effort`/`open` state, a
 *    `models` prop and an assistant-ui ModelContext registration. Ours reads
 *    `MODELS` and `composer.modelId` straight from the store, so all of that
 *    plumbing has exactly one caller and is inlined.
 *  - The reference's reasoning-effort radio row (`ModelSelector.Effort`) has no
 *    counterpart here: our `ModelOption` carries no `efforts`, so there is
 *    nothing to render and no keyboard interception to reproduce.
 *
 * The popup stays a cmdk `Command` inside a `Popover`, exactly like the
 * reference, rather than a `DropdownMenu`: that is what produces the
 * reference's row geometry (two-line rows, absolutely-positioned check) and its
 * `role="listbox"`/`role="option"` semantics. No visible search box — base.tsx
 * renders the reference with `searchable` unset, which resolves to `false`, and
 * five models do not need filtering.
 */

/**
 * The reference's trigger is a cva (`modelSelectorTriggerVariants`) over
 * outline/ghost/muted × default/sm/lg. base.tsx only ever asks for
 * `variant="ghost" size="sm" className="h-7 rounded-full"`, so the variants are
 * collapsed to the one resolution that renders — the strings themselves are the
 * reference's, unedited.
 *
 * What tailwind-merge does with them, since the result is not obvious: `h-7`
 * beats the size variant's `h-8`, `rounded-full` beats the base's `rounded-md`,
 * and the size variant's `text-xs` beats the base's `text-sm`. So the trigger
 * ends up 28px tall, pill-shaped and text-xs — the reference's own outcome, not
 * the `text-sm` a reading of the base string alone suggests.
 */
const TRIGGER_BASE =
  "focus-visible:ring-ring/50 flex w-fit items-center justify-between gap-2 overflow-hidden rounded-md text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";
const TRIGGER_GHOST = "hover:bg-accent hover:text-accent-foreground";
const TRIGGER_SM = "h-8 px-2.5 py-1.5 text-xs";

type ModelGroup = {
  /** The vendor label, or undefined for models that declare no group. */
  label: string | undefined;
  models: ModelOption[];
};

/**
 * Runs of consecutive models that share a `group`, in list order.
 *
 * Deliberately not a keyed bucketing: grouping by map would silently reorder
 * `MODELS`, and the store's order is the intended display order. A new group
 * starts only where the label changes, so an interleaved list renders as the
 * author wrote it.
 */
function groupModels(models: readonly ModelOption[]): ModelGroup[] {
  const groups: ModelGroup[] = [];
  for (const model of models) {
    const last = groups[groups.length - 1];
    if (last && last.label === model.group) {
      last.models.push(model);
    } else {
      groups.push({ label: model.group, models: [model] });
    }
  }
  return groups;
}

const MODEL_GROUPS = groupModels(MODELS);

/**
 * The 16px mark that sits before a model's name.
 *
 * The reference's pill reads `[mark] Name ⌄` — its `ModelSelectorValue` renders
 * an icon first, and `docsModelOptions()` gives every model one. Without it our
 * pill was `Name ⌄`: narrower, plainer, and the dropdown rows lost their icon
 * column too (measured against the reference 2026-08-17).
 *
 * Keyed on the vendor GROUP rather than the model, and drawn from lucide, because
 * the reference's marks are vendor logos and shipping someone else's logo is the
 * same borrowed-asset problem the inline SVG wordmark already (correctly) avoids.
 * A per-group glyph reproduces the layout and still tells the reader something.
 *
 * Kept out of the store on purpose: `MODELS` is data, and a store that holds JSX
 * cannot be serialised, sent over a wire, or swapped for a real API response.
 */
const GROUP_ICONS: Record<string, typeof SparklesIcon> = {
  Anthropic: SparklesIcon,
  OpenAI: BotIcon,
};

function ModelIcon({ group, className }: { group?: string; className?: string }) {
  const Icon = (group === undefined ? undefined : GROUP_ICONS[group]) ?? CpuIcon;
  return (
    <span
      data-slot="model-selector-icon"
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5",
        className,
      )}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}

function ModelSelectorItem({
  model,
  isSelected,
  onSelect,
}: {
  model: ModelOption;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <CommandItem
      data-slot="model-selector-item"
      value={model.id}
      // Inert while `shouldFilter` is false, but kept from the reference so
      // turning search on later needs no change here.
      keywords={[model.name]}
      onSelect={() => onSelect(model.id)}
      className="relative items-start gap-2 rounded-lg py-2 ps-3 pe-9 [&_svg:not([class*='size-'])]:size-3.5"
    >
      {/* `mt-[3px]` is the reference's — it optically centres a 14px glyph on the
          first line of a two-line row rather than on the row's whole height. */}
      <ModelIcon group={model.group} className="mt-[3px]" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{model.name}</span>
        {model.description && (
          <span className="text-muted-foreground truncate text-xs">{model.description}</span>
        )}
      </span>
      {isSelected && (
        <span className="absolute end-3 top-2.5 flex size-4 items-center justify-center">
          <CheckIcon className="size-4" />
        </span>
      )}
    </CommandItem>
  );
}

export function ModelSelector({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const modelId = useSelectedModelId();
  const { setModel } = useChat();

  const selectedModel = MODELS.find((model) => model.id === modelId);

  const select = (id: string) => {
    setModel(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-slot="model-selector-trigger"
        data-variant="ghost"
        data-size="sm"
        // The reference's ARIA, kept as-is: cmdk gives the popup's list
        // role="listbox" and its rows role="option", so `haspopup="listbox"` is
        // honest about what a reader lands in — even though Radix wraps it in a
        // role="dialog" popover, exactly as Base UI does in the reference.
        role="combobox"
        aria-haspopup="listbox"
        // A combobox whose only accessible name is its value announces
        // "Sonnet 5, combobox" — the reader hears the selection but never learns
        // what it selects. Prefixing keeps BOTH facts in the name, and keeps the
        // visible text inside it (WCAG 2.5.3), which a bare "Model" would not.
        aria-label={selectedModel ? `Model: ${selectedModel.name}` : "Select model"}
        className={cn(TRIGGER_BASE, TRIGGER_GHOST, TRIGGER_SM, "h-7 rounded-full", className)}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          // ARIA combobox: arrows open the listbox from a focused trigger.
          // Radix's Popover, like Base UI's, leaves this to the consumer.
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selectedModel ? (
          <span
            data-slot="model-selector-value"
            className="flex min-w-0 items-center gap-2"
          >
            <ModelIcon group={selectedModel.group} />
            <span className="truncate font-medium">{selectedModel.name}</span>
          </span>
        ) : (
          <span data-slot="model-selector-value" className="text-muted-foreground">
            Select model
          </span>
        )}
        <ChevronDownIcon className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        data-slot="model-selector-content"
        align="start"
        sideOffset={6}
        // Verbatim from the reference, with one translated token: Base UI's
        // `min-w-(--anchor-width)` becomes Radix's
        // `--radix-popover-trigger-width` (present in @radix-ui/react-popover
        // 1.1.23, checked 2026-08-17). `p-0` is what lets the rows own their own
        // padding, and `bg-popover/95 + backdrop-blur-sm` is why the inner
        // Command is forced transparent below.
        className="bg-popover/95 w-72 min-w-(--radix-popover-trigger-width) overflow-hidden rounded-xl p-0 shadow-lg backdrop-blur-sm"
      >
        <Command
          className="bg-transparent"
          shouldFilter={false}
          // Highlights the current model when the popup opens instead of the
          // first row.
          defaultValue={modelId}
        >
          {/*
            cmdk hangs keyboard navigation off its input, so a list with no
            search box needs an anchor to receive focus and arrow keys. Radix
            focuses the first focusable node in the popup, which is this one.
            The reference does the same (`ModelSelectorFocusAnchor`).
          */}
          <div className="sr-only">
            <CommandInput readOnly aria-label="Model" />
          </div>
          <CommandList className="[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CommandEmpty>No models found.</CommandEmpty>
            {MODEL_GROUPS.map((group, index) => (
              <Fragment key={group.label ?? `group-${index}`}>
                {index > 0 && <CommandSeparator />}
                {/*
                  cmdk requires a headingless group to carry its own `value`,
                  since the heading is otherwise what identifies it. Every model
                  in the store declares a group today, so this branch only
                  guards against one that stops doing so.
                */}
                <CommandGroup
                  {...(group.label === undefined
                    ? { value: `group-${index}` }
                    : { heading: group.label })}
                >
                  {group.models.map((model) => (
                    <ModelSelectorItem
                      key={model.id}
                      model={model}
                      isSelected={model.id === modelId}
                      onSelect={select}
                    />
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
