import NDK, { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { MusicEvent, MusicEventData, Track } from "@/types/nostr";

export async function publishMusicEvent(
  ndk: NDK,
  {
    title,
    artist,
    fileUrl,
    duration,
    price,
    freeSeconds,
    lightningAddress,
  }: MusicEventData
): Promise<NDKEvent> {
  const event = new NDKEvent(ndk);
  event.kind = 4100 as NDKKind;
  event.tags = [
    ["t", "music"],
    ["title", title],
    ["artist", artist],
    ["file_url", fileUrl],
    ["duration", duration.toString()],
    ["price", price.toString()],
    ["free_seconds", freeSeconds.toString()],
    ["lightning_address", lightningAddress],
  ];
  
  await event.publish();
  return event;
}

export function subscribeMusicEvents(ndk: NDK) {
  return ndk.subscribe(
    {
      kinds: [4100 as NDKKind],
      "#t": ["music"],
    },
    { closeOnEose: false }
  );
}

export function parseEventToTrack(event: MusicEvent): Track {
  const getTagValue = (name: string) => {
    const tag = event.tags.find((t) => t[0] === name);
    return tag ? tag[1] : "";
  };

  return {
    title: getTagValue("title"),
    artist: getTagValue("artist"),
    url: getTagValue("file_url"),
    duration: parseInt(getTagValue("duration"), 10),
    price: parseInt(getTagValue("price"), 10),
    freeSeconds: parseInt(getTagValue("free_seconds"), 10),
    lightningAddress: getTagValue("lightning_address"),
    pubkey: event.pubkey,
    eventId: event.id,
  };
}

export function validateMusicEvent(event: NDKEvent): event is MusicEvent {
  if (event.kind !== 4100) return false;

  const requiredTags = [
    "t",
    "title",
    "artist",
    "file_url",
    "duration",
    "price",
    "free_seconds",
    "lightning_address",
  ];

  return requiredTags.every((tag) =>
    event.tags.some((t) => t[0] === tag && t[1])
  );
}
