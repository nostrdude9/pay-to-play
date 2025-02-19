import { NDKEvent } from "@nostr-dev-kit/ndk";

export interface MusicEventData {
  title: string;
  artist: string;
  fileUrl: string;
  duration: number;
  price: number;
  freeSeconds: number;
  lightningAddress: string;
}

export interface MusicEvent extends NDKEvent {
  kind: 4100;
  tags: [
    ["t", "music"],
    ["title", string],
    ["artist", string],
    ["file_url", string],
    ["duration", string],
    ["price", string],
    ["free_seconds", string],
    ["lightning_address", string]
  ];
}

export interface PaymentState {
  isInFreePeriod: boolean;
  remainingFreeSeconds: number;
  currentRate: number;
  nextPaymentDue: number;
  lastPaymentStatus: "none" | "pending" | "success" | "failed";
}

export interface Track {
  url: string;
  title: string;
  artist: string;
  price: number;
  freeSeconds: number;
  lightningAddress: string;
  pubkey: string;
  eventId: string;
  duration: number;
}
