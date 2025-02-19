import { WebSocketServer } from 'ws';
import { validateEvent, verifySignature } from 'nostr-tools';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

// HTTP endpoints for LNURL and invoice generation
app.get('/api/lnurl/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const response = await fetch(
      `https://legend.lnbits.com/lnurlp/api/v1/lnurl/${address}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      throw new Error(`LNURL fetch failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('LNURL error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoice/create', async (req, res) => {
  try {
    const { callback, amount } = req.body;
    
    if (!callback || !amount) {
      return res.status(400).json({ error: 'Missing callback or amount' });
    }

    const response = await fetch(
      `${callback}?amount=${amount}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      throw new Error(`Invoice creation failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Invoice creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start HTTP server
const HTTP_PORT = 3001;
app.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on port ${HTTP_PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ port: 8009 });
const subscriptions = new Map();
const events = new Map();

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const [type, ...data] = JSON.parse(message);
      
      switch (type) {
        case 'EVENT':
          handleEvent(ws, data[0]);
          break;
        case 'REQ':
          handleSubscription(ws, data[0], data[1]);
          break;
        case 'CLOSE':
          handleClose(ws, data[0]);
          break;
        default:
          console.log('Unknown message type:', type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    // Clean up subscriptions for this client
    for (const [subId, subs] of subscriptions.entries()) {
      if (subs.has(ws)) {
        subs.delete(ws);
        if (subs.size === 0) {
          subscriptions.delete(subId);
        }
      }
    }
  });
});

function handleEvent(ws, event) {
  // Validate event format and signature
  if (!validateEvent(event) || !verifySignature(event)) {
    ws.send(JSON.stringify(['OK', event.id, false, 'invalid: invalid signature']));
    return;
  }

  // Store event
  events.set(event.id, event);
  ws.send(JSON.stringify(['OK', event.id, true, '']));

  // Notify subscribers
  for (const [subId, subs] of subscriptions.entries()) {
    for (const client of subs) {
      client.send(JSON.stringify(['EVENT', subId, event]));
    }
  }

  console.log('Event received:', event.kind);
}

function handleSubscription(ws, subId, filters) {
  // Create subscription set if it doesn't exist
  if (!subscriptions.has(subId)) {
    subscriptions.set(subId, new Set());
  }
  subscriptions.get(subId).add(ws);

  // Send matching events from storage
  for (const event of events.values()) {
    if (matchFilters(event, filters)) {
      ws.send(JSON.stringify(['EVENT', subId, event]));
    }
  }

  // Send EOSE (End of Stored Events)
  ws.send(JSON.stringify(['EOSE', subId]));
}

function handleClose(ws, subId) {
  if (subscriptions.has(subId)) {
    subscriptions.get(subId).delete(ws);
    if (subscriptions.get(subId).size === 0) {
      subscriptions.delete(subId);
    }
  }
}

function matchFilters(event, filters) {
  // Basic filter matching
  return filters.some(filter => {
    if (filter.kinds && !filter.kinds.includes(event.kind)) {
      return false;
    }
    if (filter.authors && !filter.authors.includes(event.pubkey)) {
      return false;
    }
    if (filter['#t'] && !event.tags.some(tag => 
      tag[0] === 't' && filter['#t'].includes(tag[1])
    )) {
      return false;
    }
    return true;
  });
}

console.log('Relay listening on port 8009');
