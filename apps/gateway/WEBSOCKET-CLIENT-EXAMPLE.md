# WebSocket Client Example

Este documento muestra cómo conectarse al Gateway WebSocket para recibir notificaciones en tiempo real.

## Conexión

### JavaScript/TypeScript (usando socket.io-client)

```typescript
import { io } from 'socket.io-client';

// Obtener token JWT después del login
const token = 'your-jwt-access-token';

// Conectar al namespace de notificaciones
const socket = io('http://localhost:3000/notifications', {
  auth: {
    token: token
  }
});

// Evento de conexión exitosa
socket.on('connected', (data) => {
  console.log('Connected to notifications:', data);
  // Output: { userId: 'uuid', message: 'Connected to notifications' }
});

// Manejar errores de conexión
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

// Evento cuando se desconecta
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

## Suscribirse a Eventos

### Suscribirse a un Ticket específico

```typescript
// Suscribirse a actualizaciones de un ticket
socket.emit('subscribe:ticket', { ticketId: 'ticket-uuid-123' });

// Escuchar respuesta de suscripción
socket.on('subscribed', (data) => {
  console.log('Subscribed:', data);
  // Output: { ticketId: 'ticket-uuid-123' }
});

// Escuchar actualizaciones del ticket
socket.on('ticket:updated', (data) => {
  console.log('Ticket updated:', data);
  // Output: { ticketId, title, status, ... }
});

socket.on('ticket:comment:added', (data) => {
  console.log('New comment:', data);
  // Output: { ticketId, commentId, authorId, content, ... }
});

// Desuscribirse del ticket
socket.emit('unsubscribe:ticket', { ticketId: 'ticket-uuid-123' });
```

### Suscribirse a un Proyecto

```typescript
// Suscribirse a todos los eventos de un proyecto
socket.emit('subscribe:project', { projectId: 'project-uuid-456' });

socket.on('subscribed', (data) => {
  console.log('Subscribed to project:', data);
});

// Escuchar eventos del proyecto
socket.on('project:ticket:created', (data) => {
  console.log('New ticket in project:', data);
});

socket.on('project:ticket:assigned', (data) => {
  console.log('Ticket assigned in project:', data);
});

// Desuscribirse del proyecto
socket.emit('unsubscribe:project', { projectId: 'project-uuid-456' });
```

## Eventos de Notificación

### Eventos de Usuario (automático)

Cuando te conectas, automáticamente te suscribes a eventos dirigidos a tu usuario:

```typescript
// Notificación cuando te asignan un ticket
socket.on('notification:ticket:assigned', (data) => {
  console.log('You were assigned to a ticket:', data);
  // Output: { ticketId, title, assignedBy, ... }
});

// Notificación cuando te mencionan en un comentario
socket.on('notification:mentioned', (data) => {
  console.log('You were mentioned:', data);
  // Output: { ticketId, commentId, mentionedBy, ... }
});

// Notificación genérica
socket.on('notification', (data) => {
  console.log('Notification:', data);
});
```

### Eventos de Ticket

```typescript
socket.on('ticket:created', (data) => {
  console.log('Ticket created:', data);
});

socket.on('ticket:updated', (data) => {
  console.log('Ticket updated:', data);
});

socket.on('ticket:status:changed', (data) => {
  console.log('Ticket status changed:', data);
  // Output: { ticketId, oldStatus, newStatus, changedBy }
});

socket.on('ticket:deleted', (data) => {
  console.log('Ticket deleted:', data);
});

socket.on('ticket:comment:added', (data) => {
  console.log('Comment added:', data);
});
```

### Eventos de Asignación

```typescript
socket.on('assignment:created', (data) => {
  console.log('User assigned:', data);
  // Output: { ticketId, userId, assignedBy }
});

socket.on('assignment:removed', (data) => {
  console.log('User unassigned:', data);
});
```

## Ejemplo Completo - React Hook

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useNotifications(token: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;

    // Conectar
    const newSocket = io('http://localhost:3000/notifications', {
      auth: { token }
    });

    newSocket.on('connected', () => {
      console.log('Connected to notifications');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from notifications');
      setConnected(false);
    });

    // Escuchar notificaciones
    newSocket.on('notification', (data) => {
      setNotifications(prev => [...prev, data]);
    });

    newSocket.on('ticket:updated', (data) => {
      console.log('Ticket updated in real-time:', data);
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.close();
    };
  }, [token]);

  const subscribeToTicket = (ticketId: string) => {
    socket?.emit('subscribe:ticket', { ticketId });
  };

  const unsubscribeFromTicket = (ticketId: string) => {
    socket?.emit('unsubscribe:ticket', { ticketId });
  };

  const subscribeToProject = (projectId: string) => {
    socket?.emit('subscribe:project', { projectId });
  };

  const unsubscribeFromProject = (projectId: string) => {
    socket?.emit('unsubscribe:project', { projectId });
  };

  return {
    socket,
    connected,
    notifications,
    subscribeToTicket,
    unsubscribeFromTicket,
    subscribeToProject,
    unsubscribeFromProject,
  };
}
```

## Uso en Componente React

```tsx
import { useNotifications } from './useNotifications';

function Dashboard() {
  const { connected, subscribeToTicket, notifications } = useNotifications(accessToken);

  useEffect(() => {
    if (connected && currentTicketId) {
      subscribeToTicket(currentTicketId);
    }
  }, [connected, currentTicketId]);

  return (
    <div>
      <div>Status: {connected ? 'Connected' : 'Disconnected'}</div>
      <div>
        {notifications.map((notif, i) => (
          <div key={i}>{JSON.stringify(notif)}</div>
        ))}
      </div>
    </div>
  );
}
```

## Instalación de Dependencias

```bash
npm install socket.io-client
```

## URLs de Conexión

- **Desarrollo**: `ws://localhost:3000/notifications`
- **Producción**: `wss://your-domain.com/notifications`

## Autenticación

El WebSocket requiere un JWT válido. Hay dos formas de enviarlo:

1. **En el handshake auth** (recomendado):
```typescript
io('http://localhost:3000/notifications', {
  auth: { token: 'your-jwt-token' }
});
```

2. **En headers**:
```typescript
io('http://localhost:3000/notifications', {
  extraHeaders: {
    authorization: 'Bearer your-jwt-token'
  }
});
```

## Manejo de Errores

```typescript
socket.on('connect_error', (error) => {
  if (error.message === 'Authentication failed') {
    console.error('Invalid token, please login again');
    // Redirect to login
  }
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

## Reconexión Automática

Socket.IO maneja reconexiones automáticamente por defecto. Para configurar:

```typescript
const socket = io('http://localhost:3000/notifications', {
  auth: { token },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});
```
