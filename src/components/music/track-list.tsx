"use client";

import { useEffect, useState } from "react";
import { NDKKind } from "@nostr-dev-kit/ndk";
import { useNostr } from "@/components/providers/nostr-provider";
import { useAudioStore } from "@/lib/store/audio-store";
import { parseEventToTrack, validateMusicEvent, deleteMusicEvent } from "@/lib/nostr/music-events";
import { Track } from "@/types/nostr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MusicFeedProps {
  userOnly?: boolean;
}

export function MusicFeed({ userOnly }: MusicFeedProps) {
  const { ndk, publicKey } = useNostr();
  const [tracks, setTracks] = useState<Track[]>([]);
  const { 
    setCurrentTrack, 
    setIsPlaying, 
    currentTrack, 
    isPlaying
  } = useAudioStore();

  useEffect(() => {
    if (!ndk) {
      console.info('Track subscription skipped - NDK not available');
      return;
    }

    console.info('Starting track subscription');
    // Subscribe to both music events and deletion events
    const sub = ndk.subscribe(
      {
        kinds: [4100 as NDKKind, 5 as NDKKind],
        "#t": ["music"],
      },
      { closeOnEose: false }
    );

    const tracks = new Map<string, Track>();

    sub.on("event", (event) => {
      if (event.kind === 5) {
        // Handle deletion event
        const deletedEventId = event.tags.find(t => t[0] === 'e')?.[1];
        if (deletedEventId && tracks.has(deletedEventId)) {
          const trackToDelete = tracks.get(deletedEventId);
          // Only remove if deletion was requested by the track owner
          if (trackToDelete && event.pubkey === trackToDelete.pubkey) {
            console.info('Track deleted:', deletedEventId);
            tracks.delete(deletedEventId);
            setTracks(Array.from(tracks.values()));
          } else {
            console.info('Unauthorized deletion attempt:', {
              deletedEventId,
              requestedBy: event.pubkey
            });
          }
        }
      } else if (validateMusicEvent(event)) {
        // Handle music event
        // If userOnly is true, only show tracks from the current user
        if (!userOnly || event.pubkey === publicKey) {
          const track = parseEventToTrack(event);
          console.info('Track received:', {
            id: event.id,
            title: track.title,
            metadata: {
              price: track.price,
              duration: track.duration,
              freeSeconds: track.freeSeconds,
              lightningAddress: track.lightningAddress
            }
          });
          tracks.set(event.id, track);
          setTracks(Array.from(tracks.values()));
        }
      } else {
        console.info('Invalid music event received:', {
          id: event.id,
          kind: event.kind,
          tags: event.tags
        });
      }
    });

    // Cleanup subscription on unmount
    return () => {
      console.info('Cleaning up track subscription');
      sub.removeAllListeners();
    };
  }, [ndk, publicKey, userOnly]);

  const handleDelete = async (track: Track) => {
    if (!ndk) return;
    
    try {
      await deleteMusicEvent(ndk, track.eventId);
      setTracks(tracks.filter(t => t.eventId !== track.eventId));
    } catch (error) {
      console.error('Failed to delete track:', error);
    }
  };

  const playTrack = (track: Track) => {
    const isNewTrack = currentTrack?.eventId !== track.eventId;
    
    if (!isNewTrack && isPlaying) {
      // Just pausing current track
      console.info('Pausing track:', {
        title: track.title,
        url: track.url
      });
      setIsPlaying(false);
    } else {
      // Starting new track or resuming paused track
      console.info('Playing track:', {
        title: track.title,
        url: track.url,
        isNewTrack
      });

      if (isNewTrack) {
        setCurrentTrack(track);
      }
      
      setIsPlaying(true);
    }
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
              <p className="text-xs text-muted-foreground break-all">{track.url}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">~{track.price} sats</Badge>
                <Badge variant="outline">{track.freeSeconds}s free preview</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => playTrack(track)}
                variant={currentTrack?.eventId === track.eventId ? "secondary" : "default"}
                size="icon"
                className="rounded-full h-10 w-10"
              >
                {currentTrack?.eventId === track.eventId && isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              
              {userOnly && track.pubkey === publicKey && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="rounded-full h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Track</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete &ldquo;{track.title}&rdquo;? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(track)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
