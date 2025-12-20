import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly connectedClients: Map<string, string> = new Map(); // socketId -> userId

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} attempted to connect without token`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token);
      const userId = payload.userId;

      // Store client connection
      this.connectedClients.set(client.id, userId);

      // Join user-specific room
      client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} connected as user ${userId}`);

      // Send connection confirmation
      client.emit('connected', { userId, message: 'Connected to notifications' });
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedClients.get(client.id);
    this.connectedClients.delete(client.id);
    this.logger.log(`Client ${client.id} (user: ${userId}) disconnected`);
  }

  @SubscribeMessage('subscribe:ticket')
  handleSubscribeToTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ticketId: string },
  ) {
    client.join(`ticket:${data.ticketId}`);
    this.logger.log(`Client ${client.id} subscribed to ticket ${data.ticketId}`);
    return { event: 'subscribed', data: { ticketId: data.ticketId } };
  }

  @SubscribeMessage('unsubscribe:ticket')
  handleUnsubscribeFromTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ticketId: string },
  ) {
    client.leave(`ticket:${data.ticketId}`);
    this.logger.log(`Client ${client.id} unsubscribed from ticket ${data.ticketId}`);
    return { event: 'unsubscribed', data: { ticketId: data.ticketId } };
  }

  @SubscribeMessage('subscribe:project')
  handleSubscribeToProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    client.join(`project:${data.projectId}`);
    this.logger.log(`Client ${client.id} subscribed to project ${data.projectId}`);
    return { event: 'subscribed', data: { projectId: data.projectId } };
  }

  @SubscribeMessage('unsubscribe:project')
  handleUnsubscribeFromProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    client.leave(`project:${data.projectId}`);
    this.logger.log(`Client ${client.id} unsubscribed from project ${data.projectId}`);
    return { event: 'unsubscribed', data: { projectId: data.projectId } };
  }

  // Methods to emit events from services
  notifyUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
    this.logger.debug(`Emitted ${event} to user ${userId}`);
  }

  notifyTicket(ticketId: string, event: string, data: any) {
    this.server.to(`ticket:${ticketId}`).emit(event, data);
    this.logger.debug(`Emitted ${event} to ticket ${ticketId}`);
  }

  notifyProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
    this.logger.debug(`Emitted ${event} to project ${projectId}`);
  }

  broadcast(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.debug(`Broadcasted ${event} to all clients`);
  }
}
