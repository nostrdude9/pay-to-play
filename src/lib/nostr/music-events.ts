import NDK, { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { MusicEvent, MusicEventData, Split, Track } from "@/types/nostr";

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
    album,
    image,
    license,
    content,
    splits,
  }: MusicEventData
): Promise<NDKEvent> {
  // Server-side validation for price
  if (price > 1000) {
    throw new Error("Price cannot exceed 1000 sats");
  }

  const event = new NDKEvent(ndk);
  event.kind = 23 as NDKKind;
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
  
  // Add optional tags if they exist
  if (album) event.tags.push(["album", album]);
  if (image) event.tags.push(["image", image]);
  if (license) event.tags.push(["license", license]);
  
  // Add splits if they exist
  if (splits && splits.length > 0) {
    splits.forEach(split => {
      event.tags.push(["split", `${split.lightningAddress}:${split.percentage}`]);
    });
  }
  
  // Set content if provided
  if (content) {
    event.content = content;
  } else {
    event.content = ""; // Ensure content is not undefined
  }
  
  await event.publish();
  return event;
}

// Removed subscribeMusicEvents function as it's now handled directly in track-list.tsx

export function parseEventToTrack(event: MusicEvent): Track {
  const getTagValue = (name: string) => {
    const tag = event.tags.find((t) => t[0] === name);
    return tag ? tag[1] : "";
  };

  // Parse splits if they exist
  const splits: Split[] = [];
  event.tags
    .filter(t => t[0] === "split")
    .forEach(t => {
      const splitParts = t[1].split(":");
      if (splitParts.length === 2) {
        splits.push({
          lightningAddress: splitParts[0],
          percentage: parseInt(splitParts[1], 10)
        });
      }
    });

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
    // Optional fields
    album: getTagValue("album") || undefined,
    image: getTagValue("image") || undefined,
    license: getTagValue("license") || undefined,
    content: event.content || undefined,
    splits: splits.length > 0 ? splits : undefined
  };
}

export async function deleteMusicEvent(ndk: NDK, eventId: string): Promise<NDKEvent> {
  const event = new NDKEvent(ndk);
  event.kind = 5 as NDKKind;
  event.tags = [["e", eventId]];
  
  await event.publish();
  return event;
}

export function validateMusicEvent(event: NDKEvent): event is MusicEvent {
  if (event.kind !== 23) return false;

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
