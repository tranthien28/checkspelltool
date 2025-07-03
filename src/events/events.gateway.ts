import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*'
  }
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  emitScanProgress(message: string) {
    this.logger.log(`Emitting scanProgress: ${message}`);
    this.server.emit('scanProgress', message);
  }

  emitScanComplete(results: any) {
    this.logger.log('Emitting scanComplete');
    this.server.emit('scanComplete', results);
  }

  @SubscribeMessage('message')
  handleMessage(@MessageBody() data: string): string {
    this.logger.log(`Received message: ${data}`);
    return data;
  }
}