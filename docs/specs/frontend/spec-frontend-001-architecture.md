# 🎨 SPEC-FRONTEND-001: Frontend Architecture
## Next.js 14 + Real-time Kanban Board

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft
**Stack:** Next.js 14 (App Router), TypeScript, TailwindCSS, Socket.io

---

## 1. Arquitectura del Frontend

### 1.1 Stack Tecnológico

```
┌─────────────────────────────────────────┐
│ Framework: Next.js 14 (App Router)      │
├─────────────────────────────────────────┤
│ Language: TypeScript 5.x                │
│ Styling: Tailwind CSS + Shadcn/UI       │
│ State (Server): TanStack Query (v5)     │
│ State (Client): Zustand                 │
│ Forms: React Hook Form + Zod            │
│ Drag & Drop: @dnd-kit/core              │
│ Real-time: Socket.io-client             │
│ HTTP Client: Axios + interceptors       │
│ Auth: NextAuth.js (JWT strategy)        │
└─────────────────────────────────────────┘
```

### 1.2 Estructura de Proyecto

```
apps/web/                           # Next.js app
├── src/
│   ├── app/                        # App Router
│   │   ├── (auth)/                # Auth layout
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (dashboard)/           # Dashboard layout
│   │   │   ├── projects/
│   │   │   ├── projects/[id]/
│   │   │   │   ├── board/         # Kanban Board
│   │   │   │   └── settings/
│   │   │   └── profile/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/                # React components
│   │   ├── ui/                    # Shadcn components
│   │   ├── kanban/                # Board components
│   │   │   ├── Board.tsx
│   │   │   ├── Column.tsx
│   │   │   ├── TicketCard.tsx
│   │   │   └── DraggableTicket.tsx
│   │   ├── tickets/               # Ticket components
│   │   │   ├── TicketDetail.tsx
│   │   │   ├── CreateTicketModal.tsx
│   │   │   └── CommentSection.tsx
│   │   └── shared/                # Shared components
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       └── Notifications.tsx
│   │
│   ├── lib/                       # Utilities
│   │   ├── api/                   # API clients
│   │   │   ├── auth.ts
│   │   │   ├── tickets.ts
│   │   │   └── projects.ts
│   │   ├── socket/                # WebSocket
│   │   │   └── socket-client.ts
│   │   ├── stores/                # Zustand stores
│   │   │   ├── auth-store.ts
│   │   │   ├── ui-store.ts
│   │   │   └── board-store.ts
│   │   └── utils/
│   │       ├── cn.ts              # className merger
│   │       ├── date.ts
│   │       └── validators.ts
│   │
│   ├── hooks/                     # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useSocket.ts
│   │   ├── useTickets.ts
│   │   └── useOptimisticUpdate.ts
│   │
│   ├── types/                     # TypeScript types
│   │   ├── ticket.ts
│   │   ├── project.ts
│   │   └── user.ts
│   │
│   └── middleware.ts              # Next.js middleware (auth)
│
├── public/
├── tailwind.config.ts
├── next.config.js
└── package.json
```

---

## 2. Routing & Layouts

### 2.1 App Router Structure

```typescript
// app/layout.tsx - Root Layout
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Toaster />
          {children}
        </Providers>
      </body>
    </html>
  );
}

// app/(dashboard)/layout.tsx - Dashboard Layout
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
```

### 2.2 Route Protection (Middleware)

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/projects')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Redirect authenticated users away from auth pages
  if (request.nextUrl.pathname.startsWith('/login')) {
    if (token) {
      return NextResponse.redirect(new URL('/projects', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/projects/:path*', '/login', '/register'],
};
```

---

## 3. State Management

### 3.1 Server State (TanStack Query)

```typescript
// hooks/useTickets.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '@/lib/api/tickets';

export function useTickets(projectId: string) {
  return useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => ticketsApi.getByProject(projectId),
    staleTime: 30000, // 30 seconds
  });
}

export function useCreateTicket(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ticketsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: string }) =>
      ticketsApi.updateStatus(ticketId, status),
    onMutate: async ({ ticketId, status }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['tickets'] });

      const previousTickets = queryClient.getQueryData(['tickets']);

      queryClient.setQueryData(['tickets'], (old: any) => {
        return old.map((ticket: any) =>
          ticket.id === ticketId ? { ...ticket, status } : ticket
        );
      });

      return { previousTickets };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousTickets) {
        queryClient.setQueryData(['tickets'], context.previousTickets);
      }
    },
  });
}
```

### 3.2 Client State (Zustand)

```typescript
// lib/stores/ui-store.ts
import { create } from 'zustand';

interface UIStore {
  isSidebarOpen: boolean;
  isCreateTicketModalOpen: boolean;
  selectedTicketId: string | null;
  toggleSidebar: () => void;
  openCreateTicketModal: () => void;
  closeCreateTicketModal: () => void;
  selectTicket: (ticketId: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSidebarOpen: true,
  isCreateTicketModalOpen: false,
  selectedTicketId: null,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  openCreateTicketModal: () => set({ isCreateTicketModalOpen: true }),
  closeCreateTicketModal: () => set({ isCreateTicketModalOpen: false }),
  selectTicket: (ticketId) => set({ selectedTicketId: ticketId }),
}));
```

---

## 4. Real-time con WebSockets

### 4.1 Socket Client

```typescript
// lib/socket/socket-client.ts
import { io, Socket } from 'socket.io-client';

class SocketClient {
  private socket: Socket | null = null;

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io(process.env.NEXT_PUBLIC_GATEWAY_URL!, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket!.id);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  joinProject(projectId: string) {
    this.socket?.emit('joinProject', { projectId });
  }

  leaveProject(projectId: string) {
    this.socket?.emit('leaveProject', { projectId });
  }

  onTicketUpdated(callback: (data: any) => void) {
    this.socket?.on('ticketUpdated', callback);
  }

  onTicketAssigned(callback: (data: any) => void) {
    this.socket?.on('ticketAssigned', callback);
  }

  off(event: string) {
    this.socket?.off(event);
  }
}

export const socketClient = new SocketClient();
```

### 4.2 Socket Hook

```typescript
// hooks/useSocket.ts
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket/socket-client';

export function useSocket(projectId: string | null) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session?.accessToken || !projectId) return;

    // Connect socket
    socketClient.connect(session.accessToken);
    socketClient.joinProject(projectId);

    // Listen to real-time events
    socketClient.onTicketUpdated((data) => {
      console.log('Ticket updated:', data);
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] });
    });

    socketClient.onTicketAssigned((data) => {
      console.log('Ticket assigned:', data);
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] });
    });

    return () => {
      socketClient.leaveProject(projectId);
      socketClient.off('ticketUpdated');
      socketClient.off('ticketAssigned');
    };
  }, [session, projectId, queryClient]);
}
```

---

## 5. Kanban Board con Drag & Drop

### 5.1 Board Component

```typescript
// components/kanban/Board.tsx
'use client';

import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { Column } from './Column';
import { TicketCard } from './TicketCard';
import { useTickets, useUpdateTicketStatus } from '@/hooks/useTickets';
import { useState } from 'react';

interface BoardProps {
  projectId: string;
}

export function Board({ projectId }: BoardProps) {
  const { data: tickets, isLoading } = useTickets(projectId);
  const updateStatus = useUpdateTicketStatus();
  const [activeTicket, setActiveTicket] = useState(null);

  const columns = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

  const handleDragStart = (event: any) => {
    setActiveTicket(event.active.data.current);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const ticketId = active.id as string;
      const newStatus = over.id as string;

      updateStatus.mutate({ ticketId, status: newStatus });
    }

    setActiveTicket(null);
  };

  if (isLoading) return <div>Loading board...</div>;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-6 h-full overflow-x-auto">
        {columns.map((status) => (
          <Column
            key={status}
            status={status}
            tickets={tickets?.filter((t) => t.status === status) || []}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTicket ? <TicketCard ticket={activeTicket} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
```

### 5.2 Draggable Ticket

```typescript
// components/kanban/DraggableTicket.tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TicketCard } from './TicketCard';

export function DraggableTicket({ ticket }: { ticket: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, data: ticket });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TicketCard ticket={ticket} />
    </div>
  );
}
```

---

## 6. Authentication

### 6.1 NextAuth Configuration

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { authApi } from '@/lib/api/auth';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials) return null;

        const user = await authApi.login({
          email: credentials.email,
          password: credentials.password,
        });

        if (user) {
          return user;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
      }

      // Google OAuth
      if (account?.provider === 'google' && account.id_token) {
        const result = await authApi.googleAuth(account.id_token);
        token.accessToken = result.accessToken;
        token.refreshToken = result.refreshToken;
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

---

## 7. API Client

### 7.1 Axios Instance

```typescript
// lib/api/client.ts
import axios from 'axios';
import { getSession } from 'next-auth/react';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(async (config) => {
  const session = await getSession();

  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }

  return config;
});

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export { apiClient };
```

---

## 8. Performance Optimizations

### 8.1 Optimistic Updates

```typescript
// Ya implementado en useUpdateTicketStatus (ver sección 3.1)
```

### 8.2 Virtual Scrolling (Para tableros grandes)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualColumn({ tickets }: { tickets: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <TicketCard ticket={tickets[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 9. Environment Variables

```env
# .env.local

# API
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000

# Auth
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=<random-secret>

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
```

---

## 10. Testing

```typescript
// __tests__/components/Board.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Board } from '@/components/kanban/Board';

const queryClient = new QueryClient();

describe('Board', () => {
  it('should render columns', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Board projectId="test-project" />
      </QueryClientProvider>
    );

    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
  });
});
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
