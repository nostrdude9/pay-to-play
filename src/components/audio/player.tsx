"use client";

import { useEffect, useRef } from "react";
import { useAudioStore } from "@/lib/store/audio-store";
import { usePaymentManager } from "@/lib/hooks/use-payment-manager";
import { Play, Pause, Volume2, VolumeX, Zap } from "lucide-react";
import { useNWC } from "@/components/providers/nwc-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    currentTrack,
    payment,
    setAudioElement,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    updatePaymentState,
  } = useAudioStore();

  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      setAudioElement(audio);
      
      // Enhanced error handling
      audio.onerror = () => {
        console.error('Audio error:', {
          error: audio.error,
          code: audio.error?.code,
          message: audio.error?.message,
          currentTrack: currentTrack?.title,
          networkState: audio.networkState,
          readyState: audio.readyState
        });
      };

      // Detailed event logging for debugging
      audio.onloadstart = () => {
        console.info('Audio loading started:', {
          track: currentTrack?.title,
          url: currentTrack?.url,
          metadata: currentTrack ? {
            price: currentTrack.price,
            duration: currentTrack.duration,
            freeSeconds: currentTrack.freeSeconds,
            lightningAddress: currentTrack.lightningAddress
          } : null,
          readyState: audio.readyState
        });
      };

      audio.onprogress = () => {
        console.info('Audio download progress:', {
          track: currentTrack?.title,
          buffered: audio.buffered.length > 0 ? {
            start: audio.buffered.start(0),
            end: audio.buffered.end(0)
          } : null,
          readyState: audio.readyState
        });
      };

      audio.oncanplay = () => {
        console.info('Audio ready to play:', {
          track: currentTrack?.title,
          duration: audio.duration,
          readyState: audio.readyState,
          currentTime: audio.currentTime,
          paused: audio.paused
        });
      };

      audio.onplay = () => {
        console.info('Audio play event:', {
          track: currentTrack?.title,
          currentTime: audio.currentTime,
          duration: audio.duration
        });
      };

      audio.onpause = () => {
        console.info('Audio pause event:', {
          track: currentTrack?.title,
          currentTime: audio.currentTime,
          duration: audio.duration
        });
      };

      audio.onseeking = () => {
        console.info('Audio seeking:', {
          track: currentTrack?.title,
          currentTime: audio.currentTime,
          duration: audio.duration
        });
      };

      audio.onseeked = () => {
        console.info('Audio seeked:', {
          track: currentTrack?.title,
          currentTime: audio.currentTime,
          duration: audio.duration
        });
      };

      // Set initial volume
      audio.volume = volume;

      return () => {
        console.info('Cleaning up audio element:', {
          track: currentTrack?.title
        });
        audio.pause();
        audio.src = '';
        audio.load();
        setIsPlaying(false);
      };
    }
  }, [setAudioElement, volume, setIsPlaying]);

  // Effect for handling play/pause state
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;

    if (isPlaying) {
      audioRef.current.play().catch(error => {
        console.error('Playback failed:', {
          error: error.message,
          track: currentTrack.title,
          currentTime: audioRef.current?.currentTime
        });
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  // Effect for initializing payment state when track changes
  useEffect(() => {
    if (!currentTrack || !audioRef.current) return;

    const startTime = audioRef.current.currentTime;
    const isInFreePeriod = startTime <= currentTrack.freeSeconds;

    console.info('Initializing payment state for track:', {
      track: currentTrack.title,
      startTime,
      isInFreePeriod,
      freeSeconds: currentTrack.freeSeconds
    });

    updatePaymentState({
      isInFreePeriod,
      remainingFreeSeconds: Math.max(0, currentTrack.freeSeconds - startTime),
      nextPaymentDue: isInFreePeriod ? 0 : Date.now(),
      lastPaymentStatus: "none"
    });
  }, [currentTrack, updatePaymentState]);

  const handleTimeUpdate = () => {
    if (!audioRef.current || !currentTrack) return;
    
    const newTime = audioRef.current.currentTime;
    setCurrentTime(newTime);

    // Only update payment state if necessary
    if (payment.isInFreePeriod) {
      if (newTime >= currentTrack.freeSeconds) {
        // Exit free preview period
        console.info('Free preview period ended:', {
          track: currentTrack.title,
          currentTime: newTime,
          freeSeconds: currentTrack.freeSeconds
        });
        
        updatePaymentState({
          isInFreePeriod: false,
          remainingFreeSeconds: 0,
          nextPaymentDue: Date.now(),
          lastPaymentStatus: "none"
        });
      } else {
        // Update remaining free seconds only if changed
        const remainingFree = Math.max(0, currentTrack.freeSeconds - Math.floor(newTime));
        if (remainingFree !== payment.remainingFreeSeconds) {
          updatePaymentState({
            remainingFreeSeconds: remainingFree
          });
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      console.info('Audio metadata loaded:', {
        track: currentTrack?.title,
        duration: audioDuration,
        metadata: currentTrack ? {
          price: currentTrack.price,
          configuredDuration: currentTrack.duration,
          freeSeconds: currentTrack.freeSeconds,
          lightningAddress: currentTrack.lightningAddress
        } : null
      });
      setDuration(audioDuration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current && currentTrack) {
      const newTime = value[0];
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);

      // Update payment state based on seek position
      const isInFreePeriod = newTime <= currentTrack.freeSeconds;
      console.info('Seek operation:', {
        track: currentTrack.title,
        from: currentTime,
        to: newTime,
        freeSeconds: currentTrack.freeSeconds,
        willBeInFreePeriod: isInFreePeriod
      });

      // If seeking between free/paid sections, update payment state
      if (isInFreePeriod !== payment.isInFreePeriod) {
        console.info('Seek crosses payment boundary:', {
          track: currentTrack.title,
          from: {
            time: currentTime,
            isInFreePeriod: payment.isInFreePeriod
          },
          to: {
            time: newTime,
            isInFreePeriod
          }
        });

        updatePaymentState({
          isInFreePeriod,
          remainingFreeSeconds: isInFreePeriod ? 
            Math.max(0, currentTrack.freeSeconds - Math.floor(newTime)) : 
            0,
          nextPaymentDue: isInFreePeriod ? 0 : Date.now(),
          lastPaymentStatus: isInFreePeriod ? "none" : payment.lastPaymentStatus
        });
      }
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setVolume(newVolume);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const { isInFreePeriod, remainingFreeSeconds, lastPaymentStatus, currentRate } =
    usePaymentManager();
  const { isConnected: nwcConnected, connect: connectNWC } = useNWC();

  if (!currentTrack) return null;

  const canPlay = isInFreePeriod || nwcConnected;

  return (
    <Card className="fixed bottom-0 left-0 right-0 border-t">
      <CardContent className="p-4 space-y-2">
        <audio
          ref={audioRef}
          src={currentTrack.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          crossOrigin="anonymous"
          preload="auto"
        />
        {currentTrack.price > 0 && (
          <>
          <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {isInFreePeriod ? (
                <span className="text-green-500">
                  Free preview: {remainingFreeSeconds}s remaining
                </span>
              ) : (
                <>
                  <span>Rate: {currentRate} sats/sec</span>
                  <span>•</span>
                  <span
                    className={`${
                      lastPaymentStatus === "success"
                        ? "text-green-500"
                        : lastPaymentStatus === "failed"
                        ? "text-destructive"
                        : lastPaymentStatus === "pending"
                        ? "text-yellow-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {lastPaymentStatus === "success"
                      ? "Payment successful"
                      : lastPaymentStatus === "failed"
                      ? "Payment failed"
                      : lastPaymentStatus === "pending"
                      ? "Processing payment..."
                      : "Ready to play"}
                  </span>
                </>
              )}
            </div>
            {!nwcConnected && !isInFreePeriod && (
              <Button
                onClick={connectNWC}
                variant="secondary"
                size="sm"
                className="gap-1"
              >
                <Zap className="w-4 h-4" />
                Connect NWC
              </Button>
            )}
          </div>
          <Separator className="my-2" />
          </>
        )}
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={togglePlay}
                  disabled={!canPlay}
                  variant="ghost"
                  size="icon"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isPlaying ? "Pause" : "Play"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex-1">
            <div className="mb-2 flex justify-between text-sm">
              <span>{currentTrack.title}</span>
              <span className="text-muted-foreground">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            <Slider
              min={0}
              max={duration || 100}
              value={[currentTime]}
              onValueChange={handleSeek}
              className="w-full"
              aria-label="Track progress"
              disabled={!duration}
            />
          </div>

          <div className="flex items-center gap-2 w-32">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleVolumeChange([volume === 0 ? 1 : 0])}
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Volume</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Slider
              min={0}
              max={1}
              step={0.1}
              value={[volume]}
              onValueChange={handleVolumeChange}
              className="w-20"
              aria-label="Volume"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
