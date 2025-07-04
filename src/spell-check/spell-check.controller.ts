import { Controller, Post, Body, Logger } from '@nestjs/common';
import { SpellCheckService } from './spell-check.service';
import { WordPressCrawlerService } from './wordpress-crawler.service';
import { CheckSpellDto } from './dto/check-spell.dto';
import { SpellCheckResponseDto, SpellError, SeoIssue } from './dto/spell-check-response.dto';
import { EventsGateway } from '../events/events.gateway';
import { name as spellCheckName } from './prompts/spell-check.prompt'; // Import the name from the prompt file

@Controller('spell-check')
export class SpellCheckController {
  private readonly logger = new Logger(SpellCheckController.name);

  constructor(
    private readonly spellCheckService: SpellCheckService,
    private readonly wordPressCrawlerService: WordPressCrawlerService,
    private readonly eventsGateway: EventsGateway,
  ){}

  private normalizeUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  @Post()
  async checkSpelling(@Body() checkSpellDto: CheckSpellDto): Promise<SpellCheckResponseDto> {
    if (this.spellCheckService.getIsScanning()) {
      this.logger.warn('Scan already in progress. Ignoring new request.');
      throw new Error('A scan is already in progress. Please wait for it to complete.');
    }

    const { url, model, checkTypes } = checkSpellDto;
    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`Received request to check spelling for URL: ${normalizedUrl} with model: ${model} and check types: ${checkTypes.join(', ')}`);
    this.eventsGateway.emitScanProgress(`Starting scan for URL: ${normalizedUrl} with model: ${model} and check types: ${checkTypes.join(', ')}`);

    try {
      const extractedContents = await this.wordPressCrawlerService.crawlAndExtractContent(normalizedUrl);

      const allErrors: SpellError[] = [];
      const allSeoIssues: SeoIssue[] = [];
      const allBrokenLinks: string[] = [];
      let promptForLogging: string = '';

      const checkTypeNames: { [key: string]: string } = {
        spellCheck: spellCheckName,
        brokenLinks: 'Kiểm tra Đường dẫn lỗi',
        dataConsistency: 'Kiểm tra tính nhất quán của dữ liệu',
      };

      for (const content of extractedContents) {
        this.logger.log(`Checking content from: ${content.url}`);

        const currentContentErrors: SpellError[] = [];
        const currentContentSeoIssues: SeoIssue[] = [];
        let currentContentBrokenLinks: string[] = [];

        try {
          if (checkTypes.includes('spellCheck')) {
            const { errors, prompt: generatedPrompt } = await this.spellCheckService.promptCheck(content.textContent, model);
            if (errors.length > 0) {
              currentContentErrors.push(...errors.map(err => ({ ...err, url: content.url, model })));
            }
            promptForLogging = generatedPrompt;
          }

          if (checkTypes.includes('brokenLinks')) {
            currentContentBrokenLinks = this.wordPressCrawlerService.checkBrokenLinks(content.allLinks, content.url);
          }

          // Log errors for the current content
          await this.spellCheckService.logErrors(
            content.slug || content.title || content.url,
            currentContentErrors,
            content.textContent,
            model,
            currentContentSeoIssues,
            currentContentBrokenLinks,
            extractedContents.length,
            content.permalink || content.url,
            promptForLogging,
            checkTypes.map(type => checkTypeNames[type])
          );

          allErrors.push(...currentContentErrors);
          allSeoIssues.push(...currentContentSeoIssues);
          allBrokenLinks.push(...currentContentBrokenLinks);
        } catch (contentError) {
          this.logger.error(`Error processing content from ${content.url}: ${contentError.message}`);
          this.eventsGateway.emitScanProgress(`Error processing content from ${content.url}: ${contentError.message}`);
        }
      }

      const response: SpellCheckResponseDto = {
        originalUrl: url,
        errors: allErrors,
        seoIssues: allSeoIssues,
        brokenLinks: allBrokenLinks,
        hasErrors: allErrors.length > 0 || allSeoIssues.length > 0 || allBrokenLinks.length > 0,
      };

      this.eventsGateway.emitScanComplete(response);
      return response;
    } catch (error) {
      this.logger.error(`Error during scan: ${error.message}`);
      this.eventsGateway.emitScanProgress(`Error during scan: ${error.message}`);
      throw error;
    }
  }
}