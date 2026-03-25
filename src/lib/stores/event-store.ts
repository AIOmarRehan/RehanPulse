import { create } from 'zustand';

export interface WebhookEvent {
  id: string;
  deliveryId: string;
  eventType: string;
  action: string | null;
  type: string;
  repo: string | null;
  sender: string | null;
  createdAt: string;
  summary: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface EventStoreState {
  events: WebhookEvent[];
  connected: boolean;
  connectionStatus: ConnectionStatus;
  addEvent: (event: WebhookEvent) => void;
  setConnected: (connected: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearEvents: () => void;
}

export const useEventStore = create<EventStoreState>((set) => ({
  events: [],
  connected: false,
  connectionStatus: 'disconnected' as ConnectionStatus,

  addEvent: (event) =>
    set((state) => {
      // Deduplicate by id
      if (state.events.some((e) => e.id === event.id)) return state;
      // Skip events older than 24 hours
      if (event.createdAt) {
        const age = Date.now() - new Date(event.createdAt).getTime();
        if (age > 24 * 60 * 60 * 1000) return state;
      }
      // Keep the latest 100 events
      const updated = [event, ...state.events].slice(0, 100);
      return { events: updated };
    }),

  setConnected: (connected) => set({ connected, connectionStatus: connected ? 'connected' : 'disconnected' }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  clearEvents: () => set({ events: [] }),
}));
