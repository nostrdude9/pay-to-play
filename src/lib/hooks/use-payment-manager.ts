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
    
    // Calculate cost per interval based on total intervals needed
    const totalIntervals = Math.ceil(chargeable_duration / PAYMENT_INTERVAL);
    const costPerInterval = track.price / totalIntervals;
    
    // Return cost for this interval
    const satsAmount = Math.ceil(costPerInterval);
    console.info('Payment calculation result:', {
      chargeable_duration,
      totalIntervals,
      costPerInterval,
      satsAmount
    });
    
    return satsAmount;
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
        
        console.info('Preparing invoice request:', {
          amount: amount,
          destination: track.lightningAddress,
          track: track.title
        });
        
        console.info('Generating invoice:', {
          timestamp: new Date().toISOString(),
          amount: amount,
          destination: track.lightningAddress
        });
        const invoice = await lightningAddress.requestInvoice({
          satoshi: amount,
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
          amount: amount,
          destination: track.lightningAddress
        });
        const paymentResponse = await nwc.sendPayment(invoice.paymentRequest);
        
        if (!paymentResponse || !paymentResponse.preimage) {
          throw new Error('Payment failed - no preimage received');
        }
        
        console.info('Payment successful:', {
          track: track.title,
          amount: amount,
          destination: track.lightningAddress,
          preimage: paymentResponse.preimage
        });
        
        updatePaymentState({
          lastPaymentStatus: "success",
          nextPaymentDue: Date.now() + PAYMENT_INTERVAL * 1000,
          totalPaid: payment.totalPaid + amount
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

  const calculateTotalCost = useCallback((track: Track) => {
    if (!track) return 0;
    return track.price; // Simply return the track's price
  }, []);

  const calculateCurrentPayment = useCallback((track: Track, currentTime: number) => {
    if (!track) return 0;
    const chargeable_duration = track.duration - track.freeSeconds;
    if (chargeable_duration <= 0 || currentTime <= track.freeSeconds) return 0;
    
    // Calculate how many intervals have passed
    const intervals = Math.floor((currentTime - track.freeSeconds) / PAYMENT_INTERVAL);
    // Calculate cost per interval
    const costPerInterval = track.price / Math.ceil(chargeable_duration / PAYMENT_INTERVAL);
    // Return total cost for elapsed intervals
    return Math.ceil(intervals * costPerInterval);
  }, []);

  return {
    isInFreePeriod: payment.isInFreePeriod,
    remainingFreeSeconds: payment.remainingFreeSeconds,
    lastPaymentStatus: payment.lastPaymentStatus,
    totalCost: currentTrack ? calculateTotalCost(currentTrack) : 0,
    currentPayment: currentTrack ? calculateCurrentPayment(currentTrack, currentTime) : 0,
    totalPaid: payment.totalPaid,
  };
}
