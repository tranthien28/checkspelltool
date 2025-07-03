import { Controller, Get, Param, Delete } from '@nestjs/common';
import { LogViewerService } from './log-viewer.service';

@Controller('logs')
export class LogViewerController {
  constructor(private readonly logViewerService: LogViewerService) {}

  @Get('domains')
  async getDomains() {
    return this.logViewerService.getDomains();
  }

  @Get('urls/:domain')
  async getUrlsForDomain(@Param('domain') domain: string) {
    return this.logViewerService.getUrlsForDomain(domain);
  }

  @Get('content/:domain/:filename') // Changed to :filename
  async getLogContent(@Param('domain') domain: string, @Param('filename') filename: string) {
    return this.logViewerService.getLogContent(domain, filename);
  }

  @Delete('domain/:domain')
  async clearDomainLogs(@Param('domain') domain: string) {
    await this.logViewerService.clearDomainLogs(domain);
    return { message: `Logs for domain ${domain} cleared successfully` };
  }
}
