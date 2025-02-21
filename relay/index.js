import { verifyEvent, validateEvent } from 'nostr-tools';
import { WebSocketServer } from 'ws';

// Store events in memory
const events = new Map();

// Initialize WebSocket server
const wss = new WebSocketServer({ port: 8008 });
console.log('Nostr relay listening on ws://localhost:8008');

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error('Failed to parse message:', e);
      return;
    }

    const [type, ...data] = parsedMessage;
    
    if (type === 'EVENT') {
      const event = data[0];
      
      // Validate event structure and signature
      try {
        if (!validateEvent(event)) {
          console.error('Invalid event structure:', event);
          ws.send(JSON.stringify(['OK', event.id, false, 'invalid: event structure is invalid']));
          return;
        }

        if (!verifyEvent(event)) {
          console.error('Invalid signature:', event);
          ws.send(JSON.stringify(['OK', event.id, false, 'invalid: signature verification failed']));
          return;
        }

        // Only accept kind 4100 events
        if (event.kind !== 4100) {
          console.log('Rejected non-music event:', event);
          ws.send(JSON.stringify(['OK', event.id, false, 'invalid: only kind 4100 events are accepted']));
          return;
        }

        // Store the event
        events.set(event.id, event);
        console.log('Stored music event:', event);
        ws.send(JSON.stringify(['OK', event.id, true]));

      } catch (e) {
        console.error('Error processing event:', e);
        ws.send(JSON.stringify(['OK', event.id, false, 'error: failed to process event']));
      }
    }
    
    if (type === 'REQ') {
      const [subId, filter] = data;
      console.log('Subscription request:', { subId, filter });

      try {
        // Only handle requests for kind 4100 events
        if (!filter.kinds || !filter.kinds.includes(4100)) {
          console.log('Ignoring non-music event request');
          ws.send(JSON.stringify(['EOSE', subId]));
          return;
        }

        // Send matching events
        for (const event of events.values()) {
          if (event.kind === 4100) {
            // Apply additional filters if present
            let matches = true;

            // Filter by authors
            if (filter.authors && filter.authors.length > 0) {
              matches = matches && filter.authors.includes(event.pubkey);
            }

            // Filter by event ids
            if (filter.ids && filter.ids.length > 0) {
              matches = matches && filter.ids.includes(event.id);
            }

            // Filter by tags
            if (filter['#t'] && filter['#t'].length > 0) {
              const eventTags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
              matches = matches && filter['#t'].some(t => eventTags.includes(t));
            }

            if (matches) {
              console.log('Sending matching event:', event);
              ws.send(JSON.stringify(['EVENT', subId, event]));
            }
          }
        }

        ws.send(JSON.stringify(['EOSE', subId]));
      } catch (e) {
        console.error('Error processing subscription:', e);
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Handle server shutdown
process.on('SIGINT', () => {
  wss.close(() => {
    console.log('Relay shut down');
    process.exit(0);
  });
});
