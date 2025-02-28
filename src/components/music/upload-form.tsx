"use client";

import { useState, useEffect } from "react";
import { useNostr } from "@/components/providers/nostr-provider";
import { publishMusicEvent } from "@/lib/nostr/music-events";
import { MusicEventData } from "@/types/nostr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";

const splitSchema = z.object({
  lightningAddress: z.string().min(1, "Lightning address is required"),
  percentage: z.string().refine(
    (val) => !isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 100,
    "Percentage must be between 1 and 100"
  ),
});

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  artist: z.string().min(1, "Artist is required"),
  fileUrl: z.string().url("Must be a valid URL"),
  duration: z.string().refine(
    (val) => !isNaN(Number(val)) && Number(val) >= 1,
    "Duration must be a valid number and at least 1 second"
  ),
  price: z.string().refine(
    (val) => !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 1000,
    "Price must be between 0 and 1000 sats"
  ),
  freeSeconds: z.string().refine(
    (val) => !isNaN(Number(val)) && Number(val) >= 0,
    "Free preview must be a valid number and cannot be negative"
  ),
  lightningAddress: z.string().min(1, "Lightning address is required"),
  // Optional fields
  album: z.string().optional(),
  image: z.string().url("Must be a valid URL").optional().or(z.literal('')),
  license: z.string().optional(),
  content: z.string().optional(),
  splits: z.array(splitSchema).optional(),
}).refine((data) => {
  // If splits are provided, ensure total percentage doesn't exceed 100
  if (!data.splits || data.splits.length === 0) return true;
  
  const totalPercentage = data.splits.reduce(
    (sum, split) => sum + Number(split.percentage), 0
  );
  
  return totalPercentage <= 100;
}, {
  message: "Total split percentages cannot exceed 100%",
  path: ["splits"],
});

export function UploadForm() {
  const { ndk, publicKey } = useNostr();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDurationLoading, setIsDurationLoading] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      artist: "",
      fileUrl: "",
      duration: "",
      price: "",
      freeSeconds: "30",
      lightningAddress: "",
      album: "",
      image: "",
      license: "",
      content: "",
      splits: [],
    },
  });
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "splits",
  });

  const getDuration = async (url: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      
      // Set a timeout to prevent hanging if audio never loads
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while loading audio file"));
      }, 15000); // 15 second timeout
      
      // Function to clean up event listeners
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('canplaythrough', handleCanPlayThrough);
        audio.removeEventListener('error', handleError);
        clearTimeout(timeoutId);
      };
      
      // Try to get duration when metadata is loaded
      const handleLoadedMetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
          cleanup();
          resolve(Math.round(audio.duration));
        }
      };
      
      // Backup event in case loadedmetadata doesn't fire correctly
      const handleCanPlayThrough = () => {
        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
          cleanup();
          resolve(Math.round(audio.duration));
        }
      };
      
      // Handle errors
      const handleError = () => {
        cleanup();
        console.error('Audio error during duration calculation:', {
          error: audio.error,
          code: audio.error?.code,
          message: audio.error?.message,
          url,
          networkState: audio.networkState,
          readyState: audio.readyState
        });
        reject(new Error(`Failed to load audio file: ${audio.error?.message || 'Unknown error'}`));
      };
      
      // Add event listeners
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('canplaythrough', handleCanPlayThrough);
      audio.addEventListener('error', handleError);
      
      // Set crossOrigin to anonymous to handle CORS
      audio.crossOrigin = "anonymous";
      
      // Explicitly set the src attribute
      audio.src = url;
      
      // Call load() to start loading the audio
      audio.load();
      
      // Some browsers might need to play the audio to get the duration
      audio.volume = 0; // Mute it
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Auto-play was prevented, but that's okay for our purpose
          console.log("Auto-play prevented, but we can still get duration:", error);
        });
      }
    });
  };

  // Watch fileUrl changes and update duration automatically
  const fileUrl = form.watch('fileUrl');
  
  useEffect(() => {
    if (!fileUrl) return;
    
    let isActive = true; // For cleanup/cancellation
    
    const updateDuration = async () => {
      try {
        setIsDurationLoading(true);
        setDurationError(null);
        
        const duration = await getDuration(fileUrl);
        
        // Only update if component is still mounted and URL hasn't changed
        if (isActive) {
          console.log("Setting duration:", duration);
          form.setValue('duration', duration.toString(), { 
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true
          });
        }
      } catch (error) {
        if (isActive) {
          console.error("Duration calculation error:", error);
          setDurationError(error instanceof Error ? error.message : "Failed to get audio duration");
          form.setValue('duration', '');
        }
      } finally {
        if (isActive) {
          setIsDurationLoading(false);
        }
      }
    };

    updateDuration();
    
    // Cleanup function to prevent state updates if component unmounts
    return () => {
      isActive = false;
    };
  }, [fileUrl, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!ndk || !publicKey) return;

    try {
      setIsSubmitting(true);
      
      // Convert splits to the right format
      const splits = values.splits?.map(split => ({
        lightningAddress: split.lightningAddress,
        percentage: Number(split.percentage)
      }));
      
      await publishMusicEvent(ndk, {
        ...values,
        freeSeconds: Number(values.freeSeconds),
        duration: Number(values.duration),
        price: Number(values.price),
        splits: splits?.length ? splits : undefined,
      } as MusicEventData);
      
      form.reset();
    } catch (error) {
      console.error("Failed to publish music event:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Connect your Nostr extension to publish tracks
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="artist"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Artist</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fileUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Audio File URL</FormLabel>
              <FormControl>
                <Input type="url" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (seconds)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  disabled={true}
                  placeholder={isDurationLoading ? "Loading duration..." : "Duration will be detected automatically"}
                />
              </FormControl>
              {durationError && (
                <div className="text-sm text-destructive">{durationError}</div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price (sats)</FormLabel>
              <FormControl>
                <Input {...field} type="number" min="0" max="1000" />
              </FormControl>
              <FormDescription className="text-xs">
                Max: 1000 sats
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="freeSeconds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Free Preview (seconds)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="lightningAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lightning Address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Optional fields */}
        <div className="border-t pt-4 mt-6">
          <h3 className="text-lg font-medium mb-4">Optional Information</h3>
          
          <FormField
            control={form.control}
            name="album"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Album</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="image"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cover Image URL</FormLabel>
                <FormControl>
                  <Input {...field} type="url" />
                </FormControl>
                <FormDescription className="text-xs">
                  URL to album art or cover image
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="license"
            render={({ field }) => (
              <FormItem>
                <FormLabel>License</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., CC-BY, All Rights Reserved" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea 
                    {...field} 
                    placeholder="Add a description, lyrics, or other information about the track"
                    className="min-h-[100px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Payment Splits */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <FormLabel className="text-base">Payment Splits</FormLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ lightningAddress: "", percentage: "" })}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Split
              </Button>
            </div>
            
            <FormDescription className="text-xs mb-4">
              Add additional recipients to split payments with. The primary lightning address will receive the remaining percentage.
            </FormDescription>
            
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start mb-2">
                <FormField
                  control={form.control}
                  name={`splits.${index}.lightningAddress`}
                  render={({ field }) => (
                    <FormItem className="flex-grow">
                      <FormControl>
                        <Input {...field} placeholder="Lightning Address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name={`splits.${index}.percentage`}
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormControl>
                        <Input {...field} placeholder="%" type="number" min="1" max="100" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="mt-1"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            {form.formState.errors.splits?.root && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.splits.root.message}
              </p>
            )}
          </div>
        </div>

        {/* Price calculation preview */}
        {(() => {
          const price = form.watch('price');
          const duration = form.watch('duration');
          const freeSeconds = form.watch('freeSeconds');
          
          const calculation = (() => {
            const totalCharge = Number(price);
            const totalDuration = Number(duration);
            const freePeriod = Number(freeSeconds);
            
            if (isNaN(totalCharge) || isNaN(totalDuration) || isNaN(freePeriod)) return null;
            
            const chargeable_duration = totalDuration - freePeriod;
            if (chargeable_duration <= 0) return null;
            
            const charge_per_5_sec = (totalCharge / chargeable_duration) * 5;
            
            return {
              per5Seconds: charge_per_5_sec.toFixed(2),
              freePeriod,
              totalIntervals: Math.ceil(chargeable_duration / 5),
              totalCharge
            };
          })();

          return calculation && (
            <div className="text-sm text-muted-foreground space-y-1 mb-4">
              <p>Free preview: First {calculation.freePeriod} seconds</p>
              <p>After free preview:</p>
              <ul className="list-disc pl-4">
                <li>{calculation.per5Seconds} sats charged every 5 seconds</li>
                <li>Total intervals: {calculation.totalIntervals}</li>
                <li>Total charge: {calculation.totalCharge} sats</li>
              </ul>
            </div>
          );
        })()}

        <Button 
          type="submit" 
          className="w-full" 
          disabled={isSubmitting || isDurationLoading}
        >
          {isSubmitting ? "Publishing..." : "Publish Track"}
        </Button>
      </form>
    </Form>
  );
}
