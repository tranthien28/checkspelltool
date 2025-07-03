import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';
import { EventsGateway } from '../events/events.gateway';
import { SeoMeta } from './dto/spell-check-response.dto';

@Injectable()
export class WordPressCrawlerService {
  private readonly logger = new Logger(WordPressCrawlerService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly eventsGateway: EventsGateway,
  ) { }

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

  async crawlAndExtractContent(baseUrl: string): Promise<{ url: string; textContent: string; seoMeta: SeoMeta; allLinks: string[]; permalink?: string; title?: string; slug?: string }[]> {
    const extractedContents: { url: string; textContent: string; seoMeta: SeoMeta; allLinks: string[]; permalink?: string; title?: string; slug?: string }[] = [];
    const newApiUrl = `${baseUrl}/wp-json/site-export/v1/full`;
    this.logger.log(`Fetching content from custom API: ${newApiUrl}`);
    this.eventsGateway.emitScanProgress(`Fetching content from custom API: ${newApiUrl}`);

    try {
      const response: any = await firstValueFrom(this.httpService.get(newApiUrl));
      const data = response.data;

      if (data.header) {
        const headerLinks = this.extractLinksFromJson(data.header.links);
        extractedContents.push({
          url: `${baseUrl}/header`,
          textContent: data.header.text,
          seoMeta: {},
          allLinks: headerLinks,
          permalink: `${baseUrl}/header`,
        });
      }
      if (data.footer) {
        const footerLinks = this.extractLinksFromJson(data.footer.links);
        extractedContents.push({
          url: `${baseUrl}/footer`,
          textContent: data.footer.text,
          seoMeta: {},
          allLinks: footerLinks,
          permalink: `${baseUrl}/footer`,
        });
      }

      if (data.pages && Array.isArray(data.pages)) {
        for (const page of data.pages) {
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
          const pageTitle = page.title || page.TITLE; // Extract title

          extractedContents.push({ url: pagePermalink, textContent: textContentForSpellCheck, seoMeta: seoMeta, allLinks: pageLinks, permalink: pagePermalink, title: pageTitle, slug: pageSlug });
        }
      }
    } catch (apiError) {
      this.logger.error(`Error fetching from custom API ${newApiUrl}: ${apiError.message}`);
      this.eventsGateway.emitScanProgress(`Error fetching from custom API ${newApiUrl}: ${apiError.message}`);
    }

    return extractedContents;
  }
}
