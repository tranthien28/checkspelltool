import { Injectable, Logger } from '@nestjs/common';
import { SpellError, SeoMeta, SeoIssue } from './dto/spell-check-response.dto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EventsGateway } from '../events/events.gateway';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { getStrictDentalSpellCheckPrompt } from './prompts/spell-check.prompt';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class SpellCheckService {
  private readonly logger = new Logger(SpellCheckService.name);
  private readonly geminiApiKey = process.env.GEMINI_API_KEY;
  private readonly openRouterApiKey = process.env.OPENROUTER_API_KEY;
  private readonly openRouterBaseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/';
  private readonly logDirectory = join(process.cwd(), 'logs');
  private readonly genAI: GoogleGenerativeAI | OpenAI;

  constructor(
    private readonly eventsGateway: EventsGateway,
  ) {
    if (!this.geminiApiKey && !this.openRouterApiKey) {
      this.logger.error('Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set in environment variables.');
      throw new Error('API key is not set.');
    }

    if (this.openRouterApiKey) {
      this.genAI = new OpenAI({
        apiKey: this.openRouterApiKey,
        baseURL: this.openRouterBaseUrl,
      });
    } else if (this.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    } else {
      // This case should ideally be caught by the initial check, but for type safety
      throw new Error('No valid API key provided.');
    }
  }

  // async checkTextWithLanguageTool(text: string): Promise<SpellError[]> {
  //   this.eventsGateway.emitScanProgress('Checking text with LanguageTool...');
  //   try {
  //     const params = new URLSearchParams();
  //     params.append('language', 'auto');
  //     params.append('text', text);

  //     const response: any = await firstValueFrom(
  //       this.httpService.post(this.languageToolApiUrl, params.toString(), {
  //         headers: {
  //           'Content-Type': 'application/x-www-form-urlencoded',
  //         },
  //       }),
  //     );
  //     const data = response.data;

  //     const errors: SpellError[] = data.matches.map((match: any) => {
  //       const errorWord = text.substring(match.offset, match.offset + match.length);
  //       const originalSentence = text.substring(match.sentence.offset, match.sentence.offset + match.sentence.length);
  //       let correctedSentence = originalSentence; // Default to original

  //       if (match.replacements && match.replacements.length > 0) {
  //         const offsetInSentence = match.offset - match.sentence.offset;
  //         correctedSentence = originalSentence.substring(0, offsetInSentence) +
  //                             match.replacements[0].value +
  //                             originalSentence.substring(offsetInSentence + match.length);
  //       }

  //       return {
  //         errorWord: errorWord,
  //         originalSentence: originalSentence,
  //         correctedSentence: correctedSentence,
  //         offset: match.offset,
  //         message: this.translateMessage(match.message),
  //       };
  //     });
  //     this.eventsGateway.emitScanProgress(`Found ${errors.length} errors.`);
  //     return errors;
  //   } catch (error) {
  //     this.logger.error(`Error checking text with LanguageTool: ${error.message}`);
  //     this.eventsGateway.emitScanProgress(`Error checking text with LanguageTool: ${error.message}`);
  //     return [{ errorWord: 'N/A', originalSentence: 'N/A', correctedSentence: 'N/A', offset: 0, message: error.message }];
  //   }
  // }

  async promptCheck(text: string, modelName: string): Promise<SpellError[]> {
    this.logger.log(`Sending text to AI for spell check: ${text.substring(0, 100)}...`); // Log first 100 chars
    this.eventsGateway.emitScanProgress(`Checking text with Gemini using model: ${modelName}...`);
    if (!text || text.trim() === '') {
      this.logger.log('Skipping empty or whitespace-only text for spell check.');
      return [];
    }

    try {
      const prompt = getStrictDentalSpellCheckPrompt(text);
      let geminiText: string;

      if (this.openRouterApiKey) {
        // Use OpenAI client for OpenRouter
        const completion = await (this.genAI as OpenAI).chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1000,
        });
        geminiText = completion.choices[0].message.content || '';
        this.logger.log(`Raw response from OpenRouter.ai: ${geminiText}`);
      } else {
        // Use GoogleGenerativeAI for Gemini
        const geminiModel = (this.genAI as GoogleGenerativeAI).getGenerativeModel({ model: modelName });
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        geminiText = response.text();
      }

      let errors: SpellError[] = [];
      try {
        const jsonMatch = geminiText.match(/```json\n([\s\S]*?)\n```/s);
        const jsonString = jsonMatch ? jsonMatch[1] : geminiText;
        errors = JSON.parse(jsonString);
      } catch (parseError) {
        this.logger.error(`Lỗi phân tích phản hồi JSON từ Gemini: ${parseError.message}. Phản hồi thô: ${geminiText}`);
        return [{
          errorWord: 'N/A',
          originalSentence: text,
          correctedSentence: text,
          offset: 0,
          message: `Lỗi phân tích phản hồi từ Gemini: ${parseError.message}. Phản hồi thô: ${geminiText}`
        }];
      }

      this.eventsGateway.emitScanProgress(`Đã tìm thấy ${errors.length} lỗi.`);
      return errors;
    } catch (error) {
      this.logger.error(`Lỗi khi kiểm tra văn bản với Gemini: ${error.message}`);
      this.eventsGateway.emitScanProgress(`Lỗi khi kiểm tra văn bản với Gemini: ${error.message}`);
      return [{ errorWord: 'N/A', originalSentence: 'N/A', correctedSentence: 'N/A', offset: 0, message: error.message }];
    }
  }

  private translateMessage(message: string): string {
    const translations: { [key: string]: string } = {
      "Possible spelling mistake found.": "Có thể là lỗi chính tả.",
      "This word is normally in uppercase.": "Từ này thường viết hoa.",
      "Possible typographical error.": "Có thể là lỗi đánh máy.",
      "Redundant punctuation.": "Dấu câu thừa.",
      "Use a comma before 'and' when it connects two independent clauses.": "Sử dụng dấu phẩy trước 'and' khi nó nối hai mệnh đề độc lập.",
      // Add more translations as needed
    };
    return translations[message] || message; // Return translated message or original if no translation found
  }

  analyzeSeo(seoMeta: SeoMeta, url: string): SeoIssue[] {
    const seoIssues: SeoIssue[] = [];

    if (!seoMeta || !seoMeta.title || seoMeta.title.trim() === '') {
      seoIssues.push({
        type: 'missing_title',
        message: 'SEO Title is missing or empty.',
        url: url,
      });
    }

    if (!seoMeta || !seoMeta.description || seoMeta.description.trim() === '') {
      seoIssues.push({
        type: 'missing_description',
        message: 'SEO Description is missing or empty.',
        url: url,
      });
    }

    // Check for noindex in robots meta tag
    if (seoMeta && seoMeta.robots && seoMeta.robots.includes('noindex')) {
      seoIssues.push({
        type: 'noindex_found',
        message: 'Robots meta tag contains "noindex", preventing indexing.',
        url: url,
      });
    }

    return seoIssues;
  }

  async logErrors(slug: string, errors: SpellError[], checkedText: string, model: string, seoIssues: SeoIssue[], brokenLinks: string[], pageCount: number, permalink: string): Promise<void> {
    if (errors.length === 0 && seoIssues.length === 0 && brokenLinks.length === 0) {
      this.logger.log(`No errors found for ${slug} with model ${model}. Not logging.`);
      this.eventsGateway.emitScanProgress(`No errors found for ${slug} with model ${model}. Not logging.`);
      return;
    }

    const urlObj = new URL(permalink);
    const domain = urlObj.hostname.replace(/\./g, '_'); // Replace dots with underscores for valid folder name
    let fileName = slug.replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
                         .replace(/\s+/g, '-') // Replace spaces with hyphens
                         .toLowerCase();
    if (fileName === '') fileName = 'home'; // Fallback for empty slug after cleaning

    const siteLogDirectory = join(this.logDirectory, domain);
    const logFileName = `${fileName}.json`; // Use slug for file name
    const logFilePath = join(siteLogDirectory, logFileName);

    const logData = {
      timestamp: new Date().toISOString(),
      url: permalink,
      model: model,
      errors: errors,
      seoIssues: seoIssues,
      brokenLinks: brokenLinks,
      checkedText: checkedText,
      pageCount: pageCount,
    };

    try {
      await fs.mkdir(siteLogDirectory, { recursive: true });
      await fs.writeFile(logFilePath, JSON.stringify(logData, null, 2));
      this.logger.log(`Logged spell check errors to: ${logFilePath}`);
      this.eventsGateway.emitScanProgress(`Logged spell check errors to: ${logFilePath}`);
    } catch (error) {
      this.logger.error(`Error writing spell check log to file: ${error.message}`);
      this.eventsGateway.emitScanProgress(`Error writing spell check log to file: ${error.message}`);
    }
  }
}