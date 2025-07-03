import { Controller, Post, Body, Logger } from '@nestjs/common';
import { SpellCheckService } from './spell-check.service';
import { WordPressCrawlerService } from './wordpress-crawler.service';
import { CheckSpellDto } from './dto/check-spell.dto';
import { SpellCheckResponseDto, SpellError, SeoIssue } from './dto/spell-check-response.dto';
import { EventsGateway } from '../events/events.gateway';

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
    const { url, model, checkTypes } = checkSpellDto;
    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`Received request to check spelling for URL: ${normalizedUrl} with model: ${model} and check types: ${checkTypes.join(', ')}`);
    this.eventsGateway.emitScanProgress(`Starting scan for URL: ${normalizedUrl} with model: ${model} and check types: ${checkTypes.join(', ')}`);

    const extractedContents = await this.wordPressCrawlerService.crawlAndExtractContent(normalizedUrl);

    const allErrors: SpellError[] = [];
    const allSeoIssues: SeoIssue[] = [];
    const allBrokenLinks: string[] = [];

    for (const content of extractedContents) {
      this.logger.log(`Checking content from: ${content.url}`);

      const currentContentErrors: SpellError[] = [];
      const currentContentSeoIssues: SeoIssue[] = [];
      let currentContentBrokenLinks: string[] = [];

      if (checkTypes.includes('spellCheck')) {
        const errors = await this.spellCheckService.promptCheck(content.textContent, model);
        if (errors.length > 0) {
          currentContentErrors.push(...errors.map(err => ({ ...err, url: content.url, model })));
        }
      }

      if (checkTypes.includes('brokenLinks')) {
        currentContentBrokenLinks = this.wordPressCrawlerService.checkBrokenLinks(content.allLinks, content.url);
      }

      if (checkTypes.includes('seoIndex')) {
        const seoIssues = this.spellCheckService.analyzeSeo(content.seoMeta, content.url);
        if (seoIssues.length > 0) {
          currentContentSeoIssues.push(...seoIssues);
        }
      }

      // Log errors for the current content
      await this.spellCheckService.logErrors(
        content.slug || content.title || content.url, // Use slug for logging, fallback to title, then url
        currentContentErrors,
        content.textContent,
        model, // Log with single model name
        currentContentSeoIssues,
        currentContentBrokenLinks,
        extractedContents.length,
        content.permalink || content.url, // Provide a fallback for permalink
      );

      allErrors.push(...currentContentErrors);
      allSeoIssues.push(...currentContentSeoIssues);
      allBrokenLinks.push(...currentContentBrokenLinks);
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
  }
}