import { Client } from '@stomp/stompjs';
import { baseURL } from './api.js';

const subscribers = new Set();
let client = null;
let activeToken = null;
let subscription = null;

function disconnect() {
  subscription?.unsubscribe();
  subscription = null;
  const current = client;
  client = null;
  activeToken = null;
  current?.deactivate();
}

function connect(token) {
  if (!token || subscribers.size === 0) return;
  if (client && activeToken === token) return;

  disconnect();
  activeToken = token;
  const nextClient = new Client({
    brokerURL: baseURL.replace(/^http/, 'ws') + '/ws',
    connectHeaders: { Authorization: `Bearer ${token}` },
    onConnect: () => {
      if (client !== nextClient) return;
      subscription = nextClient.subscribe('/user/queue/notifications', message => {
        try {
          const notification = JSON.parse(message.body);
          subscribers.forEach(({ handler }) => handler(notification));
        } catch (error) {
          console.warn('Bad notification payload:', error);
        }
      });
    },
    reconnectDelay: 5000,
  });
  client = nextClient;
  nextClient.activate();
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth:refreshed', () => connect(localStorage.getItem('token')));
}

export function subscribeToNotifications(token, handler) {
  if (!token || typeof handler !== 'function') return () => {};

  const subscriber = { handler };
  subscribers.add(subscriber);
  connect(token);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) disconnect();
  };
}
