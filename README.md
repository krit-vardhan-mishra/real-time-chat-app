# 🔒 Real-Time Chat Application

A comprehensive demonstration of **WebSocket**, **WebRTC**, and **End-to-End Encryption** technologies in a real-time chat application.

## 🎯 Features

### 1. WebSocket Communication
- **Real-time bidirectional messaging** between server and clients
- Automatic reconnection on connection loss
- Broadcasting messages to multiple clients
- WebRTC signaling coordination

### 2. WebRTC Peer-to-Peer Connection
- **Direct peer-to-peer data channels** for reduced latency
- ICE candidate exchange for NAT traversal
- STUN server integration for connection establishment
- Automatic fallback to WebSocket when P2P unavailable

### 3. End-to-End Encryption
- **AES-256-GCM encryption** for all messages
- Client-side encryption/decryption using Web Crypto API
- Secure key generation and management
- Visual indicators for encrypted messages

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Modern web browser with WebRTC support

### Installation

1. Clone the repository:
```bash
git clone https://github.com/krit-vardhan-mishra/real-time-chat-app.git
cd real-time-chat-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

5. To test P2P connections, open multiple browser windows/tabs

## 📁 Project Structure

```
real-time-chat-app/
├── server.js              # WebSocket server & signaling server
├── package.json           # Project dependencies
├── public/
│   ├── index.html        # Main HTML interface
│   ├── styles.css        # Application styling
│   ├── app.js            # Main application logic
│   ├── encryption.js     # E2E encryption module
│   └── webrtc.js         # WebRTC connection manager
└── README.md
```

## 🔧 How It Works

### WebSocket Implementation
The server uses the `ws` library to create a WebSocket server:
- Maintains a map of connected clients
- Broadcasts messages to all connected clients
- Handles WebRTC signaling messages (offer, answer, ICE candidates)
- Provides peer discovery functionality

### WebRTC Implementation
Client-side WebRTC uses RTCPeerConnection and RTCDataChannel:
- **Signaling**: Coordinated through WebSocket server
- **ICE Servers**: Uses Google's public STUN servers
- **Data Channel**: Establishes direct P2P communication
- **Fallback**: Automatically uses WebSocket if P2P fails

### Encryption Implementation
Uses Web Crypto API for encryption:
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Generation**: Random 256-bit keys per session
- **IV**: Unique initialization vector per message
- **Process**: Messages encrypted before transmission, decrypted on receipt

## 🎮 Usage

1. **Start Chatting**: 
   - Messages are automatically encrypted and sent via WebSocket
   - Green border indicates encrypted messages

2. **Enable P2P Connection**:
   - Select a peer from the dropdown
   - Click "Start P2P Connection"
   - Once connected, messages route through WebRTC data channel

3. **View Encryption Key**:
   - Click "Show Encryption Key" to see your AES key
   - In production, keys should be exchanged securely

## 🧪 Testing

To test all features:

1. **WebSocket**: Open one browser window - messages show WebSocket status
2. **WebRTC**: Open two windows - connect them P2P and verify direct connection
3. **Encryption**: All messages are automatically encrypted (see 🔒 indicator)

## 🔒 Security Notes

⚠️ **This is a learning/demonstration project:**
- Encryption keys are generated per session (not shared between clients)
- In production, implement proper key exchange (e.g., Diffie-Hellman)
- Add authentication and authorization
- Use secure WebSocket (WSS) in production
- Implement rate limiting and input validation

## 🛠️ Technologies Used

- **Backend**: Node.js, Express, ws (WebSocket library)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time**: WebSocket, WebRTC (RTCPeerConnection, RTCDataChannel)
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Signaling**: Custom WebSocket-based signaling

## 📚 Learning Resources

- [WebSocket API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WebRTC API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Web Crypto API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM Encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)

## 📝 License

MIT License - Feel free to use this project for learning purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## 👨‍💻 Author

Created as a learning project to understand real-time communication technologies.
