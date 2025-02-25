import { useEffect, useCallback } from "react";
import { useAudioStore } from "@/lib/store/audio-store";
import { useNWC } from "@/components/providers/nwc-provider";
import { Track } from "@/types/nostr";
import { LightningAddress } from "@getalby/lightning-tools";

const PAYMENT_INTERVAL = 10; // seconds

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
            freeSeconds: track.freeSeconds,
            splits: track.splits
          },
          currentTime,
          paymentState: payment
        });

        updatePaymentState({ lastPaymentStatus: "pending" });
        const totalAmount = calculatePaymentAmount(track, currentTime);
        
        // If no payment amount, skip processing
        if (totalAmount <= 0) {
          console.info('Payment amount is zero, skipping payment');
          updatePaymentState({ lastPaymentStatus: "success" });
          return true;
        }
        
        console.info('Payment amount calculated:', {
          total_amount_millisats: totalAmount,
          track: track.title
        });
        
        // Check if we have splits to process
        if (track.splits && track.splits.length > 0) {
          console.info('Processing payment with splits:', {
            track: track.title,
            splits: track.splits
          });
          
          // Calculate total split percentage
          const totalSplitPercentage = track.splits.reduce(
            (sum, split) => sum + split.percentage, 0
          );
          
          // Calculate remaining percentage for the primary address
          const primaryPercentage = 100 - totalSplitPercentage;
          
          // Create an array to hold all payment promises
          const paymentPromises = [];
          const paymentDetails = [];
          
          // Add primary address payment if it has any percentage
          if (primaryPercentage > 0) {
            const primaryAmount = Math.ceil((primaryPercentage / 100) * totalAmount);
            
            console.info('Preparing primary address payment:', {
              address: track.lightningAddress,
              percentage: primaryPercentage,
              amount: primaryAmount
            });
            
            // Update totalPaid immediately
            updatePaymentState({
              totalPaid: payment.totalPaid + primaryAmount
            });
            
            // Add to payment promises
            paymentPromises.push(
              (async () => {
                try {
                  // Get invoice using LightningAddress
                  const lightningAddress = new LightningAddress(track.lightningAddress);
                  await lightningAddress.fetch();
                  
                  const invoice = await lightningAddress.requestInvoice({
                    satoshi: primaryAmount,
                    comment: `Payment for ${track.title} (${primaryPercentage}%)`,
                  });
                  
                  if (!invoice || !invoice.paymentRequest) {
                    throw new Error('Failed to generate invoice for primary address');
                  }
                  
                  // Send payment
                  const paymentResponse = await nwc.sendPayment(invoice.paymentRequest);
                  
                  if (paymentResponse && paymentResponse.preimage) {
                    console.info('Primary address payment successful:', {
                      address: track.lightningAddress,
                      amount: primaryAmount,
                      preimage: paymentResponse.preimage
                    });
                    return true;
                  } else {
                    console.error('Primary address payment failed');
                    return false;
                  }
                } catch (error) {
                  console.error('Primary address payment error:', error);
                  return false;
                }
              })()
            );
            
            paymentDetails.push({
              address: track.lightningAddress,
              amount: primaryAmount,
              type: 'primary'
            });
          }
          
          // Add split payments
          for (const split of track.splits) {
            const splitAmount = Math.ceil((split.percentage / 100) * totalAmount);
            
            console.info('Preparing split payment:', {
              address: split.lightningAddress,
              percentage: split.percentage,
              amount: splitAmount
            });
            
            // Update totalPaid immediately
            updatePaymentState({
              totalPaid: payment.totalPaid + splitAmount
            });
            
            // Add to payment promises
            paymentPromises.push(
              (async () => {
                try {
                  // Get invoice using LightningAddress
                  const lightningAddress = new LightningAddress(split.lightningAddress);
                  await lightningAddress.fetch();
                  
                  const invoice = await lightningAddress.requestInvoice({
                    satoshi: splitAmount,
                    comment: `Payment for ${track.title} (${split.percentage}%)`,
                  });
                  
                  if (!invoice || !invoice.paymentRequest) {
                    throw new Error(`Failed to generate invoice for split address ${split.lightningAddress}`);
                  }
                  
                  // Send payment
                  const paymentResponse = await nwc.sendPayment(invoice.paymentRequest);
                  
                  if (paymentResponse && paymentResponse.preimage) {
                    console.info('Split payment successful:', {
                      address: split.lightningAddress,
                      amount: splitAmount,
                      preimage: paymentResponse.preimage
                    });
                    return true;
                  } else {
                    console.error('Split payment failed:', {
                      address: split.lightningAddress,
                      amount: splitAmount
                    });
                    return false;
                  }
                } catch (error) {
                  console.error('Split payment error:', {
                    address: split.lightningAddress,
                    error
                  });
                  return false;
                }
              })()
            );
            
            paymentDetails.push({
              address: split.lightningAddress,
              amount: splitAmount,
              type: 'split',
              percentage: split.percentage
            });
          }
          
          // Process all payments concurrently
          console.info('Processing all payments concurrently:', {
            track: track.title,
            paymentCount: paymentPromises.length,
            details: paymentDetails
          });
          
          // Wait for all payments to complete
          const results = await Promise.all(paymentPromises);
          
          // Count successful payments
          const successfulPayments = results.filter(result => result).length;
          const totalPayments = paymentPromises.length;
          
          // Update payment status based on all payments
          updatePaymentState({
            lastPaymentStatus: successfulPayments === totalPayments ? "success" : "failed"
          });
          
          return successfulPayments === totalPayments;
        } else {
          // No splits - process payment to primary address as before
          console.info('Processing payment to primary address:', {
            address: track.lightningAddress,
            amount: totalAmount
          });
          
          // Get invoice using LightningAddress
          console.info('Fetching lightning address data:', track.lightningAddress);
          const lightningAddress = new LightningAddress(track.lightningAddress);
          await lightningAddress.fetch();
          console.info('Lightning address data fetched successfully');
          
          console.info('Generating invoice:', {
            timestamp: new Date().toISOString(),
            amount: totalAmount,
            destination: track.lightningAddress
          });
          const invoice = await lightningAddress.requestInvoice({
            satoshi: totalAmount,
            comment: `Payment for ${track.title}`,
          });
          console.info('Invoice generated successfully:', {
            hasPaymentRequest: !!invoice?.paymentRequest,
            track: track.title
          });
          
          if (!invoice || !invoice.paymentRequest) {
            throw new Error('Failed to generate invoice');
          }
          
          // Update totalPaid as soon as invoice is issued
          updatePaymentState({
            totalPaid: payment.totalPaid + totalAmount
          });
          
          console.info('Initiating NWC payment:', {
            track: track.title,
            amount: totalAmount,
            destination: track.lightningAddress
          });
          const paymentResponse = await nwc.sendPayment(invoice.paymentRequest);
          
          if (!paymentResponse || !paymentResponse.preimage) {
            throw new Error('Payment failed - no preimage received');
          }
          
          console.info('Payment successful:', {
            track: track.title,
            amount: totalAmount,
            destination: track.lightningAddress,
            preimage: paymentResponse.preimage
          });
          
          updatePaymentState({
            lastPaymentStatus: "success",
            // We don't update nextPaymentDue here because it's already updated in the useEffect
            // totalPaid is already updated when invoice was issued
          });
          return true;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Payment failed:', {
          error: errorMessage,
          track: track.title
        });
        updatePaymentState({ 
          lastPaymentStatus: "failed",
          // We don't update nextPaymentDue here because it's already updated in the useEffect
          // totalPaid is already updated when invoice was issued, we don't revert it on failure
        });
        return false;
      }
    },
    [nwc, updatePaymentState, calculatePaymentAmount, currentTime, payment]
  );

  // Effect for handling payments
  useEffect(() => {
    if (!currentTrack || !isPlaying || !nwc) {
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
          nextPaymentDue: new Date(payment.nextPaymentDue).toISOString(),
          lastPaymentStatus: payment.lastPaymentStatus
        }
      });

      // Always schedule the next payment regardless of current status
      updatePaymentState({
        nextPaymentDue: Date.now() + PAYMENT_INTERVAL * 1000
      });

      // Only process a new payment if we're not already processing one
      if (payment.lastPaymentStatus !== "pending") {
        processPayment(currentTrack).then((success) => {
          if (!success) {
            setIsPlaying(false);
          }
        });
      }
    }
  }, [
    currentTrack,
    isPlaying,
    nwc,
    payment.isInFreePeriod,
    payment.nextPaymentDue,
    payment.lastPaymentStatus,
    processPayment,
    setIsPlaying,
    updatePaymentState,
    currentTime
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
