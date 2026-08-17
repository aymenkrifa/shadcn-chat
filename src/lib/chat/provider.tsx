import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { createChatStore, type ChatActions, type ChatSeed, type ChatStore, type Responder } from "./store";
import type { ChatState } from "./types";

/**
 * The three hooks every component in `components/chat/` uses.
 *
 * They mirror assistant-ui's `useAui()` / `useAuiState(selector)` on purpose, so
 * a component ported from the reference reads almost identically and the diff
 * stays reviewable:
 *
 *   assistant-ui                          here
 *   ------------                          ----
 *   useAuiState(s => s.thread.isRunning)  useChatState(s => s.thread.isRunning)
 *   useAui().thread.append({...})         useChat().append("...")
 *
 * Nothing in here is assistant-ui code — it is ~60 lines of `useSyncExternalStore`.
 */

const ChatContext = createContext<ChatStore | null>(null);

export function ChatProvider({
  seed,
  respond,
  children,
}: {
  seed: ChatSeed;
  respond: Responder;
  children: ReactNode;
}) {
  // The store is created once. Recreating it on every render would reset the
  // transcript on any parent re-render, and the bug reads as "my messages
  // vanish when I toggle the sidebar".
  const storeRef = useRef<ChatStore | null>(null);
  storeRef.current ??= createChatStore(seed, respond);
  return <ChatContext value={storeRef.current}>{children}</ChatContext>;
}

function useStore(): ChatStore {
  const store = useContext(ChatContext);
  if (!store) throw new Error("useChat must be used inside <ChatProvider>");
  return store;
}

/**
 * Subscribe to one slice of state.
 *
 * The selector's result is compared with `Object.is`, so it must return a
 * primitive or a stable reference. Returning a fresh object/array literal
 * (`s => ({ a: s.a })`) re-renders on every store emit and will eventually
 * produce a React "getSnapshot should be cached" warning — return the slice
 * itself, or a primitive, and derive above.
 */
export function useChatState<T>(selector: (state: ChatState) => T): T {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    useCallback(() => selector(store.getState()), [store, selector]),
  );
}

/** The action bag. Stable for the lifetime of the provider. */
export function useChat(): ChatActions {
  return useStore().actions;
}

/**
 * Convenience selectors used in more than one place — kept here so the string
 * `s.thread.messages.length === 0` exists once rather than in four components
 * that can drift apart.
 */
export const selectIsEmpty = (state: ChatState) => state.thread.messages.length === 0;

/**
 * The reference's `isNewChatView`: an empty thread that is not merely still
 * loading. This is what decides whether the composer sits centred (new chat) or
 * docked to the bottom (existing conversation) — the single most noticeable
 * layout behaviour in the whole design.
 */
export const selectIsNewChatView = (state: ChatState) =>
  state.thread.messages.length === 0 && (!state.thread.isLoading || state.threads.isLoading);

/** The model currently selected, resolved to its full option. */
export function useSelectedModelId(): string {
  return useChatState((state) => state.composer.modelId);
}

/** `true` when the composer has nothing in it — gates the suggestion rail. */
export function useComposerIsEmpty(): boolean {
  return useChatState((state) => state.composer.text.trim() === "");
}

/** The open thread's title, or undefined for an unnamed one. */
export function useThreadTitle(): string | undefined {
  const mainThreadId = useChatState((state) => state.threads.mainThreadId);
  const items = useChatState((state) => state.threads.items);
  return useMemo(() => items[mainThreadId]?.title, [items, mainThreadId]);
}
