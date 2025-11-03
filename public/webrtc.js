// WebRTC Peer Connection Manager
class WebRTCManager {
    constructor(websocket) {
        this.ws = websocket;
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.connectedPeerId = null;
        
        // ICE server configuration (using public STUN servers)
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    // Create a peer connection
    async createPeerConnection(targetPeerId) {
        try {
            this.connectedPeerId = targetPeerId;
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Set up ICE candidate handling
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('📡 Sending ICE candidate');
                    this.ws.send(JSON.stringify({
                        type: 'ice-candidate',
                        targetId: this.connectedPeerId,
                        candidate: event.candidate
                    }));
                }
            };

            // Monitor connection state
            this.peerConnection.onconnectionstatechange = () => {
                console.log('🔗 Connection state:', this.peerConnection.connectionState);
                updateRTCStatus(this.peerConnection.connectionState);
                
                if (this.peerConnection.connectionState === 'connected') {
                    addSystemMessage('✅ WebRTC peer-to-peer connection established!');
                } else if (this.peerConnection.connectionState === 'disconnected' || 
                           this.peerConnection.connectionState === 'failed') {
                    addSystemMessage('❌ WebRTC connection lost');
                }
            };

            // Handle incoming data channel
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };

            return this.peerConnection;
        } catch (error) {
            console.error('Error creating peer connection:', error);
            throw error;
        }
    }

    // Create an offer (initiator side)
    async createOffer(targetPeerId) {
        try {
            this.isInitiator = true;
            await this.createPeerConnection(targetPeerId);

            // Create data channel
            this.dataChannel = this.peerConnection.createDataChannel('chat', {
                ordered: true
            });
            this.setupDataChannel();

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            console.log('📤 Sending offer to peer');
            this.ws.send(JSON.stringify({
                type: 'offer',
                targetId: targetPeerId,
                offer: offer
            }));

            addSystemMessage('📡 Initiating WebRTC connection...');
        } catch (error) {
            console.error('Error creating offer:', error);
            addSystemMessage('❌ Failed to create WebRTC offer');
        }
    }

    // Handle incoming offer (receiver side)
    async handleOffer(offer, senderId) {
        try {
            this.isInitiator = false;
            await this.createPeerConnection(senderId);

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create and send answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log('📤 Sending answer to peer');
            this.ws.send(JSON.stringify({
                type: 'answer',
                targetId: senderId,
                answer: answer
            }));

            addSystemMessage('📡 Accepting WebRTC connection...');
        } catch (error) {
            console.error('Error handling offer:', error);
            addSystemMessage('❌ Failed to handle WebRTC offer');
        }
    }

    // Handle incoming answer (initiator side)
    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('✅ Answer received and processed');
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    // Handle incoming ICE candidate
    async handleIceCandidate(candidate) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('📡 ICE candidate added');
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    // Set up data channel event handlers
    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('✅ Data channel opened');
            addSystemMessage('✅ P2P data channel is ready!');
        };

        this.dataChannel.onclose = () => {
            console.log('❌ Data channel closed');
            addSystemMessage('❌ P2P data channel closed');
        };

        this.dataChannel.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.encrypted) {
                    const decrypted = await encryption.decrypt(data.message);
                    addMessage(decrypted, 'received', true, 'WebRTC P2P');
                } else {
                    addMessage(data.message, 'received', false, 'WebRTC P2P');
                }
            } catch (error) {
                console.error('Error handling data channel message:', error);
            }
        };
    }

    // Send message through data channel
    async sendMessage(message, encrypt = true) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('Data channel is not open');
        }

        let messageData;
        if (encrypt) {
            const encrypted = await encryption.encrypt(message);
            messageData = { message: encrypted, encrypted: true };
        } else {
            messageData = { message: message, encrypted: false };
        }

        this.dataChannel.send(JSON.stringify(messageData));
    }

    // Close connection
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.connectedPeerId = null;
        updateRTCStatus('disconnected');
    }

    // Check if connected
    isConnected() {
        return this.dataChannel && this.dataChannel.readyState === 'open';
    }
}

// Will be initialized after WebSocket connection
let webrtc = null;
