import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { SpellCheckService } from '../spell-check/spell-check.service';

@WebSocketGateway({
  cors: {
    origin: '*'
  }
})
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    @Inject(forwardRef(() => SpellCheckService))
    private readonly spellCheckService: SpellCheckService,
  ) {}

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
    // Send current scanning status to the newly connected client
    client.emit('scanStatus', { isScanning: this.spellCheckService.getIsScanning() });
  }

  emitScanProgress(message: string) {
    this.logger.log(`Emitting scanProgress: ${message}`);
    this.server.emit('scanProgress', message);
  }

  emitScanComplete(results: any) {
    this.logger.log('Emitting scanComplete');
    this.server.emit('scanComplete', results);
    // Also emit scan status after scan completes
    this.server.emit('scanStatus', { isScanning: false });
  }

  @SubscribeMessage('message')
  handleMessage(@MessageBody() data: string): string {
    this.logger.log(`Received message: ${data}`);
    return data;
  }

  @SubscribeMessage('requestScanStatus')
  handleRequestScanStatus(client: Socket): void {
    client.emit('scanStatus', { isScanning: this.spellCheckService.getIsScanning() });
  }
}