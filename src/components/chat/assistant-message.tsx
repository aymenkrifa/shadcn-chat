import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from "lucide-react";

import { BranchPicker } from "@/components/chat/branch-picker";
import { DotMatrix } from "@/components/chat/dot-matrix";
import { MarkdownText } from "@/components/chat/markdown-text";
import { MessageTiming } from "@/components/chat/message-timing";
import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/chat/reasoning";
import { ToolFallback } from "@/components/chat/tool-fallback";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/chat/tool-group";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMessage } from "@/lib/chat/message-context";
import { useChat, useChatState } from "@/lib/chat/provider";
import type { MessagePart } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ grouping */

type GroupKind = "group-chainOfThought" | "group-reasoning" | "group-tool";

/**
 * The reference's `groupPartByType({...})` config written out as data.
 *
 * From base.tsx (read 2026-08-17): reasoning and tool calls each get their own
 * inner group, and both sit under a shared `group-chainOfThought`. That shared
 * outer key is the whole point — it is what makes "thought, then the three tool
 * calls it decided to make" render as one block instead of two unrelated
 * panels.
 */
const GROUP_PATH: Record<MessagePart["type"], readonly GroupKind[]> = {
  reasoning: ["group-chainOfThought", "group-reasoning"],
  "tool-call": ["group-chainOfThought", "group-tool"],
  text: [],
  indicator: [],
};

type RenderNode =
  | { kind: "part"; key: string; part: MessagePart }
  | {
      kind: GroupKind;
      key: string;
      /** True when any part in the subtree is still streaming. */
      running: boolean;
      /** How many parts the subtree holds — the tool group's "3 tool calls". */
      count: number;
      children: RenderNode[];
    };

interface Frame {
  kind: GroupKind;
  key: string;
  running: boolean;
  count: number;
  children: RenderNode[];
}

/**
 * Build the render tree by ADJACENT prefix coalescing — a hand-rolled stand-in
 * for assistant-ui's `buildGroupTree`.
 *
 * The rule, and the only genuinely tricky thing in this file: walk the parts in
 * order carrying a stack of open groups. For each part, compare its group path
 * against the open stack and keep the longest shared PREFIX; close every deeper
 * group, then open whatever the path still needs. So consecutive reasoning parts
 * land in one `group-reasoning`, consecutive tool calls in one `group-tool`, and
 * because both paths start with `group-chainOfThought`, a reasoning run followed
 * immediately by a tool run keeps that outer group open across the boundary and
 * shares one wrapper. A text part has an empty path, which closes everything —
 * which is exactly why prose between two thoughts splits them into two
 * chain-of-thought blocks rather than one.
 */
function buildRenderTree(parts: readonly MessagePart[]): RenderNode[] {
  // A sentinel frame so the root's children need no special-casing; its `kind`
  // is never read because it is never closed into a node.
  const root: Frame = {
    kind: "group-chainOfThought",
    key: "root",
    running: false,
    count: 0,
    children: [],
  };
  const stack: Frame[] = [root];

  const close = () => {
    const done = stack.pop() as Frame;
    stack[stack.length - 1].children.push({
      kind: done.kind,
      key: done.key,
      running: done.running,
      count: done.count,
      children: done.children,
    });
  };

  parts.forEach((part, index) => {
    const path = GROUP_PATH[part.type];

    let common = 0;
    while (
      common < stack.length - 1 &&
      common < path.length &&
      stack[common + 1].kind === path[common]
    ) {
      common++;
    }
    while (stack.length - 1 > common) close();
    while (stack.length - 1 < path.length) {
      const kind = path[stack.length - 1];
      stack.push({
        // Keyed by the index of the part that OPENED the group, so the key is
        // stable while the run streams more parts into it.
        key: `${kind}-${index}`,
        kind,
        running: false,
        count: 0,
        children: [],
      });
    }

    const isRunning = "status" in part && part.status.type === "running";
    for (let i = 1; i < stack.length; i++) {
      stack[i].running = stack[i].running || isRunning;
      stack[i].count += 1;
    }
    stack[stack.length - 1].children.push({
      kind: "part",
      key: `part-${index}`,
      part,
    });
  });

  while (stack.length > 1) close();
  return root.children;
}

/* ----------------------------------------------------------------- rendering */

function PartBody({ part }: { part: MessagePart }) {
  switch (part.type) {
    case "text":
      return <MarkdownText>{part.text}</MarkdownText>;
    case "reasoning":
      // The reference renders an individual reasoning part as `<Reasoning/>`,
      // which is literally `() => <MarkdownText/>` — the disclosure around it
      // belongs to the group, not the part.
      return <MarkdownText>{part.text}</MarkdownText>;
    case "tool-call":
      return <ToolFallback {...part} />;
    case "indicator":
      return <AssistantWorkingIndicator />;
  }
}

function RenderedNode({ node }: { node: RenderNode }) {
  if (node.kind === "part") return <PartBody part={node.part} />;

  const children = (
    <>
      {node.children.map((child) => (
        <RenderedNode key={child.key} node={child} />
      ))}
    </>
  );

  switch (node.kind) {
    case "group-chainOfThought":
      return <div data-slot="aui_chain-of-thought">{children}</div>;
    case "group-tool":
      return (
        <ToolGroupRoot variant="ghost">
          <ToolGroupTrigger count={node.count} active={node.running} />
          <ToolGroupContent>{children}</ToolGroupContent>
        </ToolGroupRoot>
      );
    case "group-reasoning":
      return (
        <ReasoningRoot defaultOpen={node.running}>
          <ReasoningTrigger active={node.running} />
          <ReasoningContent aria-busy={node.running}>
            <ReasoningText>{children}</ReasoningText>
          </ReasoningContent>
        </ReasoningRoot>
      );
  }
}

/* ---------------------------------------------------------------- indicators */

function AssistantWorkingIndicator() {
  const { message } = useMessage();
  // The reference tests `s.message.content.length === 0`, where `content`
  // EXCLUDES the synthetic trailing indicator its primitives append. Our runtime
  // carries the indicator as a real part, so the equivalent question is "is
  // there anything here besides the indicator?" — testing `parts.length === 0`
  // literally would make the "Connecting" state unreachable, since a message
  // with no parts renders no indicator either.
  const hasContent = message.parts.some((part) => part.type !== "indicator");

  if (!hasContent) {
    return (
      <span
        data-slot="aui_assistant-message-indicator"
        className="text-muted-foreground inline-flex items-center gap-2 align-middle"
      >
        <DotMatrix state="connecting" aria-hidden />
        <span className="text-sm">Connecting</span>
      </span>
    );
  }
  return (
    <span
      data-slot="aui_assistant-message-indicator"
      className="animate-pulse font-sans"
      aria-label="Assistant is working"
    >
      {"●"}
    </span>
  );
}

function MessageError({ error }: { error: string }) {
  return (
    <div
      data-slot="aui_message-error-root"
      // Class string copied from the reference 2026-08-17. The dark-mode pair
      // is deliberate: `bg-destructive/5` plus `text-red-200`, because
      // `text-destructive` on a dark surface is too dim to read.
      className="border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200"
    >
      <div data-slot="aui_message-error-message" className="line-clamp-2">
        {error}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- action bar */

function AssistantActionBar() {
  const { message, isLast } = useMessage();
  const { reload, messageText } = useChat();
  const isRunning = useChatState((state) => state.thread.isRunning);
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  // `hideWhenRunning` on the reference's `ActionBarPrimitive.Root`: copy and
  // reload on a half-written answer are both wrong, so the bar is gone, not
  // disabled.
  if (isRunning) return null;

  const onCopy = () => {
    // Clipboard writes reject on an insecure origin or a denied permission. The
    // reference has no failure affordance either, and an unhandled rejection is
    // just console noise, so swallow it — the check simply never appears.
    void navigator.clipboard?.writeText(messageText(message.id)).then(
      () => {
        setIsCopied(true);
        if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
        resetTimer.current = window.setTimeout(() => setIsCopied(false), 2000);
      },
      () => {},
    );
  };

  const onExportMarkdown = () => {
    const blob = new Blob([messageText(message.id)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `message-${message.id}.md`;
    link.click();
    // Revoked on the next task, not synchronously: revoking in the same task as
    // the click has been observed to cancel the download in Safari.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div
      data-slot="aui_assistant-action-bar-root"
      className={cn(
        // Class string copied from the reference 2026-08-17, minus its
        // `col-start-3 row-start-2` — the assistant footer here is a flex row,
        // not the user message's grid.
        "text-muted-foreground animate-in fade-in -ml-1 flex gap-1 duration-200",
        // `autohide="not-last"`: every message but the final one keeps its
        // actions hidden until the message is hovered. `group-focus-within` is
        // the accessibility half of that — without it the buttons are reachable
        // by keyboard but invisible, which is worse than not being reachable.
        // `has-[[data-state=open]]` holds the bar visible while the More menu is
        // open, since the menu content is portalled outside this subtree and
        // focus-within stops matching the moment it opens.
        !isLast &&
          "opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 has-[[data-state=open]]:opacity-100",
      )}
    >
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {isCopied ? (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        ) : (
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        )}
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Refresh"
        onClick={() => reload(message.id)}
      >
        <RefreshCwIcon />
      </TooltipIconButton>
      <DropdownMenu>
        {/*
          `asChild` reaches THROUGH TooltipIconButton: Radix clones the element
          and TooltipIconButton spreads the props it receives onto its inner
          Button, so the trigger's handlers, `aria-expanded` and `data-state` all
          land on the real button — same mechanism the reference relies on with
          Base UI's `render` prop.
        */}
        <DropdownMenuTrigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="start"
          sideOffset={6}
          // Class string copied from the reference 2026-08-17. It overrides
          // shadcn's flatter menu skin (rounded-md / p-1 / shadow-md) with the
          // base demo's translucent blurred card; the duplicated
          // `data-[state=...]` animation utilities are the reference's own and
          // resolve to the same thing shadcn already applies.
          className="bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <DropdownMenuItem
            onSelect={onExportMarkdown}
            className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none"
          >
            <DownloadIcon className="size-4" />
            Export as Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MessageTiming />
    </div>
  );
}

/* --------------------------------------------------------------------- root */

export function AssistantMessage() {
  const { message } = useMessage();

  // Reserves space for the action bar and compensates with `-mb` for consistent
  // msg spacing; keeps a hovered action bar from shifting layout (autohide
  // doesn't support absolute positioning well). For pt-[n] use -mb-[n + 6] &
  // min-h-[n + 6] to preserve compensation. (Comment and trick from the
  // reference, 2026-08-17.)
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <div
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      // Class string copied from the reference 2026-08-17. `group/message` is
      // ours: the autohide behaviour in the action bar hangs off hover and
      // focus on this root, which the reference gets from a primitive instead.
      // It is behavioural only — no visual effect.
      className="group/message fade-in slide-in-from-bottom-1 animate-in relative mx-auto w-full max-w-(--thread-max-width) duration-150"
    >
      {/* No bubble on the assistant side — that asymmetry with the user's
          `bg-muted rounded-xl` is the design, not an omission. */}
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        {buildRenderTree(message.parts).map((node) => (
          <RenderedNode key={node.key} node={node} />
        ))}
        {message.error !== undefined && <MessageError error={message.error} />}
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ml-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </div>
  );
}
