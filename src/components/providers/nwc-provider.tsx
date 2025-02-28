"use client";

import { createContext, useContext, useEffect, useReducer, ReactNode, useCallback, useRef } from "react";
import { debounce } from "lodash";

// Create debounced function outside component to prevent recreation
const createDebouncedInit = () => 
  debounce(
    async (initFn: () => Promise<void>) => {
      await initFn();
    },
    1000,
    { leading: true, trailing: false }
  );
import { webln } from "@getalby/sdk";
import { useNostr } from "./nostr-provider";

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface NWCState {
  nwc: webln.NostrWebLNProvider | null;
  isConnected: boolean;
  error: Error | null;
  connectionStatus: ConnectionStatus;
}

interface NWCContextType extends NWCState {
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
}

const initialState: NWCState = {
  nwc: null,
  isConnected: false,
  error: null,
  connectionStatus: 'disconnected'
};

const NWCContext = createContext<NWCContextType>({
  ...initialState,
  connect: async () => {},
  disconnect: () => {},
  reconnect: async () => {},
});

type NWCAction =
  | { type: 'SET_CONNECTING' }
  | { type: 'SET_CONNECTED'; nwc: webln.NostrWebLNProvider }
  | { type: 'SET_DISCONNECTED' }
  | { type: 'SET_ERROR'; error: Error }
  | { type: 'RESET' };

function nwcReducer(state: NWCState, action: NWCAction): NWCState {
  switch (action.type) {
    case 'SET_CONNECTING':
      return {
        ...state,
        connectionStatus: 'connecting',
        error: null
      };
    case 'SET_CONNECTED':
      return {
        nwc: action.nwc,
        isConnected: true,
        error: null,
        connectionStatus: 'connected'
      };
    case 'SET_DISCONNECTED':
      return {
        ...initialState,
        connectionStatus: 'disconnected'
      };
    case 'SET_ERROR':
      return {
        ...initialState,
        error: action.error,
        connectionStatus: 'error'
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

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
  const [state, dispatch] = useReducer(nwcReducer, initialState);
  const { nwcString } = useNostr();
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const CONNECTION_TIMEOUT = 30000; // 30 seconds
  const INITIAL_BACKOFF = 1000; // 1 second
  const wsRef = useRef<WebSocket | null>(null);
  const connectionStatusRef = useRef<ConnectionStatus>('disconnected');
  const nwcRef = useRef<webln.NostrWebLNProvider | null>(null);
  const mountedRef = useRef(true);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback((fullCleanup: boolean = false) => {
    // Always clear intervals
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Only perform full cleanup when explicitly requested
    if (fullCleanup) {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      if (nwcRef.current) {
        try {
          nwcRef.current.close?.();
        } catch (err) {
          console.error('Error during NWC cleanup:', err);
        }
        nwcRef.current = null;
      }

      // Only dispatch if we're not already disconnected
      if (connectionStatusRef.current !== 'disconnected') {
        connectionStatusRef.current = 'disconnected';
        if (mountedRef.current) {
          dispatch({ type: 'SET_DISCONNECTED' });
        }
      }
    }
  }, []);

  // Store debounced function in ref to maintain instance across renders
  const debouncedInitRef = useRef(createDebouncedInit());

  const initNWC = useCallback(async () => {
    if (connectionStatusRef.current === 'connecting') {
      return; // Prevent multiple simultaneous connection attempts
    }

    // Clean up existing connection first
    cleanup(true);

    // Cancel any pending debounced calls
    debouncedInitRef.current.cancel();
    
    if (!nwcString) return;

    if (!isValidNWCString(nwcString)) {
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', error: new Error("Invalid NWC connection string format") });
      }
      return;
    }

    try {
      connectionStatusRef.current = 'connecting';
      if (mountedRef.current) {
        dispatch({ type: 'SET_CONNECTING' });
      }

      console.info('Initializing NWC provider...');
      const nwcProvider = new webln.NostrWebLNProvider({
        nostrWalletConnectUrl: nwcString,
      });

      nwcRef.current = nwcProvider;

      // Set up WebSocket handling with better connection management
      const ws = (nwcProvider as { _relay?: { ws?: WebSocket } })._relay?.ws;
      if (ws) {
        wsRef.current = ws;
        
        const setupWebSocket = () => {
          ws.onopen = () => {
            console.info('WebSocket connection established');
          };
          
          ws.onerror = (event: Event) => {
            console.error('WebSocket error:', event);
            // Only handle severe connection errors
            if (ws.readyState === WebSocket.CLOSED) {
              if (mountedRef.current) {
                const error = new Error('WebSocket connection lost - please check your internet connection');
                dispatch({ type: 'SET_ERROR', error });
                
                // Attempt reconnection if completely disconnected
                if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                  const backoffTime = INITIAL_BACKOFF * Math.pow(2, reconnectAttemptsRef.current);
                  console.info(`WebSocket error - attempting reconnection in ${backoffTime}ms`);
                  setTimeout(() => {
                    if (mountedRef.current) {
                      initNWC();
                    }
                  }, backoffTime);
                }
              }
            }
          };

          ws.onclose = (event) => {
            console.info(`WebSocket closed with code ${event.code}`);
            // Only cleanup and attempt reconnect if we're not in a temporary state
            if (mountedRef.current && 
                connectionStatusRef.current === 'connected' && 
                event.code !== 1000) { // 1000 is normal closure
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const backoffTime = INITIAL_BACKOFF * Math.pow(2, reconnectAttemptsRef.current);
                console.info(`WebSocket closed - attempting reconnection in ${backoffTime}ms`);
                setTimeout(() => {
                  if (mountedRef.current) {
                    initNWC();
                  }
                }, backoffTime);
              }
            }
          };
        };

        setupWebSocket();

        // Set up ping/pong to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Send ping every 30 seconds
      }

      try {
        console.info('Enabling NWC provider...');
        await Promise.race([
          nwcProvider.enable(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Enable timeout')), CONNECTION_TIMEOUT)
          )
        ]);
        
        // Test the connection with a simple request
        await nwcProvider.getInfo();
        console.info('NWC provider enabled and verified successfully');

        // Update state in a single batch
        reconnectAttemptsRef.current = 0;
        connectionStatusRef.current = 'connected';
        if (mountedRef.current) {
          dispatch({ type: 'SET_CONNECTED', nwc: nwcProvider });
        }
        console.info('NWC connection established successfully');
      } catch (err) {
        console.error("Failed to initialize NWC:", err);
        const error = err instanceof Error ? err : new Error("Failed to initialize NWC");
        
        if (mountedRef.current) {
          dispatch({ type: 'SET_ERROR', error });
        }

        // Attempt reconnection with exponential backoff if within limits
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          const backoffTime = INITIAL_BACKOFF * Math.pow(2, reconnectAttemptsRef.current - 1);
          console.info(`Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} in ${backoffTime}ms`);
          
          setTimeout(() => {
            if (mountedRef.current) {
              debouncedInitRef.current(initNWC);
            }
          }, backoffTime);
        } else {
          console.error('Max reconnection attempts reached');
          if (mountedRef.current) {
            dispatch({ 
              type: 'SET_ERROR', 
              error: new Error(`Failed to establish connection after ${MAX_RECONNECT_ATTEMPTS} attempts. Please check your NWC connection string and try again.`) 
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to initialize NWC:", err);
      const error = err instanceof Error ? err : new Error("Failed to initialize NWC");
      
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', error });
      }

      // Attempt reconnection with exponential backoff if within limits
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        const backoffTime = INITIAL_BACKOFF * Math.pow(2, reconnectAttemptsRef.current - 1);
        console.info(`Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} in ${backoffTime}ms`);
        
        setTimeout(() => {
          if (mountedRef.current) {
            debouncedInitRef.current(initNWC);
          }
        }, backoffTime);
      } else {
        console.error('Max reconnection attempts reached');
        if (mountedRef.current) {
          dispatch({ 
            type: 'SET_ERROR', 
            error: new Error(`Failed to establish connection after ${MAX_RECONNECT_ATTEMPTS} attempts. Please check your NWC connection string and try again.`) 
          });
        }
      }
    }
  }, [nwcString, cleanup]);

  // Initialize NWC when connection string changes
  useEffect(() => {
    mountedRef.current = true;
    // Capture the ref value in a variable
    const debouncedInit = debouncedInitRef.current;

    const init = async () => {
      if (!mountedRef.current) return;
      
      if (nwcString) {
        await debouncedInit(initNWC);
      } else if (mountedRef.current && connectionStatusRef.current !== 'disconnected') {
        cleanup(true);
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      debouncedInit.cancel();
      cleanup(true);
    };
  }, [nwcString, initNWC, cleanup]);

  const connect = useCallback(async () => {
    if (connectionStatusRef.current === 'connected') return;
    reconnectAttemptsRef.current = 0;
    await initNWC();
  }, [initNWC]);

  const disconnect = useCallback(() => {
    cleanup(true);
  }, [cleanup]);

  const reconnect = useCallback(async () => {
    cleanup(true);
    reconnectAttemptsRef.current = 0;
    await initNWC();
  }, [initNWC, cleanup]);

  return (
    <NWCContext.Provider 
      value={{ 
        ...state,
        connect, 
        disconnect, 
        reconnect
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
