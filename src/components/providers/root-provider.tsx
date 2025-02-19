import { ReactNode } from "react";
import { NostrProvider } from "./nostr-provider";
import { NWCProvider } from "./nwc-provider";

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <NostrProvider>
      <NWCProvider>{children}</NWCProvider>
    </NostrProvider>
  );
}
