import { Client } from '@stomp/stompjs';
import { baseURL } from './api.js';

const subscribers = new Set();
const entitySubscribers = new Set();
let client = null;
let activeToken = null;
let subscription = null;
let entitySubscription = null;
let reconnectAttempts = 0;

function disconnect() {
  subscription?.unsubscribe();
  subscription = null;
  entitySubscription?.unsubscribe();
  entitySubscription = null;
  const current = client;
  client = null;
  activeToken = null;
  reconnectAttempts = 0;
  current?.deactivate();
}

// Reconnect uses a bounded fixed interval; REST reconciliation on connect prevents
// missed events without adding another client-side timer state machine.
function connect(token) {
  if (!token || (subscribers.size === 0 && entitySubscribers.size === 0)) return;
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
      if (entitySubscribers.size > 0) {
        // Phase 0: recipient-scoped queue. The server fans entity events out
        // per user (see EntityEventAudience); /topic/entities no longer exists.
        entitySubscription = nextClient.subscribe('/user/queue/entities', message => {
          try {
            const evt = JSON.parse(message.body);
            entitySubscribers.forEach(({ handler }) => handler(evt));
          } catch (error) {
            console.warn('Bad entity event payload:', error);
          }
        });
      }
      subscribers.forEach(({ onConnected }) => onConnected?.());
    },
    reconnectDelay: 5000,
  });
  client = nextClient;
  nextClient.activate();
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth:refreshed', () => {
    connect(localStorage.getItem('token'));
  });
  // P0b: a revoked/expired session must not keep a live socket on a dead token.
  // Enforcement never depends on this — the server re-checks every WS frame —
  // but a lingering client would reconnect every 5s and keep receiving broadcasts.
  window.addEventListener('auth:expired', () => disconnectWebSocket());
  window.addEventListener('auth:revoked', () => disconnectWebSocket());
}

export function disconnectWebSocket() {
  disconnect();
}

export function subscribeToNotifications(token, handler, options = {}) {
  if (!token || typeof handler !== 'function') return () => { };

  const subscriber = { handler, onConnected: options.onConnected };
  subscribers.add(subscriber);
  connect(token);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && entitySubscribers.size === 0) disconnect();
  };
}

export function subscribeToEntityEvents(handler) {
  if (typeof handler !== 'function') return () => { };
  const subscriber = { handler };
  entitySubscribers.add(subscriber);
  const token = localStorage.getItem('token');
  if (token) connect(token);

  return () => {
    entitySubscribers.delete(subscriber);
    if (subscribers.size === 0 && entitySubscribers.size === 0) disconnect();
  };
}
