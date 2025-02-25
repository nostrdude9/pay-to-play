import { NDKEvent } from "@nostr-dev-kit/ndk";

export interface Split {
  lightningAddress: string;
  percentage: number;
}

export interface MusicEventData {
  title: string;
  artist: string;
  fileUrl: string;
  duration: number;
  price: number;
  freeSeconds: number;
  lightningAddress: string;
  // Optional fields
  album?: string;
  image?: string;
  license?: string;
  content?: string;
  splits?: Split[];
}

export interface MusicEvent extends NDKEvent {
  kind: 23;
  tags: [
    ["t", "music"],
    ["title", string],
    ["artist", string],
    ["file_url", string],
    ["duration", string],
    ["price", string],
    ["free_seconds", string],
    ["lightning_address", string],
    ...Array<
      | ["album", string]
      | ["image", string]
      | ["license", string]
      | ["split", string]
    >
  ];
  // content is inherited from NDKEvent and is non-optional
}

export interface PaymentState {
  isInFreePeriod: boolean;
  remainingFreeSeconds: number;
  currentRate: number;
  nextPaymentDue: number;
  lastPaymentStatus: "none" | "pending" | "success" | "failed";
  totalPaid: number;
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
  // Optional fields
  album?: string;
  image?: string;
  license?: string;
  content?: string;
  splits?: Split[];
}
