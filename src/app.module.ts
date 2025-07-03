import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { SpellCheckModule } from './spell-check/spell-check.module';
import { EventsModule } from './events/events.module';
import { LogViewerModule } from './log-viewer/log-viewer.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    SpellCheckModule,
    EventsModule,
    LogViewerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}