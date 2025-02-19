import { useEffect, useCallback } from "react";
import { useAudioStore } from "@/lib/store/audio-store";
import { useNWC } from "@/components/providers/nwc-provider";
import { Track } from "@/types/nostr";

const PAYMENT_INTERVAL = 5; // seconds

export function usePaymentManager() {
  const { nwc } = useNWC();
  const {
    currentTrack,
    currentTime,
    isPlaying,
    payment,
    updatePaymentState,
    setIsPlaying,
  } = useAudioStore();

  const calculatePaymentAmount = useCallback((track: Track) => {
    const ratePerSecond = track.price / track.duration;
    return Math.ceil(ratePerSecond * PAYMENT_INTERVAL);
  }, []);

  const processPayment = useCallback(
    async (track: Track) => {
      if (!nwc) return false;

      try {
        updatePaymentState({ lastPaymentStatus: "pending" });
        const amount = calculatePaymentAmount(track);
        
        // Get LNURL data from our relay
        const response = await fetch(
          `http://localhost:3001/api/lnurl/${track.lightningAddress}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error(`Failed to get LNURL data: ${response.statusText}`);
        }
        const { callback } = await response.json();
        
        // Generate invoice through our relay
        const invoiceResponse = await fetch(
          'http://localhost:3001/api/invoice/create',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              callback,
              amount: amount * 1000, // Convert to millisats
            }),
          }
        );
        if (!invoiceResponse.ok) {
          throw new Error(`Failed to generate invoice: ${invoiceResponse.statusText}`);
        }
        const { pr: invoice } = await invoiceResponse.json();

        // Pay invoice using NWC
        const paymentResponse = await nwc.sendPayment(invoice);
        console.info(`Payment successful, preimage: ${paymentResponse.preimage}`);
        
        updatePaymentState({
          lastPaymentStatus: "success",
          nextPaymentDue: Date.now() + PAYMENT_INTERVAL * 1000,
        });
        return true;
      } catch (error) {
        console.error("Payment failed:", error);
        updatePaymentState({ lastPaymentStatus: "failed" });
        return false;
      }
    },
    [nwc, updatePaymentState, calculatePaymentAmount]
  );

  useEffect(() => {
    if (!currentTrack || !isPlaying) return;

    // Handle free preview period
    if (payment.isInFreePeriod && currentTime >= currentTrack.freeSeconds) {
      updatePaymentState({
        isInFreePeriod: false,
        remainingFreeSeconds: 0,
      });
    }

    // Update remaining free seconds
    if (payment.isInFreePeriod) {
      updatePaymentState({
        remainingFreeSeconds: currentTrack.freeSeconds - Math.floor(currentTime),
      });
    }

    // Check if payment is needed
    const needsPayment =
      !payment.isInFreePeriod &&
      Date.now() >= payment.nextPaymentDue &&
      payment.lastPaymentStatus !== "pending";

    if (needsPayment) {
      processPayment(currentTrack).then((success) => {
        if (!success) {
          setIsPlaying(false);
        }
      });
    }
  }, [
    currentTrack,
    currentTime,
    isPlaying,
    payment,
    processPayment,
    updatePaymentState,
    setIsPlaying,
  ]);

  return {
    isInFreePeriod: payment.isInFreePeriod,
    remainingFreeSeconds: payment.remainingFreeSeconds,
    lastPaymentStatus: payment.lastPaymentStatus,
    currentRate: currentTrack
      ? calculatePaymentAmount(currentTrack) / PAYMENT_INTERVAL
      : 0,
  };
}
