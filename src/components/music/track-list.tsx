"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind, NDKSubscription } from "@nostr-dev-kit/ndk";
import { useNostr } from "@/components/providers/nostr-provider";
import { useAudioStore } from "@/lib/store/audio-store";
import { parseEventToTrack, validateMusicEvent, deleteMusicEvent } from "@/lib/nostr/music-events";
import { Track } from "@/types/nostr";
import Image from "next/image";
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

// Shared subscription and track state across all MusicFeed instances
let sharedSubscription: NDKSubscription | null = null;
let sharedTracksMap = new Map<string, Track>();
let sharedKnownEventIds = new Set<string>();
let activeInstances = 0;

interface MusicFeedProps {
  userOnly?: boolean;
  // Optional ID to identify this feed instance
  id?: string;
}

export function MusicFeed({ userOnly, id = 'default' }: MusicFeedProps) {
  const { ndk, publicKey } = useNostr();
  const [tracks, setTracks] = useState<Track[]>([]);
  const { 
    setCurrentTrack, 
    setIsPlaying, 
    currentTrack, 
    isPlaying
  } = useAudioStore();
  
  // Keep track of this component instance's filter
  const instanceRef = useRef({
    id,
    userOnly,
    publicKey
  });
  
  // Update ref when props change
  useEffect(() => {
    instanceRef.current = { id, userOnly, publicKey };
  }, [id, userOnly, publicKey]);

  // Function to filter tracks based on this instance's criteria
  const filterTracksForInstance = useCallback(() => {
    const filteredTracks = Array.from(sharedTracksMap.values()).filter(track => {
      // If userOnly is true, only show tracks from the current user
      if (instanceRef.current.userOnly) {
        return track.pubkey === instanceRef.current.publicKey;
      }
      return true;
    });
    
    setTracks(filteredTracks);
  }, []);

  useEffect(() => {
    if (!ndk) {
      console.info(`Track subscription skipped for instance ${id} - NDK not available`);
      return;
    }

    // Increment active instances counter
    activeInstances++;
    console.info(`MusicFeed instance ${id} mounted (${activeInstances} active instances)`);
    
    // Create shared subscription if it doesn't exist
    if (!sharedSubscription) {
      console.info('Creating shared track subscription');
      
      // Create a single subscription for both music events and their deletions
      sharedSubscription = ndk.subscribe(
        [
          // Music events
          {
            kinds: [23 as NDKKind],
            "#t": ["music"],
          },
          // Deletion events - we'll filter these in the handler
          {
            kinds: [5 as NDKKind],
          }
        ],
        { closeOnEose: false }
      );

      sharedSubscription.on("event", (event: NDKEvent) => {
        // Handle deletion events (kind 5)
        if (event.kind === 5) {
          // Get all e-tags (deleted event IDs)
          const deletedEventIds = event.tags
            .filter((t: string[]) => t[0] === 'e')
            .map((t: string[]) => t[1]);
          
          // Only process deletions for events we know about
          const relevantDeletions = deletedEventIds.filter(id => sharedKnownEventIds.has(id));
          
          if (relevantDeletions.length === 0) {
            // Skip processing if none of the deleted events are in our known set
            return;
          }
          
          let tracksChanged = false;
          
          // Process each relevant deletion
          for (const deletedId of relevantDeletions) {
            const trackToDelete = sharedTracksMap.get(deletedId);
            
            // Only process if deletion was requested by the track owner
            if (trackToDelete && event.pubkey === trackToDelete.pubkey) {
              console.info('Track deletion processed:', deletedId);
              sharedTracksMap.delete(deletedId);
              sharedKnownEventIds.delete(deletedId);
              tracksChanged = true;
            } else {
              console.info('Unauthorized deletion attempt:', {
                deletedEventId: deletedId,
                requestedBy: event.pubkey
              });
            }
          }
          
          // Update all active instances if tracks changed
          if (tracksChanged) {
            filterTracksForInstance();
          }
          
          return;
        }
        
        // Handle music events (kind 23)
        if (event.kind === 23 && validateMusicEvent(event)) {
          // Skip if we've already processed this event
          if (sharedKnownEventIds.has(event.id)) {
            return;
          }
          
          // Add to known events
          sharedKnownEventIds.add(event.id);
          
          // Parse and store the track
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
          
          sharedTracksMap.set(event.id, track);
          
          // Update this instance's tracks
          filterTracksForInstance();
        } else if (event.kind === 23) {
          console.info('Invalid music event received:', {
            id: event.id,
            kind: event.kind,
            tags: event.tags
          });
        }
      });
    } else {
      console.info(`Using existing shared subscription for instance ${id}`);
      // If subscription already exists, just update this instance's tracks
      filterTracksForInstance();
    }

    // Cleanup on unmount
    return () => {
      activeInstances--;
      console.info(`MusicFeed instance ${id} unmounted (${activeInstances} active instances remaining)`);
      
      // Only clean up shared subscription when all instances are unmounted
      if (activeInstances === 0 && sharedSubscription) {
        console.info('Cleaning up shared track subscription');
        sharedSubscription.removeAllListeners();
        sharedSubscription.stop();
        sharedSubscription = null;
        
        // Reset shared state
        sharedTracksMap = new Map<string, Track>();
        sharedKnownEventIds = new Set<string>();
      }
    };
  }, [ndk, id, filterTracksForInstance]);
  
  // Update filtered tracks when userOnly or publicKey changes
  useEffect(() => {
    filterTracksForInstance();
  }, [userOnly, publicKey, filterTracksForInstance]);

  const handleDelete = async (track: Track) => {
    if (!ndk) return;
    
    try {
      await deleteMusicEvent(ndk, track.eventId);
      
      // Update local state immediately for better UX
      setTracks(tracks.filter(t => t.eventId !== track.eventId));
      
      // Also update shared state
      sharedTracksMap.delete(track.eventId);
      sharedKnownEventIds.delete(track.eventId);
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
          <CardContent className="p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex flex-col md:flex-row gap-4 w-full">
              {track.image && (
                <div className="flex-shrink-0 mx-auto md:mx-0">
                  <Image 
                    src={track.image} 
                    alt={`${track.title} cover`} 
                    width={200}
                    height={200}
                    className="w-full max-w-[200px] md:w-20 md:h-20 aspect-square object-cover rounded-md"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      // Hide image on error
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex-grow text-center md:text-left">
                <h3 className="font-medium">{track.title}</h3>
                <p className="text-sm text-muted-foreground">{track.artist}</p>
                {track.album && (
                  <p className="text-sm text-muted-foreground">Album: {track.album}</p>
                )}
                <p className="text-xs text-muted-foreground break-all">{track.url}</p>
                {track.license && (
                  <p className="text-xs text-muted-foreground">License: {track.license}</p>
                )}
                {track.content && (
                  <p className="text-xs text-muted-foreground mt-2">{track.content}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2 justify-center md:justify-start">
                  <Badge variant="secondary">~{track.price} sats</Badge>
                  <Badge variant="outline">{track.freeSeconds}s free preview</Badge>
                  {track.splits && track.splits.length > 0 && (
                    <Badge variant="outline" className="cursor-help" title={
                      `Payment splits: ${track.splits.map(s => `${s.lightningAddress} (${s.percentage}%)`).join(', ')}`
                    }>
                      {track.splits.length} payment split{track.splits.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-center md:justify-start mt-3 md:mt-0">
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
