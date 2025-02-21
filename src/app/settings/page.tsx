"use client";

import { useNostr } from "@/components/providers/nostr-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useNWC } from "@/components/providers/nwc-provider";
const formSchema = z.object({
  nwcString: z.string().min(1, {
    message: "NWC connection string is required.",
  }),
});

function ConnectionStatus() {
  const { connectionStatus, error, reconnect } = useNWC();

  let statusColor = "text-gray-500";
  let statusText = "Disconnected";

  switch (connectionStatus) {
    case 'connecting':
      statusColor = "text-yellow-500";
      statusText = "Connecting...";
      break;
    case 'connected':
      statusColor = "text-green-500";
      statusText = "Connected";
      break;
    case 'error':
      statusColor = "text-red-500";
      statusText = error?.message || "Connection Error";
      break;
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm ${statusColor}`}>{statusText}</span>
      {connectionStatus === 'error' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => reconnect()}
        >
          Retry Connection
        </Button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { publicKey, isLoading, nwcString, saveNwcConnection, removeNwcConnection } = useNostr();
  const { connectionStatus } = useNWC();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nwcString: nwcString || "",
    },
  });

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !publicKey) {
      router.push("/");
    }
  }, [isLoading, publicKey, router]);

  // Update form when nwcString changes in context
  useEffect(() => {
    form.setValue("nwcString", nwcString || "");
  }, [nwcString, form]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      const trimmedString = values.nwcString.trim();
      
      if (trimmedString) {
        // Basic validation before saving
        if (!trimmedString.startsWith('nostr+walletconnect://')) {
          form.setError('nwcString', {
            type: 'manual',
            message: 'Invalid NWC connection string format',
          });
          return;
        }
        saveNwcConnection(trimmedString);
      } else {
        removeNwcConnection();
      }
    } catch (error) {
      console.error("Failed to save NWC connection:", error);
      form.setError('nwcString', {
        type: 'manual',
        message: 'Failed to save connection',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-12 w-48 mb-8" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-64 mb-2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-32" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!publicKey) {
    return null; // Will redirect
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Settings</h1>
        
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Nostr Wallet Connect</CardTitle>
              <CardDescription>
                Configure your Nostr Wallet Connect (NWC) connection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="nwcString"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NWC Connection String</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter your NWC connection string..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button 
                        type="submit"
                        disabled={isSubmitting || connectionStatus === 'connecting'}
                        variant={nwcString ? "secondary" : "default"}
                        onClick={(e) => {
                          if (nwcString) {
                            e.preventDefault();
                            if (!isSubmitting) {
                              form.setValue("nwcString", "");
                              removeNwcConnection();
                            }
                          }
                        }}
                      >
                        {isSubmitting || connectionStatus === 'connecting'
                          ? "Processing..."
                          : nwcString
                            ? "Remove Connection"
                            : "Save Connection"}
                      </Button>
                    </div>
                    {nwcString && <ConnectionStatus />}
                  </div>
                </form>
              </Form>
              
              <div className="mt-6 text-sm text-muted-foreground">
                <p>To get your NWC connection string:</p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Open your Nostr Wallet (e.g., Alby)</li>
                  <li>Go to Settings &gt; Nostr Wallet Connect</li>
                  <li>Generate a new connection</li>
                  <li>Copy the connection string and paste it here</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
