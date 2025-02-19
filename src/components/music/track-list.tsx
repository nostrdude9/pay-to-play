"use client";

import { useEffect, useState } from "react";
import { useNostr } from "@/components/providers/nostr-provider";
import { useAudioStore } from "@/lib/store/audio-store";
import { subscribeMusicEvents, parseEventToTrack, validateMusicEvent } from "@/lib/nostr/music-events";
import { Track } from "@/types/nostr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

interface MusicFeedProps {
  userOnly?: boolean;
}

export function MusicFeed({ userOnly }: MusicFeedProps) {
  const { ndk, publicKey } = useNostr();
  const [tracks, setTracks] = useState<Track[]>([]);
  const { setCurrentTrack, setIsPlaying, currentTrack } = useAudioStore();

  useEffect(() => {
    if (!ndk) return;

    const sub = subscribeMusicEvents(ndk);
    const tracks = new Map<string, Track>();

    sub.on("event", (event) => {
      if (validateMusicEvent(event)) {
        // If userOnly is true, only show tracks from the current user
        if (!userOnly || event.pubkey === publicKey) {
          const track = parseEventToTrack(event);
          tracks.set(event.id, track);
          setTracks(Array.from(tracks.values()));
        }
      }
    });

    // Cleanup subscription on unmount
    return () => {
      sub.removeAllListeners();
    };
  }, [ndk, publicKey, userOnly]);

  const playTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  if (!tracks.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {userOnly 
          ? "You haven't published any tracks yet. Try uploading one!"
          : "No tracks found. Try publishing one!"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tracks.map((track) => (
        <Card key={track.eventId}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">{track.title}</h3>
              <p className="text-sm text-muted-foreground">{track.artist}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">{track.price} sats</Badge>
                <Badge variant="outline">{track.freeSeconds}s free preview</Badge>
              </div>
            </div>
            <Button
              onClick={() => playTrack(track)}
              variant={currentTrack?.eventId === track.eventId ? "secondary" : "default"}
            >
              {currentTrack?.eventId === track.eventId ? "Playing" : "Play"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
