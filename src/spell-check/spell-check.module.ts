import { Module, forwardRef } from '@nestjs/common';
import { SpellCheckController } from './spell-check.controller';
import { SpellCheckService } from './spell-check.service';
import { WordPressCrawlerService } from './wordpress-crawler.service';
import { HttpModule } from '@nestjs/axios';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [HttpModule, forwardRef(() => EventsModule)],
  controllers: [SpellCheckController],
  providers: [SpellCheckService, WordPressCrawlerService],
  exports: [SpellCheckService] // Export SpellCheckService
})
export class SpellCheckModule {}