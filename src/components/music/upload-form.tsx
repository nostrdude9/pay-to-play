"use client";

import { useState, useEffect } from "react";
import { useNostr } from "@/components/providers/nostr-provider";
import { publishMusicEvent } from "@/lib/nostr/music-events";
import { MusicEventData } from "@/types/nostr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useForm } from "react-hook-form";
import * as z from "zod";

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
    },
  });

  const getDuration = async (url: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        resolve(Math.round(audio.duration));
      });
      audio.addEventListener('error', () => {
        reject(new Error("Failed to load audio file. Make sure the URL is accessible and points to a valid audio file."));
      });
    });
  };

  // Watch fileUrl changes and update duration automatically
  useEffect(() => {
    const fileUrl = form.watch('fileUrl');
    if (!fileUrl) return;

    const updateDuration = async () => {
      try {
        setIsDurationLoading(true);
        setDurationError(null);
        const duration = await getDuration(fileUrl);
        form.setValue('duration', duration.toString());
      } catch (error) {
        setDurationError(error instanceof Error ? error.message : "Failed to get audio duration");
        form.setValue('duration', '');
      } finally {
        setIsDurationLoading(false);
      }
    };

    updateDuration();
  }, [form.watch('fileUrl')]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!ndk || !publicKey) return;

    try {
      setIsSubmitting(true);
      await publishMusicEvent(ndk, {
        ...values,
        freeSeconds: Number(values.freeSeconds),
        duration: Number(values.duration),
        price: Number(values.price),
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
