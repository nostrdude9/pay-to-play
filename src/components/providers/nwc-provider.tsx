"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef, useMemo } from "react";
import { debounce } from "lodash";
import { webln } from "@getalby/sdk";
import { useNostr } from "./nostr-provider";

interface NWCContextType {
  nwc: webln.NostrWebLNProvider | null;
  isConnected: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

const NWCContext = createContext<NWCContextType>({
  nwc: null,
  isConnected: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  reconnect: async () => {},
  connectionStatus: 'disconnected',
});

// Validate NWC connection string format
function isValidNWCString(str: string): boolean {
  try {
    if (!str.startsWith('nostr+walletconnect://')) {
      return false;
    }
    const url = new URL(str);
    const pubkey = url.hostname;
    const relay = url.searchParams.get('relay');
    const secret = url.searchParams.get('secret');
    
    return !!(pubkey && relay && secret);
  } catch {
    return false;
  }
}

export function NWCProvider({ children }: { children: ReactNode }) {
  const [nwc, setNwc] = useState<webln.NostrWebLNProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<NWCContextType['connectionStatus']>('disconnected');
  const { nwcString } = useNostr();
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const CONNECTION_TIMEOUT = 10000; // 10 seconds
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);


  const cleanup = useCallback(() => {
    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Clean up WebSocket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clean up NWC provider
    if (nwc) {
      try {
        nwc.close?.();
      } catch (err) {
        console.error('Error during NWC cleanup:', err);
      }
    }

    setNwc(null);
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setError(null);
  }, [nwc]);

  const debouncedInitNWC = useMemo(() => {
    const debouncedFn = debounce(
      async (initFn: () => Promise<void>) => {
        await initFn();
      },
      1000,
      { leading: true, trailing: false }
    );
    return {
      execute: debouncedFn,
      cancel: debouncedFn.cancel
    };
  }, []);

  const initNWC = useCallback(async () => {
    if (!nwcString) {
      cleanup();
      return;
    }

    if (!isValidNWCString(nwcString)) {
      setError(new Error("Invalid NWC connection string format"));
      setConnectionStatus('error');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setError(null);

      const nwcProvider = new webln.NostrWebLNProvider({
        nostrWalletConnectUrl: nwcString,
      });

      // Set up connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        console.error('NWC connection timeout');
        setError(new Error('Connection timeout'));
        setConnectionStatus('error');
        cleanup();
      }, CONNECTION_TIMEOUT);

      // Set up WebSocket handling
      const ws = (nwcProvider as { _relay?: { ws?: WebSocket } })._relay?.ws;
      if (ws) {
        wsRef.current = ws;
        
        ws.onerror = (event: Event) => {
          console.error('WebSocket error:', event);
          setError(new Error('WebSocket connection error'));
          setConnectionStatus('error');
          setIsConnected(false);
          cleanup();
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          setIsConnected(false);
          setConnectionStatus('disconnected');
          cleanup();
        };
      }

      try {
        await Promise.race([
          nwcProvider.enable(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Enable timeout')), CONNECTION_TIMEOUT)
          )
        ]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to enable NWC provider: ${errorMessage}`);
      }
      setNwc(nwcProvider);
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    } catch (err) {
      console.error("Failed to initialize NWC:", err);
      setError(err instanceof Error ? err : new Error("Failed to initialize NWC"));
      setIsConnected(false);
      setConnectionStatus('error');

      // Attempt reconnection if within limits
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        debouncedInitNWC.execute(initNWC);
      } else {
        console.error('Max reconnection attempts reached');
        setError(new Error('Failed to establish connection after multiple attempts'));
      }
    }
  }, [nwcString, cleanup, debouncedInitNWC]);

  // Initialize NWC when connection string changes
  useEffect(() => {
    if (nwcString) {
      debouncedInitNWC.execute(initNWC);
    } else {
      cleanup();
    }
    return () => {
      debouncedInitNWC.cancel?.();
      cleanup();
    };
  }, [nwcString, debouncedInitNWC, cleanup, initNWC]);

  const connect = async () => {
    if (isConnected) return;
    reconnectAttemptsRef.current = 0;
    await initNWC();
  };

  const disconnect = () => {
    cleanup();
  };

  const reconnect = async () => {
    cleanup();
    reconnectAttemptsRef.current = 0;
    await initNWC();
  };

  return (
    <NWCContext.Provider 
      value={{ 
        nwc, 
        isConnected, 
        error, 
        connect, 
        disconnect, 
        reconnect,
        connectionStatus 
      }}
    >
      {children}
    </NWCContext.Provider>
  );
}

export function useNWC() {
  const context = useContext(NWCContext);
  if (context === undefined) {
    throw new Error("useNWC must be used within an NWCProvider");
  }
  return context;
}
