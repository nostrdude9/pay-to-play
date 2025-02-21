"use client";

import { useState } from "react";
import { useNostr } from "@/components/providers/nostr-provider";
import { publishMusicEvent } from "@/lib/nostr/music-events";
import { MusicEventData } from "@/types/nostr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
    (val) => !isNaN(Number(val)) && Number(val) >= 0,
    "Price must be a valid number and cannot be negative"
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
                <Input {...field} />
              </FormControl>
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
                <Input {...field} />
              </FormControl>
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
          disabled={isSubmitting}
        >
          {isSubmitting ? "Publishing..." : "Publish Track"}
        </Button>
      </form>
    </Form>
  );
}
