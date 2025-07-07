import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';
import { EventsGateway } from '../events/events.gateway';
import { SeoMeta } from './dto/spell-check-response.dto';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { join } from 'path';

dotenv.config();

@Injectable()
export class WordPressCrawlerService {
  private readonly logger = new Logger(WordPressCrawlerService.name);
  private readonly wordpressApiEndpoint = process.env.WORDPRESS_API_ENDPOINT || '/wp-json/site-export/v1/full';
  private readonly logDirectory = join(process.cwd(), 'logs');

  constructor(
    private readonly httpService: HttpService,
    private readonly eventsGateway: EventsGateway,
  ) { }

  private async clearLogDirectory(directory: string): Promise<void> {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      this.logger.log(`Successfully cleared log directory: ${directory}`);
    } catch (error) {
      this.logger.error(`Error clearing log directory ${directory}: ${error.message}`);
    }
  }

  extractLinksFromHtml(htmlContent: string): string[] {
    const $ = cheerio.load(htmlContent);
    const links: string[] = [];
    $('a').each((i, element) => {
      const href = $(element).attr('href');
      if (href) {
        links.push(href);
      }
    });
    return links;
  }

  extractLinksFromJson(linkObjects: any[]): string[] {
    const links: string[] = [];
    if (Array.isArray(linkObjects)) {
      linkObjects.forEach(linkObj => {
        if (linkObj.href) {
          links.push(linkObj.href);
        }
      });
    }
    return links;
  }

  checkBrokenLinks(links: string[], baseUrl: string): string[] {
    const brokenLinks: string[] = [];
    links.forEach(link => {
      if (link === '#' || link === '') {
        brokenLinks.push(`${baseUrl} -> ${link}`);
      }
    });
    return brokenLinks;
  }

  checkLinksWithTextNoHref(linkObjects: any[], baseUrl: string): string[] {
    const brokenLinks: string[] = [];
    if (Array.isArray(linkObjects)) {
      linkObjects.forEach(linkObj => {
        if (linkObj.text && !linkObj.href) {
          brokenLinks.push(`Link with text but no href: ${linkObj.text} at ${baseUrl}`);
        }
      });
    }
    return brokenLinks;
  }

  async crawlAndExtractContent(baseUrl: string): Promise<{ url: string; textContent: string; seoMeta: SeoMeta; allLinks: string[]; permalink?: string; title?: string; slug?: string }[]> {
    const urlObj = new URL(baseUrl);
    const baseDomain = urlObj.hostname.replace(/\./g, '_');
    const siteLogDirectory = join(this.logDirectory, baseDomain);
    await this.clearLogDirectory(siteLogDirectory);

    const extractedContents: { url: string; textContent: string; seoMeta: SeoMeta; allLinks: string[]; permalink?: string; title?: string; slug?: string }[] = [];
    const newApiUrl = `${baseUrl}${this.wordpressApiEndpoint}`;
    this.logger.log(`Fetching content from custom API: ${newApiUrl}`);
    this.eventsGateway.emitScanProgress(`Fetching content from custom API: ${newApiUrl}`);

    try {
      const response: any = await firstValueFrom(this.httpService.get(newApiUrl));
      const data = response.data;

      if (data.header) {
        const headerLinks = this.extractLinksFromJson(data.header.links);
        const headerBrokenLinks = this.checkLinksWithTextNoHref(data.header.links, `${baseUrl}/header`);
        extractedContents.push({
          url: `${baseUrl}/header`,
          textContent: data.header.text,
          seoMeta: {},
          allLinks: [...headerLinks, ...headerBrokenLinks],
          permalink: `${baseUrl}/header`,
        });
      }
      if (data.footer) {
        const footerLinks = this.extractLinksFromJson(data.footer.links);
        const footerBrokenLinks = this.checkLinksWithTextNoHref(data.footer.links, `${baseUrl}/footer`);
        extractedContents.push({
          url: `${baseUrl}/footer`,
          textContent: data.footer.text,
          seoMeta: {},
          allLinks: [...footerLinks, ...footerBrokenLinks],
          permalink: `${baseUrl}/footer`,
        });
      }

      if (data.pages && Array.isArray(data.pages)) {
        for (const page of data.pages) { // Revert to processing all pages
          const pageSlug = (page.slug || page.SLUG || '').replace(/^\/|\/$/g, '');
          const pagePermalink = page.permalink || page.PERMALINK || `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/${pageSlug}`;
          this.logger.log(`Processing page: ${pagePermalink}`);
          this.eventsGateway.emitScanProgress(`Processing page: ${pagePermalink}`);

          let textContentForSpellCheck = '';
          if (page.text || page.TEXT) {
            textContentForSpellCheck = page.text || page.TEXT;
          } else if (page.content || page.CONTENT) {
            textContentForSpellCheck = cheerio.load(page.content || page.CONTENT).text();
          }

          const seoMeta: SeoMeta = {
            title: page.SEO?.TITLE || page.TITLE,
            description: page.SEO?.META_DESCRIPTION,
          };

          const pageLinks = this.extractLinksFromJson(page.links);
          const pageBrokenLinksWithTextNoHref = this.checkLinksWithTextNoHref(page.links, pagePermalink);
          const pageTitle = page.title || page.TITLE; // Extract title

          extractedContents.push({ url: pagePermalink, textContent: textContentForSpellCheck, seoMeta: seoMeta, allLinks: [...pageLinks, ...pageBrokenLinksWithTextNoHref], permalink: pagePermalink, title: pageTitle, slug: pageSlug });
        }
      }
    } catch (apiError) {
      this.logger.error(`Error fetching from custom API ${newApiUrl}: ${apiError.message}`);
      this.eventsGateway.emitScanProgress(`Error fetching from custom API ${newApiUrl}: ${apiError.message}`);
    }

    return extractedContents;
  }
}
