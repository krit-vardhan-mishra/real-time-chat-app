const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients
const clients = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Generate unique ID for this client
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  clients.set(clientId, ws);
  
  // Send the client their ID
  ws.send(JSON.stringify({
    type: 'connection',
    clientId: clientId,
    message: 'Connected to WebSocket server'
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data.type);
      
      switch(data.type) {
        case 'chat':
          // Broadcast chat message to all clients except sender
          broadcast(data, clientId);
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // WebRTC signaling - forward to specific peer
          if (data.targetId && clients.has(data.targetId)) {
            const targetWs = clients.get(data.targetId);
            targetWs.send(JSON.stringify({
              ...data,
              senderId: clientId
            }));
          }
          break;
          
        case 'get-peers':
          // Send list of available peers
          const peerList = Array.from(clients.keys()).filter(id => id !== clientId);
          ws.send(JSON.stringify({
            type: 'peer-list',
            peers: peerList
          }));
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(clientId);
    
    // Notify other clients
    broadcast({
      type: 'peer-disconnected',
      clientId: clientId
    }, clientId);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast message to all clients except sender
function broadcast(data, senderId) {
  clients.forEach((client, id) => {
    if (id !== senderId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('WebSocket server is ready');
});
