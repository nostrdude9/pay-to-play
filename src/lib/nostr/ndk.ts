import NDK, { NDKSigner } from '@nostr-dev-kit/ndk';

let ndk: NDK | undefined;

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'ws://localhost:8008',
];

export function getNDK(signer?: NDKSigner) {
  if (!ndk) {
    ndk = new NDK({
      signer,
      explicitRelayUrls: DEFAULT_RELAYS,
    });
  } else if (signer) {
    ndk.signer = signer;
  }
  return ndk;
}

export async function initNDK(signer?: NDKSigner) {
  const ndkInstance = getNDK(signer);
  await ndkInstance.connect();
  return ndkInstance;
}
