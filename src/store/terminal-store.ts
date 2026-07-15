"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authClient } from "@/lib/auth-client";
import { ApiClientError, apiRequest, jsonBody } from "@/lib/api-client";
import type {
  Alert,
  AssistantMessage,
  BtcSignal,
  Conversation,
  DemoSession,
  DisplayCurrency,
  FxRate,
  ImportBatch,
  MarketPoint,
  MarketPrice,
  PortfolioTransaction,
  SpendingTransaction,
  TokenFlowEvent,
  UserProfile,
  WatchlistWallet,
} from "@/lib/types";

interface OnboardingInput {
  name: string;
  timezone: string;
  displayCurrency: DisplayCurrency;
}

interface WorkspacePayload {
  session: DemoSession | null;
  profile: UserProfile;
  prices: MarketPrice[];
  fxRates: FxRate[];
  transactions: PortfolioTransaction[];
  spending: SpendingTransaction[];
  signals: BtcSignal[];
  marketHistory: MarketPoint[];
  wallets: WatchlistWallet[];
  events: TokenFlowEvent[];
  alerts: Alert[];
  conversations: Conversation[];
  messages: AssistantMessage[];
  importBatches: ImportBatch[];
}

interface TerminalState extends WorkspacePayload {
  hydrated: boolean;
  syncing: boolean;
  syncError?: string;
  setHydrated: (value: boolean) => void;
  refreshWorkspace: () => Promise<boolean>;
  signOut: () => Promise<void>;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  updateProfile: (
    input: Partial<Pick<UserProfile, "name" | "timezone" | "displayCurrency">>,
  ) => Promise<void>;
  addTransaction: (input: Omit<PortfolioTransaction, "id">) => Promise<void>;
  updateTransaction: (id: string, input: Omit<PortfolioTransaction, "id">) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addSpendingTransaction: (input: Omit<SpendingTransaction, "id">) => Promise<void>;
  updateSpendingTransaction: (id: string, input: Omit<SpendingTransaction, "id">) => Promise<void>;
  deleteSpendingTransaction: (id: string) => Promise<void>;
  addWallet: (input: Omit<WatchlistWallet, "id">) => Promise<void>;
  toggleWallet: (id: string) => Promise<void>;
  setWalletSelfAttested: (id: string, selfAttested: boolean) => Promise<void>;
  deleteWallet: (id: string) => Promise<void>;
  markAlertRead: (id: string) => Promise<void>;
  markAllAlertsRead: () => Promise<void>;
  sendMessage: (conversationId: string | undefined, content: string) => Promise<string>;
  newConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  clearPersonalData: () => Promise<void>;
}

const initial: WorkspacePayload = {
  session: null,
  profile: { id: "", name: "", email: "", timezone: "UTC", displayCurrency: "IDR", disclaimerAccepted: false, onboardingComplete: false },
  prices: [],
  fxRates: [],
  transactions: [],
  spending: [],
  signals: [],
  marketHistory: [],
  wallets: [],
  events: [],
  alerts: [],
  conversations: [],
  messages: [],
  importBatches: [],
};

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      ...initial,
      hydrated: false,
      syncing: false,
      syncError: undefined,
      setHydrated: (hydrated) => set({ hydrated }),
      refreshWorkspace: async () => {
        set({ syncing: true, syncError: undefined });
        try {
          const workspace = await apiRequest<WorkspacePayload>("/api/bootstrap");
          set({ ...workspace, syncing: false, syncError: undefined });
          return true;
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 401) {
            set({ session: null, syncing: false });
            return false;
          }
          set({
            session: null,
            syncing: false,
            syncError: error instanceof Error ? error.message : "Backend synchronization failed.",
          });
          return false;
        }
      },
      signOut: async () => {
        await authClient.signOut();
        set({
          session: null,
          transactions: [],
          spending: [],
          wallets: [],
          alerts: [],
          conversations: [],
          messages: [],
          importBatches: [],
        });
      },
      completeOnboarding: async (input) => {
        const profile = await apiRequest<UserProfile>("/api/me", {
          method: "PATCH",
          body: jsonBody({
            ...input,
            disclaimerAccepted: true,
            onboardingComplete: true,
          }),
        });
        set({ profile });
      },
      updateProfile: async (input) => {
        const profile = await apiRequest<UserProfile>("/api/me", {
          method: "PATCH",
          body: jsonBody(input),
        });
        set({ profile });
      },
      addTransaction: async (input) => {
        const transaction = await apiRequest<PortfolioTransaction>("/api/portfolio/transactions", {
          method: "POST",
          body: jsonBody(input),
        });
        set((state) => ({ transactions: [transaction, ...state.transactions] }));
      },
      updateTransaction: async (id, input) => {
        const transaction = await apiRequest<PortfolioTransaction>(`/api/portfolio/transactions/${id}`, {
          method: "PATCH",
          body: jsonBody(input),
        });
        set((state) => ({
          transactions: state.transactions.map((item) => (item.id === id ? transaction : item)),
        }));
      },
      deleteTransaction: async (id) => {
        await apiRequest<void>(`/api/portfolio/transactions/${id}`, { method: "DELETE" });
        set((state) => ({ transactions: state.transactions.filter((item) => item.id !== id) }));
      },
      addSpendingTransaction: async (input) => {
        const transaction = await apiRequest<SpendingTransaction>("/api/spending/transactions", {
          method: "POST",
          body: jsonBody(input),
        });
        set((state) => ({ spending: [transaction, ...state.spending] }));
      },
      updateSpendingTransaction: async (id, input) => {
        const transaction = await apiRequest<SpendingTransaction>(`/api/spending/transactions/${id}`, {
          method: "PATCH",
          body: jsonBody(input),
        });
        set((state) => ({ spending: state.spending.map((item) => item.id === id ? transaction : item) }));
      },
      deleteSpendingTransaction: async (id) => {
        await apiRequest<void>(`/api/spending/transactions/${id}`, { method: "DELETE" });
        set((state) => ({ spending: state.spending.filter((item) => item.id !== id) }));
      },
      addWallet: async (input) => {
        const wallet = await apiRequest<WatchlistWallet>("/api/wallets", {
          method: "POST",
          body: jsonBody({ chain: input.chain, address: input.address, label: input.label }),
        });
        set((state) => ({ wallets: [wallet, ...state.wallets] }));
      },
      toggleWallet: async (id) => {
        const current = get().wallets.find((wallet) => wallet.id === id);
        if (!current) return;
        const wallet = await apiRequest<WatchlistWallet>(`/api/wallets/${id}`, {
          method: "PATCH",
          body: jsonBody({ enabled: !current.enabled }),
        });
        set((state) => ({
          wallets: state.wallets.map((item) => (item.id === id ? wallet : item)),
        }));
      },
      setWalletSelfAttested: async (id, selfAttested) => {
        const wallet = await apiRequest<WatchlistWallet>(`/api/wallets/${id}`, {
          method: "PATCH",
          body: jsonBody({
            classification: selfAttested ? "USER_VERIFIED" : "UNVERIFIED_WHALE",
            ...(selfAttested ? { attestationAccepted: true } : {}),
          }),
        });
        set((state) => ({
          wallets: state.wallets.map((item) => (item.id === id ? wallet : item)),
        }));
      },
      deleteWallet: async (id) => {
        await apiRequest<void>(`/api/wallets/${id}`, { method: "DELETE" });
        set((state) => ({ wallets: state.wallets.filter((item) => item.id !== id) }));
      },
      markAlertRead: async (id) => {
        const result = await apiRequest<{ readAt?: string }>(`/api/alerts/${id}`, {
          method: "PATCH",
          body: jsonBody({ read: true }),
        });
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === id ? { ...alert, readAt: result.readAt ?? new Date().toISOString() } : alert,
          ),
        }));
      },
      markAllAlertsRead: async () => {
        const result = await apiRequest<{ readAt: string }>("/api/alerts", { method: "PATCH" });
        set((state) => ({
          alerts: state.alerts.map((alert) => ({ ...alert, readAt: alert.readAt ?? result.readAt })),
        }));
      },
      newConversation: async () => {
        const conversation = await apiRequest<Conversation>("/api/conversations", {
          method: "POST",
          body: jsonBody({ title: "New conversation" }),
        });
        set((state) => ({ conversations: [conversation, ...state.conversations] }));
        return conversation.id;
      },
      sendMessage: async (requestedId, content) => {
        const conversationId = requestedId ?? (await get().newConversation());
        const result = await apiRequest<{
          userMessage: AssistantMessage;
          assistantMessage: AssistantMessage;
        }>(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          body: jsonBody({ content }),
        });
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  title: content.length > 80 ? `${content.slice(0, 79)}…` : content,
                  updatedAt: result.userMessage.createdAt,
                }
              : conversation,
          ),
          messages: [...state.messages, result.userMessage, result.assistantMessage],
        }));
        return conversationId;
      },
      deleteConversation: async (id) => {
        await apiRequest<void>(`/api/conversations/${id}`, { method: "DELETE" });
        set((state) => ({
          conversations: state.conversations.filter((item) => item.id !== id),
          messages: state.messages.filter((item) => item.conversationId !== id),
        }));
      },
      clearPersonalData: async () => {
        await apiRequest<{ cleared: true }>("/api/workspace", {
          method: "POST",
          body: jsonBody({ action: "CLEAR" }),
        });
        set({
          transactions: [],
          spending: [],
          wallets: [],
          events: [],
          alerts: [],
          signals: [],
          conversations: [],
          messages: [],
          importBatches: [],
        });
      },
    }),
    {
      name: "coin-terminal-ui-v2",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: () => ({} as TerminalState),
    },
  ),
);
