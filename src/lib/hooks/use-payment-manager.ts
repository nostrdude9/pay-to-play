import { useEffect, useCallback } from "react";
import { useAudioStore } from "@/lib/store/audio-store";
import { useNWC } from "@/components/providers/nwc-provider";
import { Track } from "@/types/nostr";
import { LightningAddress } from "@getalby/lightning-tools";

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
    // Calculate rate per second in millisats
    const ratePerSecond = (track.price * 1000) / track.duration;
    // Return millisats amount for the payment interval
    return Math.ceil(ratePerSecond * PAYMENT_INTERVAL);
  }, []);

  const processPayment = useCallback(
    async (track: Track) => {
      if (!nwc) return false;

      try {
        console.info('Starting payment process...');
        updatePaymentState({ lastPaymentStatus: "pending" });
        const amount = calculatePaymentAmount(track);
        console.info(`Calculated payment amount: ${amount} millisats`);
        
        // Get invoice using LightningAddress
        const lightningAddress = new LightningAddress(track.lightningAddress);
        await lightningAddress.fetch();
        console.info('Successfully fetched lightning address data');
        
        // Ensure minimum amount of 1 sat
        const satsAmount = Math.max(1, Math.ceil(amount / 1000)); // Convert millisats to sats
        console.info(`Requesting invoice for ${satsAmount} sats`);
        
        const invoice = await lightningAddress.requestInvoice({
          satoshi: satsAmount,
          comment: `Payment for ${track.title}`,
        });
        console.info('Successfully generated invoice');

        if (!invoice || !invoice.paymentRequest) {
          throw new Error('Failed to generate invoice');
        }

        console.info('Paying invoice with NWC...');
        const paymentResponse = await nwc.sendPayment(invoice.paymentRequest);
        
        if (!paymentResponse || !paymentResponse.preimage) {
          throw new Error('Payment failed - no preimage received');
        }
        
        console.info(`Payment successful, preimage: ${paymentResponse.preimage}`);
        
        updatePaymentState({
          lastPaymentStatus: "success",
          nextPaymentDue: Date.now() + PAYMENT_INTERVAL * 1000,
        });
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("Payment failed:", errorMessage);
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
