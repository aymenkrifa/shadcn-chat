import type {
  Attachment,
  ChatState,
  Message,
  MessagePart,
  ModelOption,
  Quote,
  ThreadItem,
} from "./types";

/**
 * A ~200-line external store standing in for a chat runtime.
 *
 * Why an external store and not `useState` in a provider: the reference's
 * components each subscribe to ONE leaf of state (`s.composer.isEmpty`,
 * `s.message.isCopied`, `s.thread.isRunning`) and re-render only when that leaf
 * moves. `useSyncExternalStore` + a selector reproduces that exactly, in a
 * fraction of the code, and keeps the port from the reference mechanical. A
 * context holding one `useState` object would re-render the entire thread on
 * every keystroke in the composer — which is precisely the thing you would
 * notice and blame on the design.
 *
 * The responses are canned. This project exists to validate the UI, so the
 * "backend" is a scripted stream that exercises every visual state the reference
 * has: reasoning, tool calls, markdown, math, tables, code, errors.
 */

/** Simple monotonic ids — no `crypto.randomUUID()` so SSR/tests stay reproducible. */
let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${String(++idCounter)}`;

export const MODELS: readonly ModelOption[] = [
  { id: "claude-sonnet-5", name: "Sonnet 5", description: "Balanced", group: "Anthropic" },
  { id: "claude-opus-5", name: "Opus 5", description: "Most capable", group: "Anthropic" },
  { id: "claude-haiku-4-5", name: "Haiku 4.5", description: "Fastest", group: "Anthropic" },
  { id: "gpt-5.4", name: "GPT-5.4", description: "General purpose", group: "OpenAI" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", description: "Cheap", group: "OpenAI" },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-5";

const emptyMessageList: Message[] = [];

function makeThreadItem(overrides: Partial<ThreadItem> = {}): ThreadItem {
  return {
    id: nextId("thread"),
    isRunning: false,
    isArchived: false,
    ...overrides,
  };
}

export function createUserMessage(text: string, extra: Partial<Message> = {}): Message {
  return {
    id: nextId("msg"),
    role: "user",
    parts: text === "" ? [] : [{ type: "text", text }],
    attachments: [],
    createdAt: Date.now(),
    branchCount: 1,
    branchIndex: 0,
    ...extra,
  };
}

export function createAssistantMessage(parts: MessagePart[], extra: Partial<Message> = {}): Message {
  return {
    id: nextId("msg"),
    role: "assistant",
    parts,
    attachments: [],
    createdAt: Date.now(),
    branchCount: 1,
    branchIndex: 0,
    ...extra,
  };
}

/** What a caller hands `createChatStore` to preload the sidebar and a transcript. */
export interface ChatSeed {
  threads: { title: string; lastMessageAt?: number; messages?: Message[] }[];
  /** Index into `threads` that opens on mount. */
  activeIndex?: number;
}

export interface ChatStore {
  getState: () => ChatState;
  subscribe: (listener: () => void) => () => void;
  actions: ChatActions;
}

export interface ChatActions {
  // ---- composer -----------------------------------------------------------
  setComposerText: (text: string) => void;
  send: () => void;
  /** Send a specific string without routing it through the composer (suggestions). */
  append: (text: string) => void;
  cancel: () => void;
  addAttachments: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  setQuote: (quote: Quote | null) => void;
  startDictation: () => void;
  stopDictation: () => void;
  setModel: (id: string) => void;

  // ---- messages -----------------------------------------------------------
  reload: (messageId: string) => void;
  beginEdit: (messageId: string) => void;
  setEditText: (text: string) => void;
  submitEdit: () => void;
  cancelEdit: () => void;
  switchBranch: (messageId: string, direction: -1 | 1) => void;
  /** Returns the plain-text form so the caller can hand it to the clipboard. */
  messageText: (messageId: string) => string;

  // ---- threads ------------------------------------------------------------
  newThread: () => void;
  switchThread: (id: string) => void;
  renameThread: (id: string, title: string) => Promise<void>;
  archiveThread: (id: string) => void;
  deleteThread: (id: string) => void;
}

/**
 * A canned reply. `respond` receives the reader's text and returns the parts to
 * stream, so the demo can react to what was actually asked (a "weather" prompt
 * gets a tool call, a "compare" prompt gets a table) without a model.
 */
export type Responder = (prompt: string) => MessagePart[];

export function createChatStore(seed: ChatSeed, respond: Responder): ChatStore {
  const threadMessages = new Map<string, Message[]>();
  /** Per-message branch storage: every alternative set of parts we have produced. */
  const branches = new Map<string, MessagePart[][]>();

  const items: Record<string, ThreadItem> = {};
  const threadIds: string[] = [];
  for (const entry of seed.threads) {
    const item = makeThreadItem({ title: entry.title, lastMessageAt: entry.lastMessageAt });
    items[item.id] = item;
    threadIds.push(item.id);
    threadMessages.set(item.id, entry.messages ?? []);
    for (const message of entry.messages ?? []) {
      branches.set(message.id, [message.parts]);
    }
  }

  let state: ChatState = {
    threads: {
      threadIds,
      items,
      mainThreadId: threadIds[seed.activeIndex ?? 0] ?? "",
      isLoading: false,
    },
    thread: {
      messages: threadMessages.get(threadIds[seed.activeIndex ?? 0] ?? "") ?? emptyMessageList,
      isRunning: false,
      isLoading: false,
      capabilities: { dictation: true, attachments: true, edit: true, reload: true },
    },
    composer: {
      text: "",
      attachments: [],
      quote: null,
      dictation: null,
      modelId: DEFAULT_MODEL_ID,
    },
    editing: null,
  };

  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  /**
   * Every mutation goes through here. `patch` is shallow-merged at the top level
   * and each namespace is replaced wholesale, so selectors comparing by
   * reference (`s.thread.messages`) see a change exactly when one happened.
   */
  const set = (patch: Partial<ChatState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const currentMessages = () => threadMessages.get(state.threads.mainThreadId) ?? emptyMessageList;

  /** Commit a new message array for the open thread and refresh the derived view. */
  const setMessages = (messages: Message[], extra: Partial<ChatState["thread"]> = {}) => {
    threadMessages.set(state.threads.mainThreadId, messages);
    set({ thread: { ...state.thread, messages, ...extra } });
  };

  const touchThread = (id: string, patch: Partial<ThreadItem>) => {
    const existing = state.threads.items[id];
    if (!existing) return;
    set({
      threads: {
        ...state.threads,
        items: { ...state.threads.items, [id]: { ...existing, ...patch } },
      },
    });
  };

  /** Handle to the in-flight run so `cancel()` can stop it. */
  let run: { timers: number[]; messageId: string } | null = null;

  const clearRun = () => {
    if (!run) return;
    for (const timer of run.timers) window.clearTimeout(timer);
    run = null;
  };

  /**
   * Stream a canned answer part-by-part.
   *
   * Deliberately staged rather than dumped: the reference's reasoning block
   * auto-opens while running and collapses when it completes, the tool group
   * shows a spinner then a count, and the action bar is hidden until the run
   * ends. None of that is observable if the whole answer arrives in one commit,
   * so the demo would look finished while actually testing nothing.
   */
  const startRun = (prompt: string, targetId?: string) => {
    const parts = respond(prompt);
    const startedAt = Date.now();
    const threadId = state.threads.mainThreadId;

    let messageId = targetId;
    if (messageId === undefined) {
      const placeholder = createAssistantMessage([{ type: "indicator" }]);
      messageId = placeholder.id;
      setMessages([...currentMessages(), placeholder], { isRunning: true });
    } else {
      setMessages(
        currentMessages().map((message) =>
          message.id === messageId
            ? { ...message, parts: [{ type: "indicator" }], error: undefined }
            : message,
        ),
        { isRunning: true },
      );
    }
    touchThread(threadId, { isRunning: true, lastMessageAt: startedAt });

    const timers: number[] = [];
    run = { timers, messageId };

    /** Replace the run's message with `next` parts, if the run is still current. */
    const commit = (next: MessagePart[], done: boolean) => {
      if (run?.messageId !== messageId) return;
      setMessages(
        currentMessages().map((message) =>
          message.id === messageId
            ? {
                ...message,
                parts: next,
                metadata: done
                  ? { durationMs: Date.now() - startedAt, model: state.composer.modelId }
                  : message.metadata,
              }
            : message,
        ),
        { isRunning: !done },
      );
      if (done) {
        branches.set(messageId, [
          ...(branches.get(messageId) ?? []).slice(0, -1),
          next,
        ]);
        touchThread(threadId, { isRunning: false });
        clearRun();
      }
    };

    // Reveal one more part every 420ms; a running part settles to complete just
    // before the next one appears, which is what produces the reference's
    // "reasoning collapses as the answer starts" transition.
    const STEP_MS = 420;
    parts.forEach((_, index) => {
      timers.push(
        window.setTimeout(() => {
          const revealed = parts.slice(0, index + 1).map((part, i) => {
            const isLast = i === index;
            if (part.type === "reasoning" || part.type === "tool-call") {
              return { ...part, status: isLast ? { type: "running" as const } : { type: "complete" as const } };
            }
            return part;
          });
          commit(revealed, false);
        }, STEP_MS * (index + 1)),
      );
    });

    timers.push(
      window.setTimeout(
        () => {
          commit(
            parts.map((part) =>
              part.type === "reasoning" || part.type === "tool-call"
                ? { ...part, status: { type: "complete" as const } }
                : part,
            ),
            true,
          );
        },
        STEP_MS * (parts.length + 1),
      ),
    );
  };

  const sendText = (text: string, attachments: Attachment[], quote: Quote | null) => {
    const trimmed = text.trim();
    if (trimmed === "" && attachments.length === 0) return;
    if (state.thread.isRunning) return;

    const user = createUserMessage(trimmed, {
      attachments,
      ...(quote ? { quote } : {}),
    });
    branches.set(user.id, [user.parts]);

    // Name an untitled thread after its first question, like every chat product.
    const threadId = state.threads.mainThreadId;
    if (currentMessages().length === 0) {
      touchThread(threadId, {
        title: trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed || "New Chat",
      });
    }

    setMessages([...currentMessages(), user]);
    set({ composer: { ...state.composer, text: "", attachments: [], quote: null } });
    startRun(trimmed);
  };

  const actions: ChatActions = {
    setComposerText: (text) => {
      set({ composer: { ...state.composer, text } });
    },

    send: () => {
      sendText(state.composer.text, state.composer.attachments, state.composer.quote);
    },

    append: (text) => {
      sendText(text, [], null);
    },

    cancel: () => {
      const messageId = run?.messageId;
      clearRun();
      if (messageId !== undefined) {
        setMessages(
          currentMessages().map((message) =>
            message.id === messageId && message.parts.some((part) => part.type === "indicator")
              ? { ...message, parts: [], error: "Cancelled." }
              : message,
          ),
          { isRunning: false },
        );
      } else {
        set({ thread: { ...state.thread, isRunning: false } });
      }
      touchThread(state.threads.mainThreadId, { isRunning: false });
    },

    addAttachments: (files) => {
      const added: Attachment[] = files.map((file) => ({
        id: nextId("att"),
        name: file.name,
        contentType: file.type || "application/octet-stream",
        ...(file.type.startsWith("image/") ? { previewUrl: URL.createObjectURL(file) } : {}),
        status: "uploading" as const,
      }));
      set({ composer: { ...state.composer, attachments: [...state.composer.attachments, ...added] } });

      // Fake the upload so the pending → complete transition is visible.
      window.setTimeout(() => {
        set({
          composer: {
            ...state.composer,
            attachments: state.composer.attachments.map((attachment) =>
              added.some((one) => one.id === attachment.id)
                ? { ...attachment, status: "complete" as const }
                : attachment,
            ),
          },
        });
      }, 700);
    },

    removeAttachment: (id) => {
      const target = state.composer.attachments.find((attachment) => attachment.id === id);
      if (target?.previewUrl !== undefined) URL.revokeObjectURL(target.previewUrl);
      set({
        composer: {
          ...state.composer,
          attachments: state.composer.attachments.filter((attachment) => attachment.id !== id),
        },
      });
    },

    setQuote: (quote) => {
      set({ composer: { ...state.composer, quote } });
    },

    startDictation: () => {
      set({ composer: { ...state.composer, dictation: { startedAt: Date.now() } } });
    },

    stopDictation: () => {
      set({ composer: { ...state.composer, dictation: null } });
    },

    setModel: (id) => {
      set({ composer: { ...state.composer, modelId: id } });
    },

    reload: (messageId) => {
      const messages = currentMessages();
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      const prompt = messages
        .slice(0, index)
        .reverse()
        .find((message) => message.role === "user");

      // A regeneration is a new BRANCH of the same message, which is what makes
      // the reference's branch picker appear rather than silently overwriting.
      const existing = branches.get(messageId) ?? [messages[index]!.parts];
      branches.set(messageId, [...existing, []]);
      setMessages(
        messages.map((message) =>
          message.id === messageId
            ? { ...message, branchCount: existing.length + 1, branchIndex: existing.length }
            : message,
        ),
      );
      startRun(prompt ? partsToText(prompt.parts) : "", messageId);
    },

    beginEdit: (messageId) => {
      const message = currentMessages().find((one) => one.id === messageId);
      if (!message) return;
      set({ editing: { messageId, text: partsToText(message.parts) } });
    },

    setEditText: (text) => {
      if (!state.editing) return;
      set({ editing: { ...state.editing, text } });
    },

    submitEdit: () => {
      const editing = state.editing;
      if (!editing) return;
      const messages = currentMessages();
      const index = messages.findIndex((message) => message.id === editing.messageId);
      if (index < 0) return;

      const existing = branches.get(editing.messageId) ?? [messages[index]!.parts];
      const nextParts: MessagePart[] = [{ type: "text", text: editing.text }];
      branches.set(editing.messageId, [...existing, nextParts]);

      // Editing a question invalidates everything after it — the reference drops
      // the rest of the thread and re-runs, which is the only honest behaviour.
      set({ editing: null });
      setMessages([
        ...messages.slice(0, index),
        {
          ...messages[index]!,
          parts: nextParts,
          branchCount: existing.length + 1,
          branchIndex: existing.length,
        },
      ]);
      startRun(editing.text);
    },

    cancelEdit: () => {
      set({ editing: null });
    },

    switchBranch: (messageId, direction) => {
      const messages = currentMessages();
      const message = messages.find((one) => one.id === messageId);
      if (!message) return;
      const stored = branches.get(messageId);
      if (!stored) return;
      const nextIndex = message.branchIndex + direction;
      if (nextIndex < 0 || nextIndex >= stored.length) return;
      setMessages(
        messages.map((one) =>
          one.id === messageId
            ? { ...one, branchIndex: nextIndex, parts: stored[nextIndex] ?? one.parts }
            : one,
        ),
      );
    },

    messageText: (messageId) => {
      const message = currentMessages().find((one) => one.id === messageId);
      return message ? partsToText(message.parts) : "";
    },

    newThread: () => {
      clearRun();
      const item = makeThreadItem({ title: undefined });
      threadMessages.set(item.id, []);
      set({
        threads: {
          ...state.threads,
          threadIds: [item.id, ...state.threads.threadIds],
          items: { ...state.threads.items, [item.id]: item },
          mainThreadId: item.id,
        },
        thread: { ...state.thread, messages: emptyMessageList, isRunning: false },
        composer: { ...state.composer, text: "", attachments: [], quote: null },
        editing: null,
      });
    },

    switchThread: (id) => {
      if (id === state.threads.mainThreadId) return;
      clearRun();
      set({
        threads: { ...state.threads, mainThreadId: id },
        thread: {
          ...state.thread,
          messages: threadMessages.get(id) ?? emptyMessageList,
          isRunning: state.threads.items[id]?.isRunning ?? false,
        },
        editing: null,
      });
    },

    renameThread: (id, title) => {
      touchThread(id, { title });
      return Promise.resolve();
    },

    archiveThread: (id) => {
      touchThread(id, { isArchived: true });
      set({
        threads: {
          ...state.threads,
          threadIds: state.threads.threadIds.filter((one) => one !== id),
        },
      });
      if (id === state.threads.mainThreadId) actions.newThread();
    },

    deleteThread: (id) => {
      const { [id]: _removed, ...rest } = state.threads.items;
      threadMessages.delete(id);
      set({
        threads: {
          ...state.threads,
          threadIds: state.threads.threadIds.filter((one) => one !== id),
          items: rest,
        },
      });
      if (id === state.threads.mainThreadId) {
        const fallback = state.threads.threadIds.find((one) => one !== id);
        if (fallback !== undefined) actions.switchThread(fallback);
        else actions.newThread();
      }
    },
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
  };
}

/** Flatten a message to the text a clipboard or a prompt wants. */
export function partsToText(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}
