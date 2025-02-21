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

  const calculatePaymentAmount = useCallback((track: Track, currentTime: number) => {
    console.info('Calculating payment amount:', {
      track: {
        title: track.title,
        duration: track.duration,
        freeSeconds: track.freeSeconds,
        price: track.price,
        lightningAddress: track.lightningAddress
      },
      currentTime
    });

    const chargeable_duration = track.duration - track.freeSeconds;
    if (chargeable_duration <= 0) {
      console.info('No charge - entire track is free');
      return 0;
    }
    
    // If we're in free period, no charge
    if (currentTime <= track.freeSeconds) {
      console.info('No charge - currently in free preview period', {
        currentTime,
        freeSeconds: track.freeSeconds
      });
      return 0;
    }
    
    // Calculate charge per 5-second interval
    const charge_per_5_sec = (track.price / chargeable_duration) * 5;
    
    // Calculate how many 5-sec intervals have passed since free period
    const intervals = Math.floor((currentTime - track.freeSeconds) / PAYMENT_INTERVAL);
    
    const amount = Math.ceil(intervals * charge_per_5_sec * 1000); // Convert to millisats
    console.info('Payment calculation result:', {
      chargeable_duration,
      charge_per_5_sec,
      intervals,
      amount_millisats: amount
    });
    
    return amount;
  }, []);

  const processPayment = useCallback(
    async (track: Track) => {
      if (!nwc) {
        console.info('Payment skipped - NWC not available');
        return false;
      }

      try {
        console.info('Starting payment process:', {
          track: {
            title: track.title,
            lightningAddress: track.lightningAddress,
            price: track.price,
            duration: track.duration,
            freeSeconds: track.freeSeconds
          },
          currentTime,
          paymentState: payment
        });

        updatePaymentState({ lastPaymentStatus: "pending" });
        const amount = calculatePaymentAmount(track, currentTime);
        console.info('Payment amount calculated:', {
          amount_millisats: amount,
          track: track.title
        });
        
        // Get invoice using LightningAddress
        console.info('Fetching lightning address data:', track.lightningAddress);
        const lightningAddress = new LightningAddress(track.lightningAddress);
        await lightningAddress.fetch();
        console.info('Lightning address data fetched successfully');
        
        // Ensure minimum amount of 1 sat
        const satsAmount = Math.max(1, Math.ceil(amount / 1000)); // Convert millisats to sats
        console.info('Preparing invoice request:', {
          satsAmount,
          destination: track.lightningAddress,
          track: track.title
        });
        
        console.info('Generating invoice:', {
          timestamp: new Date().toISOString(),
          amount: satsAmount,
          destination: track.lightningAddress
        });
        const invoice = await lightningAddress.requestInvoice({
          satoshi: satsAmount,
          comment: `Payment for ${track.title}`,
        });
        console.info('Invoice generated successfully:', {
          hasPaymentRequest: !!invoice?.paymentRequest,
          track: track.title
        });

        if (!invoice || !invoice.paymentRequest) {
          throw new Error('Failed to generate invoice');
        }

        console.info('Initiating NWC payment:', {
          track: track.title,
          amount: satsAmount,
          destination: track.lightningAddress
        });
        const paymentResponse = await nwc.sendPayment(invoice.paymentRequest);
        
        if (!paymentResponse || !paymentResponse.preimage) {
          throw new Error('Payment failed - no preimage received');
        }
        
        console.info('Payment successful:', {
          track: track.title,
          amount: satsAmount,
          destination: track.lightningAddress,
          preimage: paymentResponse.preimage
        });
        
        updatePaymentState({
          lastPaymentStatus: "success",
          nextPaymentDue: Date.now() + PAYMENT_INTERVAL * 1000,
        });
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Payment failed:', {
          error: errorMessage,
          track: track.title,
          destination: track.lightningAddress
        });
        updatePaymentState({ lastPaymentStatus: "failed" });
        return false;
      }
    },
    [nwc, updatePaymentState, calculatePaymentAmount, currentTime, payment]
  );

  // Effect for handling payments
  useEffect(() => {
    if (!currentTrack || !isPlaying || !nwc || payment.lastPaymentStatus === "pending") {
      return;
    }

    // Only check for payments if we're not in free period and payment is due
    const now = Date.now();
    const needsPayment = !payment.isInFreePeriod && now >= payment.nextPaymentDue;

    if (needsPayment) {
      console.info('Processing payment:', {
        track: currentTrack.title,
        currentTime,
        payment: {
          isInFreePeriod: payment.isInFreePeriod,
          nextPaymentDue: new Date(payment.nextPaymentDue).toISOString()
        }
      });

      processPayment(currentTrack).then((success) => {
        if (!success) {
          setIsPlaying(false);
        }
      });
    }
  }, [
    currentTrack,
    isPlaying,
    nwc,
    payment.isInFreePeriod,
    payment.nextPaymentDue,
    payment.lastPaymentStatus,
    processPayment,
    setIsPlaying
  ]);

  return {
    isInFreePeriod: payment.isInFreePeriod,
    remainingFreeSeconds: payment.remainingFreeSeconds,
    lastPaymentStatus: payment.lastPaymentStatus,
    currentRate: currentTrack
      ? calculatePaymentAmount(currentTrack, currentTime) / PAYMENT_INTERVAL
      : 0,
  };
}
