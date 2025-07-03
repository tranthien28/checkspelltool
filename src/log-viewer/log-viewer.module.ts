import { Module } from '@nestjs/common';
import { LogViewerService } from './log-viewer.service';
import { LogViewerController } from './log-viewer.controller';

@Module({
  providers: [LogViewerService],
  controllers: [LogViewerController],
})
export class LogViewerModule {}
