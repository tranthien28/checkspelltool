import { Module, forwardRef } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { SpellCheckModule } from '../spell-check/spell-check.module';

@Module({
  imports: [forwardRef(() => SpellCheckModule)],
  providers: [EventsGateway],
  exports: [EventsGateway]
})
export class EventsModule {}
