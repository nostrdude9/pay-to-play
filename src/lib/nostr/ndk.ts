import NDK, { NDKSigner } from '@nostr-dev-kit/ndk';

// Single instance of NDK
let ndkInstance: NDK | null = null;
let currentSignerPubkey: string | null = null;

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'ws://localhost:8008',
];

/**
 * Disconnects and cleans up the current NDK instance
 */
async function cleanupNDK() {
  if (ndkInstance) {
    try {
      // Disconnect from all relays
      for (const relay of ndkInstance.pool.relays.values()) {
        await relay.disconnect();
      }
      console.info('NDK connections closed');
    } catch (err) {
      console.error('Error closing NDK connections:', err);
    }
    ndkInstance = null;
  }
}

/**
 * Creates a new NDK instance with the provided signer
 */
function createNDK(signer?: NDKSigner): NDK {
  return new NDK({
    signer,
    explicitRelayUrls: DEFAULT_RELAYS,
  });
}

/**
 * Gets or creates an NDK instance
 * Will create a new instance if:
 * - No instance exists
 * - A different signer is provided
 */
export async function getNDK(signer?: NDKSigner): Promise<NDK> {
  // If we have a signer with a user method, get the pubkey
  let signerPubkey: string | null = null;
  if (signer?.user) {
    try {
      const user = await signer.user();
      signerPubkey = user.pubkey;
    } catch (err) {
      console.error('Error getting user pubkey:', err);
    }
  }
  
  // Determine if we need a new instance
  const needsNewInstance = 
    !ndkInstance || 
    (signerPubkey && signerPubkey !== currentSignerPubkey);
  
  if (needsNewInstance) {
    // Clean up existing instance if any
    await cleanupNDK();
    
    // Create new instance
    ndkInstance = createNDK(signer);
    currentSignerPubkey = signerPubkey;
    
    console.info('Created new NDK instance', { 
      hasSigner: !!signer,
      signerPubkey: signerPubkey || 'none'
    });
  } else if (signer && ndkInstance) {
    // Update signer on existing instance
    ndkInstance.signer = signer;
  }
  
  // At this point, ndkInstance should never be null
  return ndkInstance as NDK;
}

/**
 * Initializes and connects the NDK instance
 */
export async function initNDK(signer?: NDKSigner): Promise<NDK> {
  const ndk = await getNDK(signer);
  
  // Connect to relays
  try {
    await ndk.connect();
    console.info('NDK connected to relays');
  } catch (err) {
    console.error('Error connecting to relays:', err);
  }
  
  return ndk;
}
