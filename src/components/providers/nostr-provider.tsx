"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import NDK, { NDKFilter, NDKKind } from "@nostr-dev-kit/ndk";
import { initNDK } from "@/lib/nostr/ndk";
import { NDKNip07Signer } from "@nostr-dev-kit/ndk";

interface ProfileData {
  name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

interface NostrContextType {
  ndk: NDK | null;
  signer: NDKNip07Signer | null;
  publicKey: string | null;
  profileData: ProfileData | null;
  isLoading: boolean;
  error: Error | null;
  login: () => Promise<void>;
  nwcString: string | null;
  saveNwcConnection: (connectionString: string) => void;
  removeNwcConnection: () => void;
}

const NostrContext = createContext<NostrContextType>({
  ndk: null,
  signer: null,
  publicKey: null,
  profileData: null,
  isLoading: true,
  error: null,
  login: async () => {},
  nwcString: null,
  saveNwcConnection: () => {},
  removeNwcConnection: () => {},
});

export function NostrProvider({ children }: { children: ReactNode }) {
  const [ndk, setNDK] = useState<NDK | null>(null);
  const [signer, setSigner] = useState<NDKNip07Signer | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nwcString, setNwcString] = useState<string | null>(null);

  const login = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (typeof window === "undefined" || !window.nostr) {
        throw new Error("No Nostr extension found");
      }

      const nip07signer = new NDKNip07Signer();
      await nip07signer.blockUntilReady();
      const user = await nip07signer.user();
      
      const ndkInstance = await initNDK(nip07signer);
      
      setNDK(ndkInstance);
      setSigner(nip07signer);
      setPublicKey(user.pubkey);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to login with Nostr"));
      // Reset state on error
      setNDK(null);
      setSigner(null);
      setPublicKey(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch profile data when we have a public key
  useEffect(() => {
    if (!ndk || !publicKey) return;

    async function fetchProfile() {
      if (!ndk || !publicKey) return;
      
      try {
        const filter: NDKFilter = {
          kinds: [0 as NDKKind],
          authors: [publicKey as string]
        };
        const profileEvent = await ndk.fetchEvent(filter);
        
        if (profileEvent) {
          try {
            const content = JSON.parse(profileEvent.content);
            setProfileData({
              name: content.name,
              picture: content.picture,
              about: content.about,
              nip05: content.nip05
            });
          } catch (e) {
            console.error('Failed to parse profile content:', e);
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    }

    fetchProfile();
  }, [ndk, publicKey]);

  const saveNwcConnection = (connectionString: string) => {
    setNwcString(connectionString);
    localStorage.setItem('nwc-connection', connectionString);
  };

  const removeNwcConnection = () => {
    setNwcString(null);
    localStorage.removeItem('nwc-connection');
  };

  // Load saved NWC connection on mount
  useEffect(() => {
    const savedConnection = localStorage.getItem('nwc-connection');
    if (savedConnection) {
      setNwcString(savedConnection);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const ndkInstance = await initNDK();
        setNDK(ndkInstance);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to initialize Nostr"));
      } finally {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      // Cleanup will be handled by NDK internally
    };
  }, []);

  return (
    <NostrContext.Provider value={{ 
      ndk, 
      signer, 
      publicKey, 
      profileData, 
      isLoading, 
      error, 
      login,
      nwcString,
      saveNwcConnection,
      removeNwcConnection
    }}>
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr() {
  const context = useContext(NostrContext);
  if (context === undefined) {
    throw new Error("useNostr must be used within a NostrProvider");
  }
  return context;
}
