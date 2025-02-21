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
  totalPaid: 0,
};

export const useAudioStore = create<AudioState>((set, get) => ({
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
    console.info('Setting current track:', {
      title: track.title,
      metadata: {
        price: track.price,
        duration: track.duration,
        freeSeconds: track.freeSeconds,
        lightningAddress: track.lightningAddress
      },
      timestamp: new Date().toISOString()
    });
    
    // Reset all playback and payment state for new track
    set({ 
      currentTrack: track,
      currentTime: 0, // Reset playback position
      duration: 0, // Will be set by audio element's onLoadedMetadata
      payment: {
        ...initialPaymentState,
        isInFreePeriod: true, // Ensure we start in free period
        remainingFreeSeconds: track.freeSeconds,
        nextPaymentDue: 0, // Will be set when exiting free period
        lastPaymentStatus: "none"
      }
    });

    // If there's an existing audio element, reset it
    const state = get();
    if (state.audioElement) {
      console.info('Resetting audio element for new track');
      state.audioElement.currentTime = 0;
      state.audioElement.load(); // Force reload of new source
    }
  },
  updatePaymentState: (updates: Partial<PaymentState>) => {
    const currentState = get();
    const newState = { ...currentState.payment, ...updates };
    
    console.info('Updating payment state:', {
      track: currentState.currentTrack?.title,
      currentTime: currentState.currentTime,
      previous: {
        isInFreePeriod: currentState.payment.isInFreePeriod,
        remainingFreeSeconds: currentState.payment.remainingFreeSeconds,
        lastPaymentStatus: currentState.payment.lastPaymentStatus,
        nextPaymentDue: currentState.payment.nextPaymentDue ? 
          new Date(currentState.payment.nextPaymentDue).toISOString() : 
          null,
        currentRate: currentState.payment.currentRate
      },
      updates,
      new: {
        isInFreePeriod: newState.isInFreePeriod,
        remainingFreeSeconds: newState.remainingFreeSeconds,
        lastPaymentStatus: newState.lastPaymentStatus,
        nextPaymentDue: newState.nextPaymentDue ? 
          new Date(newState.nextPaymentDue).toISOString() : 
          null,
        currentRate: newState.currentRate
      },
      timestamp: new Date().toISOString()
    });
    
    set((state) => ({
      payment: { ...state.payment, ...updates },
    }));
  },
  resetPaymentState: () => {
    console.info('Resetting payment state');
    set({ payment: initialPaymentState });
  },
}));
