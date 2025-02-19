import { create } from "zustand";
import { Track, PaymentState } from "@/types/nostr";

interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioElement: HTMLAudioElement | null;
  currentTrack: Track | null;
  payment: PaymentState;
  setAudioElement: (element: HTMLAudioElement) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setCurrentTrack: (track: Track) => void;
  updatePaymentState: (updates: Partial<PaymentState>) => void;
  resetPaymentState: () => void;
}

const initialPaymentState: PaymentState = {
  isInFreePeriod: true,
  remainingFreeSeconds: 0,
  currentRate: 0,
  nextPaymentDue: 0,
  lastPaymentStatus: "none",
};

export const useAudioStore = create<AudioState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  audioElement: null,
  currentTrack: null,
  setAudioElement: (element: HTMLAudioElement) => set({ audioElement: element }),
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setCurrentTime: (currentTime: number) => set({ currentTime }),
  setDuration: (duration: number) => set({ duration }),
  setVolume: (volume: number) => set({ volume }),
  payment: initialPaymentState,
  setCurrentTrack: (track: Track) => {
    set({ 
      currentTrack: track,
      payment: {
        ...initialPaymentState,
        remainingFreeSeconds: track.freeSeconds
      }
    });
  },
  updatePaymentState: (updates: Partial<PaymentState>) =>
    set((state) => ({
      payment: { ...state.payment, ...updates },
    })),
  resetPaymentState: () => set({ payment: initialPaymentState }),
}));
