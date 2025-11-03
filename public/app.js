// Main Application Logic
let ws = null;
let clientId = null;
let availablePeers = [];

// DOM elements
const wsStatus = document.getElementById('ws-status');
const rtcStatus = document.getElementById('rtc-status');
const clientIdDisplay = document.getElementById('client-id');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const startRtcBtn = document.getElementById('start-rtc-btn');
const peerSelect = document.getElementById('peer-select');
const showKeyBtn = document.getElementById('show-key-btn');
const keyModal = document.getElementById('key-modal');
const encryptionKeyDisplay = document.getElementById('encryption-key-display');

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        updateWSStatus('connected');
        addSystemMessage('✅ Connected to WebSocket server');
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 Received:', data.type);

            switch(data.type) {
                case 'connection':
                    clientId = data.clientId;
                    clientIdDisplay.textContent = clientId;
                    messageInput.disabled = false;
                    sendBtn.disabled = false;
                    
                    // Initialize WebRTC manager
                    webrtc = new WebRTCManager(ws);
                    
                    // Request peer list
                    ws.send(JSON.stringify({ type: 'get-peers' }));
                    break;

                case 'chat':
                    if (data.encrypted) {
                        try {
                            const decrypted = await encryption.decrypt(data.message);
                            addMessage(decrypted, 'received', true, 'WebSocket');
                        } catch (error) {
                            addMessage('⚠️ Failed to decrypt message', 'received', false);
                        }
                    } else {
                        addMessage(data.message, 'received', false, 'WebSocket');
                    }
                    break;

                case 'peer-list':
                    updatePeerList(data.peers);
                    break;

                case 'offer':
                    await webrtc.handleOffer(data.offer, data.senderId);
                    break;

                case 'answer':
                    await webrtc.handleAnswer(data.answer);
                    break;

                case 'ice-candidate':
                    await webrtc.handleIceCandidate(data.candidate);
                    break;

                case 'peer-disconnected':
                    addSystemMessage(`👋 Peer ${data.clientId} disconnected`);
                    ws.send(JSON.stringify({ type: 'get-peers' }));
                    break;

                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    };

    ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        updateWSStatus('disconnected');
        addSystemMessage('❌ Disconnected from server');
        messageInput.disabled = true;
        sendBtn.disabled = true;
        
        // Try to reconnect after 3 seconds
        setTimeout(() => {
            addSystemMessage('🔄 Attempting to reconnect...');
            initWebSocket();
        }, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addSystemMessage('❌ WebSocket error occurred');
    };
}

// Update WebSocket status display
function updateWSStatus(status) {
    wsStatus.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
    wsStatus.className = 'status ' + status;
}

// Update WebRTC status display
function updateRTCStatus(status) {
    let displayStatus = 'Not Connected';
    let className = 'disconnected';
    
    if (status === 'connected') {
        displayStatus = 'Connected';
        className = 'connected';
    } else if (status === 'connecting') {
        displayStatus = 'Connecting...';
        className = 'active';
    }
    
    rtcStatus.textContent = displayStatus;
    rtcStatus.className = 'status ' + className;
}

// Update peer list
function updatePeerList(peers) {
    availablePeers = peers;
    peerSelect.innerHTML = '<option value="">Select peer...</option>';
    
    peers.forEach(peerId => {
        const option = document.createElement('option');
        option.value = peerId;
        option.textContent = peerId;
        peerSelect.appendChild(option);
    });

    startRtcBtn.disabled = peers.length === 0;
    peerSelect.disabled = peers.length === 0;
}

// Add message to chat
function addMessage(text, type = 'sent', encrypted = true, channel = 'WebSocket') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    if (encrypted) {
        messageDiv.classList.add('encrypted');
    }

    const messageText = document.createElement('div');
    messageText.textContent = text;
    messageDiv.appendChild(messageText);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `${channel} ${encrypted ? '🔒 Encrypted' : ''} • ${new Date().toLocaleTimeString()}`;
    messageDiv.appendChild(meta);

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Add system message
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    try {
        // Check if WebRTC is connected, prefer P2P over WebSocket
        if (webrtc && webrtc.isConnected()) {
            await webrtc.sendMessage(message, true);
            addMessage(message, 'sent', true, 'WebRTC P2P');
        } else {
            // Send via WebSocket with encryption
            const encrypted = await encryption.encrypt(message);
            ws.send(JSON.stringify({
                type: 'chat',
                message: encrypted,
                encrypted: true,
                senderId: clientId
            }));
            addMessage(message, 'sent', true, 'WebSocket');
        }

        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        addSystemMessage('❌ Failed to send message');
    }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

startRtcBtn.addEventListener('click', () => {
    const selectedPeer = peerSelect.value;
    if (!selectedPeer) {
        alert('Please select a peer to connect to');
        return;
    }
    
    if (webrtc) {
        webrtc.createOffer(selectedPeer);
    }
});

showKeyBtn.addEventListener('click', async () => {
    const key = await encryption.exportKey();
    encryptionKeyDisplay.textContent = key;
    keyModal.style.display = 'block';
});

// Modal close
document.querySelector('.close').addEventListener('click', () => {
    keyModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === keyModal) {
        keyModal.style.display = 'none';
    }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Real-Time Chat App');
    addSystemMessage('🚀 Application started');
    addSystemMessage('🔐 End-to-end encryption enabled (AES-256-GCM)');
    initWebSocket();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (webrtc) {
        webrtc.close();
    }
    if (ws) {
        ws.close();
    }
});
