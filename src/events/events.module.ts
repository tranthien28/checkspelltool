import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Module({
  providers: [EventsGateway],
  exports: [EventsGateway] // Export the gateway so it can be used in other modules
})
export class EventsModule {}
