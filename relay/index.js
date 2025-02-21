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

        // Handle music events (kind 4100) and deletion events (kind 5)
        if (event.kind === 4100) {
          // Store the music event
          events.set(event.id, event);
          console.log('Stored music event:', event);
          ws.send(JSON.stringify(['OK', event.id, true]));
        } else if (event.kind === 5) {
          // Handle deletion event
          const eventToDeleteId = event.tags.find(t => t[0] === 'e')?.[1];
          const eventToDelete = events.get(eventToDeleteId);
          
          // Only allow deletion if:
          // 1. The event exists
          // 2. The deletion request comes from the original publisher
          if (eventToDelete && event.pubkey === eventToDelete.pubkey) {
            events.delete(eventToDeleteId);
            console.log('Deleted event:', eventToDeleteId);
            ws.send(JSON.stringify(['OK', event.id, true]));
          } else {
            console.error('Unauthorized deletion attempt or event not found:', event);
            ws.send(JSON.stringify(['OK', event.id, false, 'invalid: unauthorized deletion or event not found']));
          }
        } else {
          console.log('Rejected non-music/deletion event:', event);
          ws.send(JSON.stringify(['OK', event.id, false, 'invalid: only kind 4100 and 5 events are accepted']));
          return;
        }

      } catch (e) {
        console.error('Error processing event:', e);
        ws.send(JSON.stringify(['OK', event.id, false, 'error: failed to process event']));
      }
    }
    
    if (type === 'REQ') {
      const [subId, filter] = data;
      console.log('Subscription request:', { subId, filter });

      try {
        // Handle requests for music events (4100) and deletion events (5)
        const validKinds = [4100, 5];
        if (!filter.kinds || !filter.kinds.some(k => validKinds.includes(k))) {
          console.log('Ignoring non-music/deletion event request');
          ws.send(JSON.stringify(['EOSE', subId]));
          return;
        }

        // Send matching events
        for (const event of events.values()) {
          // Only send events that haven't been deleted
          if (validKinds.includes(event.kind)) {
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
