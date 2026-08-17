/**
 * The data model the UI renders.
 *
 * This is a DELIBERATE re-declaration of the shape assistant-ui's primitives
 * expose, not an import of it. The whole point of this project is to prove the
 * base example's LOOK is reachable with shadcn/ui alone, so the runtime has to
 * be ours — but the shape stays close enough that porting a component from the
 * reference is mechanical (`useAuiState(s => s.thread.isRunning)` becomes
 * `useChatState(s => s.thread.isRunning)`), and close enough that swapping in a
 * real backend later means writing an adapter, not rewriting components.
 *
 * Nothing here is specific to any product domain. It is a chat transcript.
 */

/** Who produced a message. There is no `system` role in the UI — it renders nothing. */
export type Role = "user" | "assistant";

/**
 * Whether a part is still being produced. The reference drives three separate
 * visual affordances off this (reasoning auto-opens while running, tool groups
 * show a spinner, the action bar hides), so it is a part-level fact rather than
 * something inferred from the thread.
 */
export type PartStatus =
  | { type: "running" }
  | { type: "complete" }
  | { type: "incomplete"; reason: string };

/** A markdown text run — the common case. */
export interface TextPart {
  type: "text";
  text: string;
}

/** Chain-of-thought. Rendered collapsed unless it is still streaming. */
export interface ReasoningPart {
  type: "reasoning";
  text: string;
  status: PartStatus;
}

/** A tool invocation and, once it lands, its result. */
export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: PartStatus;
}

/**
 * The "working" placeholder. It is a PART, not a thread-level flag, because the
 * reference shows it inline where the answer will appear — and once the first
 * token lands the part is replaced rather than a spinner being hidden somewhere
 * else in the tree.
 */
export interface IndicatorPart {
  type: "indicator";
}

export type MessagePart = TextPart | ReasoningPart | ToolCallPart | IndicatorPart;

/** An uploaded file, at any point in its lifecycle. */
export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  /** Object URL for images, so the composer can show a thumbnail. */
  previewUrl?: string;
  status: "uploading" | "complete" | "error";
}

/** Text the reader selected in an answer and carried into their next question. */
export interface Quote {
  text: string;
  /** Id of the message the text was lifted from, for the "in reply to" affordance. */
  sourceMessageId?: string;
}

/** What the action bar's timing readout needs. */
export interface MessageMetadata {
  /** Wall-clock time the answer took, ms. */
  durationMs?: number;
  model?: string;
}

export interface Message {
  id: string;
  role: Role;
  parts: MessagePart[];
  attachments: Attachment[];
  /** Epoch ms. Drives the thread-list date grouping and the timing readout. */
  createdAt: number;
  quote?: Quote;
  /** Set when the turn failed. Rendered as the destructive banner, never thrown. */
  error?: string;
  metadata?: MessageMetadata;
  /**
   * Branching. The reference's BranchPicker hides itself when `count < 2`, so
   * the default of one branch means the control never appears — which is what
   * you want until the reader edits or regenerates something.
   */
  branchCount: number;
  branchIndex: number;
}

/** One row in the sidebar. */
export interface ThreadItem {
  id: string;
  title?: string;
  /** Epoch ms of the newest message, or undefined for a thread with none. */
  lastMessageAt?: number;
  /** A thread can be generating while the reader is looking at a different one. */
  isRunning: boolean;
  isArchived: boolean;
}

/** A model the picker offers. */
export interface ModelOption {
  id: string;
  name: string;
  /** Shown under the name in the dropdown. */
  description?: string;
  /** Grouping label, e.g. the vendor. */
  group?: string;
}

/**
 * The whole UI state, in one object.
 *
 * Shaped as three namespaces (`threads` / `thread` / `composer`) for the same
 * reason the reference is: a selector should read as a sentence
 * (`s.thread.isRunning`), and a component should be able to subscribe to one
 * leaf without re-rendering when an unrelated one changes.
 */
export interface ChatState {
  threads: {
    /** Display order. Newest first, maintained by the store. */
    threadIds: string[];
    items: Record<string, ThreadItem>;
    mainThreadId: string;
    isLoading: boolean;
  };
  thread: {
    messages: Message[];
    isRunning: boolean;
    isLoading: boolean;
    /** Feature switches the reference reads to decide what chrome to show. */
    capabilities: {
      dictation: boolean;
      attachments: boolean;
      edit: boolean;
      reload: boolean;
    };
  };
  composer: {
    text: string;
    attachments: Attachment[];
    quote: Quote | null;
    /** Non-null while dictation is live. */
    dictation: { startedAt: number } | null;
    modelId: string;
  };
  /** Non-null while the reader is editing one of their own messages in place. */
  editing: { messageId: string; text: string } | null;
}
