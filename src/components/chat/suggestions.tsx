import {
  ChartColumnIcon,
  CloudSunIcon,
  CodeXmlIcon,
  LightbulbIcon,
  PencilLineIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useChat, useChatState } from "@/lib/chat/provider";
import { cn } from "@/lib/utils";

/**
 * The two-row suggestion rail under an empty composer.
 *
 * Ported from the reference's `SUGGESTION_GROUPS` / `ThreadSuggestions`
 * (assistant-ui/apps/docs/components/examples/base.tsx, read 2026-08-17). The
 * groups, labels, prompts, icons and every class string are verbatim — the only
 * additions are the ARIA attributes called out at the point of use.
 */

type SuggestionGroup = {
  label: string;
  icon: ReactNode;
  options: { label: string; prompt: string }[];
};

const SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    label: "Weather",
    icon: <CloudSunIcon />,
    options: [
      {
        label: "in San Francisco",
        prompt: "What's the weather in San Francisco?",
      },
      { label: "in Singapore", prompt: "What's the weather in Singapore?" },
      { label: "in Tokyo", prompt: "What's the weather in Tokyo?" },
      { label: "in London", prompt: "What's the weather in London?" },
    ],
  },
  {
    label: "Code",
    icon: <CodeXmlIcon />,
    options: [
      {
        label: "explain React hooks",
        prompt: "Explain React hooks like useState and useEffect",
      },
      {
        label: "write a debounce function",
        prompt: "Write a debounce function in TypeScript",
      },
      {
        label: "review a useEffect cleanup",
        prompt: "Show me the right way to clean up a subscription in useEffect",
      },
    ],
  },
  {
    label: "Write",
    icon: <PencilLineIcon />,
    options: [
      {
        label: "a birthday card message",
        prompt:
          "Help me write a birthday card message for a friend in the notepad",
      },
      {
        label: "a product announcement",
        prompt: "Draft a short product announcement for a new dark mode",
      },
      {
        label: "release notes",
        prompt:
          "Write release notes for a bugfix release of a React component library",
      },
      {
        label: "a PR description",
        prompt:
          "Write a pull request description for a change that adds keyboard shortcuts",
      },
    ],
  },
  {
    label: "Analyze",
    icon: <ChartColumnIcon />,
    options: [
      {
        label: "React vs Vue vs Svelte",
        prompt: "Compare React, Vue, and Svelte in a table",
      },
      {
        label: "GDP of US, China, Japan",
        prompt:
          "Compare the GDP of the United States, China, and Japan in a table",
      },
      {
        label: "pros and cons of SSR",
        prompt: "What are the pros and cons of server-side rendering?",
      },
    ],
  },
  {
    label: "Brainstorm",
    icon: <LightbulbIcon />,
    options: [
      {
        label: "side project ideas",
        prompt: "Brainstorm five side project ideas for a React developer",
      },
      {
        label: "names for a dev tool",
        prompt: "Brainstorm names for a developer tools startup",
      },
      {
        label: "talk topics",
        prompt: "Brainstorm talk topics for a React meetup",
      },
    ],
  },
];

/**
 * Shared chip class, verbatim from the reference. `h-auto` + `py-1.5` is what
 * overrides shadcn's fixed Button height, and `whitespace-nowrap` is what makes
 * the rail scroll horizontally instead of wrapping — both load-bearing.
 */
const suggestionChipClass =
  "text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors [&_svg]:size-4";

/** Id of the options rail, so an expanded category chip can point at it. */
const OPTIONS_RAIL_ID = "thread-suggestion-options";

export function ThreadSuggestions() {
  const { append } = useChat();
  // The reference reads `isRunning` imperatively at click time. Subscribing
  // instead costs one re-render of a row that only exists on an empty thread,
  // and keeps the guard in one place.
  const isRunning = useChatState((state) => state.thread.isRunning);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const expandedGroup = SUGGESTION_GROUPS.find(
    (group) => group.label === expandedLabel,
  );

  const sendPrompt = (prompt: string) => {
    if (isRunning) return;
    append(prompt);
  };

  return (
    <div className="flex w-full flex-col gap-2 px-4">
      {/*
        `role="group"` + label: ADDED, not in the reference. Five sibling
        buttons with no grouping announce as five unrelated controls dropped
        under the composer.
      */}
      <div
        role="group"
        aria-label="Suggested prompt categories"
        className="w-full scrollbar-none overflow-x-auto"
      >
        <div className="mx-auto flex w-max items-center gap-2">
          {SUGGESTION_GROUPS.map((group) => {
            const isExpanded = group.label === expandedLabel;
            return (
              <Button
                key={group.label}
                variant="ghost"
                className={cn(suggestionChipClass, isExpanded && "bg-muted")}
                // ADDED, not in the reference: this chip reveals a second row of
                // controls, so it has to say whether that row is open — and
                // point at it once it exists.
                aria-expanded={isExpanded}
                aria-controls={isExpanded ? OPTIONS_RAIL_ID : undefined}
                onClick={() =>
                  setExpandedLabel(
                    group.label === expandedLabel ? null : group.label,
                  )
                }
              >
                {group.icon}
                {group.label}
              </Button>
            );
          })}
        </div>
      </div>
      {expandedGroup && (
        <div
          // Keyed on the label so switching category re-mounts the row and the
          // enter animation plays again, exactly as in the reference.
          key={expandedGroup.label}
          id={OPTIONS_RAIL_ID}
          role="group"
          aria-label={`${expandedGroup.label} prompts`}
          className="fade-in slide-in-from-top-1 animate-in w-full scrollbar-none overflow-x-auto duration-200"
        >
          <div className="mx-auto flex w-max items-center gap-2">
            {expandedGroup.options.map((option) => (
              <Button
                key={option.label}
                variant="ghost"
                className={suggestionChipClass}
                onClick={() => sendPrompt(option.prompt)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
