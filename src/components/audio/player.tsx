"use client";

import { useEffect, useRef } from "react";
import { useAudioStore } from "@/lib/store/audio-store";
import { usePaymentManager } from "@/lib/hooks/use-payment-manager";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Zap } from "lucide-react";
import { useNWC } from "@/components/providers/nwc-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
    setAudioElement,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
  } = useAudioStore();

  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [setAudioElement]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
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

  const progressPercentage = (currentTime / duration) * 100;

  return (
    <Card className="fixed bottom-0 left-0 right-0 border-t">
      <CardContent className="p-4 space-y-2">
        <audio
          ref={audioRef}
          src={currentTrack.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
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
            <Progress value={progressPercentage} className="h-1" />
            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="w-full mt-2"
            />
          </div>

          <div className="flex items-center gap-2 w-32">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
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
              value={[volume]}
              max={1}
              step={0.01}
              onValueChange={handleVolumeChange}
              className="w-20"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
