declare interface Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    signEvent(event: { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string }): Promise<{ sig: string }>;
  };
}

// We don't need to declare WebLNProvider anymore since we're using the one from @getalby/sdk
