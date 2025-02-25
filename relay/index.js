import { verifyEvent, validateEvent } from 'nostr-tools';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

// File paths for persistence
const EVENTS_FILE = path.join(process.cwd(), 'events.json');
const DELETIONS_FILE = path.join(process.cwd(), 'deletions.json');

// Store events and deletions in memory
const events = new Map();
const deletions = new Set();

// Load persisted data
function loadPersistedData() {
  try {
    // Load events
    if (fs.existsSync(EVENTS_FILE)) {
      const fileContent = fs.readFileSync(EVENTS_FILE, 'utf8');
      console.log(`Events file size: ${fileContent.length} bytes`);
      
      if (!fileContent.trim()) {
        console.log('Events file is empty, initializing with empty array');
        fs.writeFileSync(EVENTS_FILE, '[]');
        return;
      }
      
      try {
        const eventsData = JSON.parse(fileContent);
        if (!Array.isArray(eventsData)) {
          console.error('Events data is not an array, resetting file');
          fs.writeFileSync(EVENTS_FILE, '[]');
          return;
        }
        
        console.log(`Parsed ${eventsData.length} events from storage`);
        let validCount = 0;
        
        eventsData.forEach(event => {
          // Skip adding events that are in the deletions set (will load deletions first in the updated code)
          if (!deletions.has(event.id)) {
            events.set(event.id, event);
            validCount++;
          } else {
            console.log(`Skipping deleted event during load: ${event.id}`);
          }
        });
        
        console.log(`Loaded ${validCount} valid events (${eventsData.length - validCount} were in deletion set)`);
      } catch (parseError) {
        console.error('Failed to parse events file:', parseError);
        console.log('Creating backup of corrupted events file and initializing with empty array');
        const backupPath = `${EVENTS_FILE}.backup.${Date.now()}`;
        fs.copyFileSync(EVENTS_FILE, backupPath);
        fs.writeFileSync(EVENTS_FILE, '[]');
      }
    } else {
      console.log('No events file found, will create on first save');
      fs.writeFileSync(EVENTS_FILE, '[]');
    }
    
    // Load deletions (load before events to filter out deleted events)
    if (fs.existsSync(DELETIONS_FILE)) {
      const fileContent = fs.readFileSync(DELETIONS_FILE, 'utf8');
      console.log(`Deletions file size: ${fileContent.length} bytes`);
      
      if (!fileContent.trim()) {
        console.log('Deletions file is empty, initializing with empty array');
        fs.writeFileSync(DELETIONS_FILE, '[]');
        return;
      }
      
      try {
        const deletionsData = JSON.parse(fileContent);
        if (!Array.isArray(deletionsData)) {
          console.error('Deletions data is not an array, resetting file');
          fs.writeFileSync(DELETIONS_FILE, '[]');
          return;
        }
        
        deletionsData.forEach(id => deletions.add(id));
        console.log(`Loaded ${deletionsData.length} deletions from storage`);
        
        // Clean up deleted events from memory
        let removedCount = 0;
        for (const deletedId of deletions) {
          if (events.has(deletedId)) {
            events.delete(deletedId);
            removedCount++;
          }
        }
        console.log(`Removed ${removedCount} deleted events from memory`);
        console.log(`Current state: ${events.size} events, ${deletions.size} deletions`);
      } catch (parseError) {
        console.error('Failed to parse deletions file:', parseError);
        console.log('Creating backup of corrupted deletions file and initializing with empty array');
        const backupPath = `${DELETIONS_FILE}.backup.${Date.now()}`;
        fs.copyFileSync(DELETIONS_FILE, backupPath);
        fs.writeFileSync(DELETIONS_FILE, '[]');
      }
    } else {
      console.log('No deletions file found, will create on first save');
      fs.writeFileSync(DELETIONS_FILE, '[]');
    }
  } catch (error) {
    console.error('Error loading persisted data:', error);
  }
}

// Save events to file
function saveEvents() {
  try {
    const eventsArray = Array.from(events.values());
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(eventsArray, null, 2));
    console.log(`Saved ${eventsArray.length} events to ${EVENTS_FILE}`);
  } catch (error) {
    console.error('Error saving events:', error);
  }
}

// Save deletions to file
function saveDeletions() {
  try {
    const deletionsArray = Array.from(deletions);
    fs.writeFileSync(DELETIONS_FILE, JSON.stringify(deletionsArray, null, 2));
    console.log(`Saved ${deletionsArray.length} deletions to ${DELETIONS_FILE}`);
  } catch (error) {
    console.error('Error saving deletions:', error);
  }
}

// Validate if an event has a proper deletion tag
function hasValidDeletionTag(event) {
  if (!event.tags || !Array.isArray(event.tags)) {
    console.log('Deletion event has no tags array:', event.id);
    return false;
  }
  
  const eTags = event.tags.filter(tag => 
    Array.isArray(tag) && 
    tag.length >= 2 && 
    tag[0] === 'e' && 
    typeof tag[1] === 'string' && 
    tag[1].length > 0
  );
  
  if (eTags.length === 0) {
    console.log('Deletion event has no valid e tags:', event.id);
    return false;
  }
  
  console.log(`Deletion event has ${eTags.length} valid e tags:`, eTags.map(t => t[1]));
  return true;
}

// Debug function to log current state
function logState() {
  console.log('=== RELAY STATE ===');
  console.log(`Events in memory: ${events.size}`);
  console.log(`Deletions in memory: ${deletions.size}`);
  console.log('==================');
}

// Set up periodic state logging (every 5 minutes)
setInterval(logState, 5 * 60 * 1000);

// Load data on startup
loadPersistedData();

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

        // Handle music events (kind 23) and deletion events (kind 5)
        if (event.kind === 23) {
          // Don't store if it's already been deleted
          if (deletions.has(event.id)) {
            console.log('Rejected previously deleted event:', event.id);
            ws.send(JSON.stringify(['OK', event.id, false, 'invalid: event was previously deleted']));
            return;
          }
          
          // Store the music event
          events.set(event.id, event);
          saveEvents();
          console.log('Stored music event:', event);
          ws.send(JSON.stringify(['OK', event.id, true]));
        } else if (event.kind === 5) {
          // Handle deletion event
          console.log('Processing deletion event:', event.id);
          
          // Validate deletion event has proper e tags
          if (!hasValidDeletionTag(event)) {
            console.error('Invalid deletion event format (missing e tag):', event);
            ws.send(JSON.stringify(['OK', event.id, false, 'invalid: deletion event must have a valid e tag']));
            return;
          }
          
          // Process all e tags in the deletion event
          const deletionResults = [];
          let anySuccessful = false;
          
          for (const tag of event.tags) {
            if (Array.isArray(tag) && tag.length >= 2 && tag[0] === 'e') {
              const eventToDeleteId = tag[1];
              console.log(`Attempting to delete event: ${eventToDeleteId}`);
              
              const eventToDelete = events.get(eventToDeleteId);
              
              // Only allow deletion if:
              // 1. The event exists
              // 2. The deletion request comes from the original publisher
              if (eventToDelete) {
                console.log(`Found event to delete. Event pubkey: ${eventToDelete.pubkey}, Deletion pubkey: ${event.pubkey}`);
                
                if (event.pubkey === eventToDelete.pubkey) {
                  events.delete(eventToDeleteId);
                  deletions.add(eventToDeleteId);
                  console.log(`Successfully deleted event: ${eventToDeleteId}`);
                  deletionResults.push(`deleted: ${eventToDeleteId}`);
                  anySuccessful = true;
                } else {
                  console.error(`Unauthorized deletion attempt for ${eventToDeleteId}. Event pubkey: ${eventToDelete.pubkey}, Deletion pubkey: ${event.pubkey}`);
                  deletionResults.push(`unauthorized: ${eventToDeleteId}`);
                }
              } else {
                if (deletions.has(eventToDeleteId)) {
                  console.log(`Event ${eventToDeleteId} was already deleted`);
                  deletionResults.push(`already deleted: ${eventToDeleteId}`);
                  anySuccessful = true;
                } else {
                  console.log(`Event ${eventToDeleteId} not found`);
                  deletionResults.push(`not found: ${eventToDeleteId}`);
                }
              }
            }
          }
          
          // Save changes if any deletions were successful
          if (anySuccessful) {
            saveEvents();
            saveDeletions();
            console.log('Saved changes after deletion');
            ws.send(JSON.stringify(['OK', event.id, true, `results: ${deletionResults.join(', ')}`]));
          } else {
            console.error('No successful deletions:', deletionResults);
            ws.send(JSON.stringify(['OK', event.id, false, `invalid: ${deletionResults.join(', ')}`]));
          }
        } else {
          console.log('Rejected non-music/deletion event:', event);
          ws.send(JSON.stringify(['OK', event.id, false, 'invalid: only kind 23 and 5 events are accepted']));
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
        // Handle requests for music events (23) and deletion events (5)
        const validKinds = [23, 5];
        if (!filter.kinds || !filter.kinds.some(k => validKinds.includes(k))) {
          console.log('Ignoring non-music/deletion event request');
          ws.send(JSON.stringify(['EOSE', subId]));
          return;
        }

        // Process and send matching events
        let processedCount = 0;
        let sentCount = 0;
        let deletedCount = 0;
        
        console.log(`Processing subscription with filter:`, JSON.stringify(filter));
        
        // Send matching events (excluding deleted ones)
        for (const event of events.values()) {
          processedCount++;
          
          // Skip deleted events
          if (deletions.has(event.id)) {
            deletedCount++;
            continue;
          }
          
          if (validKinds.includes(event.kind)) {
            // Apply additional filters if present
            let matches = true;

            // Filter by authors
            if (filter.authors && filter.authors.length > 0) {
              const authorMatch = filter.authors.includes(event.pubkey);
              if (!authorMatch) {
                matches = false;
              }
            }

            // Filter by event ids
            if (matches && filter.ids && filter.ids.length > 0) {
              const idMatch = filter.ids.includes(event.id);
              if (!idMatch) {
                matches = false;
              }
            }

            // Filter by tags
            if (matches && filter['#t'] && filter['#t'].length > 0) {
              const eventTags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
              const tagMatch = filter['#t'].some(t => eventTags.includes(t));
              if (!tagMatch) {
                matches = false;
              }
            }

            if (matches) {
              console.log(`Sending matching event: ${event.id} (kind: ${event.kind})`);
              ws.send(JSON.stringify(['EVENT', subId, event]));
              sentCount++;
            }
          }
        }
        
        console.log(`Subscription stats: processed ${processedCount} events, sent ${sentCount}, skipped ${deletedCount} deleted events`);

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
  console.log('Saving data before shutdown...');
  saveEvents();
  saveDeletions();
  wss.close(() => {
    console.log('Relay shut down');
    process.exit(0);
  });
});

// Log initial state on startup
console.log('=== RELAY STARTING ===');
logState();

// Set up periodic saves (every 10 minutes)
setInterval(() => {
  console.log('Performing periodic save...');
  saveEvents();
  saveDeletions();
}, 10 * 60 * 1000);
