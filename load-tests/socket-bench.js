import ws from 'k6/ws';
import { check, sleep } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '10s', target: 50 },  // Ramp up to 50 concurrent virtual users
    { duration: '30s', target: 200 }, // Scale to 200 virtual users emitting messages
    { duration: '10s', target: 0 },   // Cool down
  ],
  thresholds: {
    'ws_connecting': ['p(95)<100'], // 95% of WS connections complete under 100ms
  },
};

export default function () {
  const url = 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';
  
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Send Socket.IO handshake message
      socket.send('40');
      
      // Simulate real-time chat payload
      socket.setInterval(() => {
        const payload = JSON.stringify({
          conversationId: 1,
          content: 'Benchmark load test message payload',
        });
        socket.send(`42["send_message", ${payload}]`);
      }, 1000);
    });

    socket.on('message', (data) => {
      check(data, {
        'message received': (d) => d !== undefined,
      });
    });

    socket.setTimeout(() => {
      socket.close();
    }, 45000);
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
