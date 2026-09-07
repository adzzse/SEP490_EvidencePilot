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

// ponytail: exponential backoff was YAGNI for low-freq notifications — static 5s.
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
        entitySubscription = nextClient.subscribe('/topic/entities', message => {
          try {
            const evt = JSON.parse(message.body);
            entitySubscribers.forEach(({ handler }) => handler(evt));
          } catch (error) {
            console.warn('Bad entity event payload:', error);
          }
        });
      }
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
}

export function subscribeToNotifications(token, handler) {
  if (!token || typeof handler !== 'function') return () => { };

  const subscriber = { handler };
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
