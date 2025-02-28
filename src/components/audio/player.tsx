"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useAudioStore } from "@/lib/store/audio-store";
import { usePaymentManager } from "@/lib/hooks/use-payment-manager";
import { Play, Pause, Volume2, VolumeX, Zap } from "lucide-react";
import Image from "next/image";
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

interface AudioPlayerProps {
  isDashboard?: boolean;
}

export function AudioPlayer({ isDashboard = false }: AudioPlayerProps) {
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
  
  // State to track if audio is ready to play
  const [isAudioReady, setIsAudioReady] = useState(false);
  // State to track if we're currently in a play/pause transition
  const [isTransitioning, setIsTransitioning] = useState(false);
  // Ref to track the last play/pause operation time to prevent rapid toggles
  const lastOperationTimeRef = useRef(0);
  // Ref to track retry attempts for play operations
  const playRetryCountRef = useRef(0);
  const MAX_PLAY_RETRIES = 3;

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
  }, [setAudioElement, volume, setIsPlaying, currentTrack]);

  // Effect for handling play/pause state with improved state management
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    
    // Prevent rapid toggles by checking time since last operation
    const now = Date.now();
    const timeSinceLastOperation = now - lastOperationTimeRef.current;
    if (timeSinceLastOperation < 300) { // 300ms debounce
      return;
    }
    
    // Update last operation time
    lastOperationTimeRef.current = now;
    
    const audio = audioRef.current;
    
    // Function to handle play with retry logic
    const attemptPlay = async () => {
      if (!audio || !currentTrack) return;
      
      // Only proceed if we're not already transitioning
      if (isTransitioning) return;
      
      try {
        setIsTransitioning(true);
        
        // Check if audio is actually ready
        if (audio.readyState < 2) { // HAVE_CURRENT_DATA or higher
          console.info('Audio not ready yet, waiting...', {
            readyState: audio.readyState,
            track: currentTrack.title
          });
          
          // Wait for canplay event before attempting to play
          if (!isAudioReady) {
            return; // The canplay event handler will attempt play
          }
        }
        
        // Reset retry counter if this is a fresh play attempt
        if (playRetryCountRef.current === 0) {
          console.info('Attempting to play audio', {
            track: currentTrack.title,
            readyState: audio.readyState,
            currentTime: audio.currentTime
          });
        }
        
        // Attempt to play
        await audio.play();
        
        // Success - reset retry counter
        playRetryCountRef.current = 0;
        console.info('Playback started successfully', {
          track: currentTrack.title,
          currentTime: audio.currentTime
        });
      } catch (error) {
        console.error('Playback failed:', {
          error: error instanceof Error ? error.message : String(error),
          track: currentTrack.title,
          currentTime: audio.currentTime,
          retryCount: playRetryCountRef.current
        });
        
        // Implement retry logic
        if (playRetryCountRef.current < MAX_PLAY_RETRIES) {
          playRetryCountRef.current++;
          console.info(`Retrying play operation (${playRetryCountRef.current}/${MAX_PLAY_RETRIES})...`);
          
          // Small delay before retry
          setTimeout(() => {
            if (isPlaying) { // Only retry if we still want to be playing
              attemptPlay();
            }
          }, 500);
        } else {
          // Max retries reached, reset state
          playRetryCountRef.current = 0;
          setIsPlaying(false);
        }
      } finally {
        setIsTransitioning(false);
      }
    };
    
    // Handle play/pause based on isPlaying state
    if (isPlaying) {
      attemptPlay();
    } else {
      // For pause, we don't need complex retry logic
      audio.pause();
      console.info('Playback paused', {
        track: currentTrack.title,
        currentTime: audio.currentTime
      });
    }
  }, [isPlaying, currentTrack, setIsPlaying, isAudioReady, isTransitioning]);

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
    
    // Reset audio ready state when track changes
    setIsAudioReady(false);
  }, [currentTrack, updatePaymentState]);

  const handleTimeUpdate = useCallback(() => {
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
  }, [currentTrack, payment.isInFreePeriod, payment.remainingFreeSeconds, setCurrentTime, updatePaymentState]);

  const handleLoadedMetadata = useCallback(() => {
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
        } : null,
        readyState: audioRef.current.readyState
      });
      setDuration(audioDuration);
    }
  }, [currentTrack, setDuration]);
  
  // Handle canplay event to track when audio is ready to play
  const handleCanPlay = useCallback(() => {
    if (!audioRef.current) return;
    
    console.info('Audio can play:', {
      track: currentTrack?.title,
      readyState: audioRef.current.readyState,
      currentTime: audioRef.current.currentTime
    });
    
    setIsAudioReady(true);
    
    // If we're supposed to be playing but aren't, try to play now
    if (isPlaying && audioRef.current.paused && !isTransitioning) {
      console.info('Auto-starting playback after canplay event');
      audioRef.current.play().catch(error => {
        console.error('Auto-play failed after canplay:', {
          error: error instanceof Error ? error.message : String(error),
          track: currentTrack?.title
        });
        setIsPlaying(false);
      });
    }
  }, [currentTrack, isPlaying, isTransitioning, setIsPlaying]);

  const handleSeek = useCallback((value: number[]) => {
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
  }, [currentTime, currentTrack, payment.isInFreePeriod, payment.lastPaymentStatus, setCurrentTime, updatePaymentState]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = value[0];
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setVolume(newVolume);
  }, [setVolume]);

  const togglePlay = useCallback(() => {
    // Prevent rapid toggles
    const now = Date.now();
    if (now - lastOperationTimeRef.current < 300) { // 300ms debounce
      console.info('Ignoring rapid play/pause toggle');
      return;
    }
    
    // Update last operation time
    lastOperationTimeRef.current = now;
    
    // Reset play retry counter on toggle
    playRetryCountRef.current = 0;
    
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const { isInFreePeriod, remainingFreeSeconds, lastPaymentStatus, totalCost, currentPayment, totalPaid } =
    usePaymentManager();
  const { isConnected: nwcConnected, connect: connectNWC } = useNWC();

  if (!currentTrack) return null;

  const canPlay = isInFreePeriod || nwcConnected;

  return (
    <Card className="fixed bottom-0 left-0 right-0 border-t">
      <CardContent className="p-4 space-y-4">
        <audio
          ref={audioRef}
          src={currentTrack.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={handleCanPlay}
          crossOrigin="anonymous"
          preload="auto"
        />
        
        {/* Mobile layout */}
        <div className="md:hidden">
          {isDashboard ? (
            /* Dashboard mobile layout - Stacked vertically */
            <>
              {/* Cover art - Full width on mobile */}
              {currentTrack.image && (
                <div className="w-full mb-4">
                  <Image 
                    src={currentTrack.image} 
                    alt={`${currentTrack.title} cover`} 
                    width={300}
                    height={300}
                    className="w-full max-w-[300px] aspect-square object-cover rounded-md mx-auto"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              {/* Track info */}
              <div className="mb-3 text-center">
                <h3 className="font-medium text-lg">{currentTrack.title}</h3>
                <p className="text-sm text-muted-foreground">{currentTrack.artist}</p>
                {currentTrack.album && (
                  <p className="text-sm text-muted-foreground">Album: {currentTrack.album}</p>
                )}
              </div>
              
              {/* Payment info */}
              {currentTrack.price > 0 && (
                <div className="mb-3 text-sm">
                  <div className="flex flex-col items-center gap-2">
                    {isInFreePeriod ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-green-500 cursor-help">
                              Free preview: {remainingFreeSeconds}s remaining (Est. total: ~{totalCost} sats)
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Due to payment rounding, actual total paid ({totalPaid} sats) might be slightly higher than estimated</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">Cost: {currentPayment}/~{totalCost} sats</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Due to payment rounding, actual total paid ({totalPaid} sats) might be slightly higher than estimated</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                    
                    {!nwcConnected && !isInFreePeriod && (
                      <Button
                        onClick={connectNWC}
                        variant="secondary"
                        size="sm"
                        className="gap-1 mt-2"
                      >
                        <Zap className="w-4 h-4" />
                        Connect NWC
                      </Button>
                    )}
                  </div>
                  <Separator className="my-3" />
                </div>
              )}
              
              {/* Playback controls */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {formatTime(currentTime)}
                  </span>
                  <Slider
                    min={0}
                    max={duration || 100}
                    value={[currentTime]}
                    onValueChange={handleSeek}
                    className="flex-1"
                    aria-label="Track progress"
                    disabled={!duration}
                  />
                  <span className="text-sm text-muted-foreground w-16">
                    {formatTime(duration)}
                  </span>
                </div>
                
                <div className="flex justify-center items-center gap-6">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={togglePlay}
                          disabled={!canPlay}
                          variant="ghost"
                          size="icon"
                          className="h-12 w-12"
                        >
                          {isPlaying ? (
                            <Pause className="w-8 h-8" />
                          ) : (
                            <Play className="w-8 h-8" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isPlaying ? "Pause" : "Play"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <div className="flex items-center gap-2">
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
                      className="w-24"
                      aria-label="Volume"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Bottom player mobile layout - Compact horizontal */
            <div className="flex items-center gap-2">
              {/* Small cover art */}
              {currentTrack.image && (
                <div className="flex-shrink-0">
                  <Image 
                    src={currentTrack.image} 
                    alt={`${currentTrack.title} cover`} 
                    width={48}
                    height={48}
                    className="w-12 h-12 object-cover rounded-md"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              {/* Track info and controls */}
              <div className="flex-1 min-w-0">
                {/* Track title and artist */}
                <div className="mb-1 text-left">
                  <h3 className="font-medium text-sm truncate">{currentTrack.title}</h3>
                  <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
                </div>
                
                {/* Progress bar */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground w-8">
                    {formatTime(currentTime)}
                  </span>
                  <Slider
                    min={0}
                    max={duration || 100}
                    value={[currentTime]}
                    onValueChange={handleSeek}
                    className="flex-1"
                    aria-label="Track progress"
                    disabled={!duration}
                  />
                  <span className="text-xs text-muted-foreground w-8">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
              
              {/* Controls */}
              <div className="flex items-center gap-2">
                {/* Play/Pause button */}
                <Button
                  onClick={togglePlay}
                  disabled={!canPlay}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
                
                {/* Volume control */}
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleVolumeChange([volume === 0 ? 1 : 0])}
                >
                  {volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              {/* Payment status indicator - small icon only */}
              {currentTrack.price > 0 && !isInFreePeriod && (
                <div className="ml-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`w-2 h-2 rounded-full ${
                          lastPaymentStatus === "success"
                            ? "bg-green-500"
                            : lastPaymentStatus === "failed"
                            ? "bg-destructive"
                            : lastPaymentStatus === "pending"
                            ? "bg-yellow-500"
                            : "bg-muted"
                        }`} />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {isInFreePeriod 
                            ? `Free preview: ${remainingFreeSeconds}s remaining` 
                            : `Cost: ${currentPayment}/~${totalCost} sats`}
                        </p>
                        <p>
                          {lastPaymentStatus === "success"
                            ? "Payment successful"
                            : lastPaymentStatus === "failed"
                            ? "Payment failed"
                            : lastPaymentStatus === "pending"
                            ? "Processing payment..."
                            : "Ready to play"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Desktop layout - Horizontal */}
        <div className="hidden md:block">
          {currentTrack.price > 0 && (
            <>
            <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {isInFreePeriod ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-green-500 cursor-help">
                          Free preview: {remainingFreeSeconds}s remaining (Est. total: ~{totalCost} sats)
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Due to payment rounding, actual total paid ({totalPaid} sats) might be slightly higher than estimated</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">Cost: {currentPayment}/~{totalCost} sats</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Due to payment rounding, actual total paid ({totalPaid} sats) might be slightly higher than estimated</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
            {/* Cover art - Small on desktop */}
            {currentTrack.image && (
              <div className="flex-shrink-0">
                <Image 
                  src={currentTrack.image} 
                  alt={`${currentTrack.title} cover`} 
                  width={64}
                  height={64}
                  className="w-16 h-16 object-cover rounded-md"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            
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
        </div>
      </CardContent>
    </Card>
  );
}
