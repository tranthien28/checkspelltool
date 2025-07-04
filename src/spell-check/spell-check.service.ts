import { Injectable, Logger } from '@nestjs/common';
import { SpellError, SeoMeta, SeoIssue } from './dto/spell-check-response.dto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EventsGateway } from '../events/events.gateway';

import OpenAI from 'openai';
import { getStrictDentalSpellCheckPrompt } from './prompts/spell-check.prompt';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class SpellCheckService {
  private readonly logger = new Logger(SpellCheckService.name);
  private readonly openRouterApiKey = process.env.OPENROUTER_API_KEY;
  private readonly openRouterBaseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/';
  private readonly logDirectory = join(process.cwd(), 'logs');
  private readonly genAI: OpenAI;
  private isScanning: boolean = false; // New state variable

  constructor(
    private readonly eventsGateway: EventsGateway,
  ) {
    if (!this.openRouterApiKey) {
      this.logger.error('OPENROUTER_API_KEY is not set in environment variables.');
      throw new Error('API key is not set.');
    }

    this.genAI = new OpenAI({
      apiKey: this.openRouterApiKey,
      baseURL: this.openRouterBaseUrl,
    });
  }

  getIsScanning(): boolean {
    return this.isScanning;
  }

  async promptCheck(text: string, modelName: string): Promise<{ errors: SpellError[]; prompt: string }> {
    this.isScanning = true; // Set scanning state to true when scan starts
    this.eventsGateway.emitScanProgress(`Checking text with AI using model: ${modelName}...`);
    if (!text || text.trim() === '') {
      this.logger.log('Skipping empty or whitespace-only text for spell check.');
      return { errors: [], prompt: '' };
    }

    const prompt = getStrictDentalSpellCheckPrompt(text); // Define prompt here

    try {
      this.logger.log(`Prompt sent to AI: ${prompt}`);
      let responseText: string;

      // Use OpenAI client for OpenRouter
      const completion = await (this.genAI as OpenAI).chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 1000,
      });
      this.logger.log(`Raw completion object: ${JSON.stringify(completion)}`);
      this.logger.log(`Completion choices: ${JSON.stringify(completion.choices)}`);
      responseText = completion.choices[0].message.content || '';
      this.logger.log(`Raw response from OpenRouter.ai: ${responseText}`);
      this.logger.log(`Attempting to match JSON from responseText.`);

      let errors: SpellError[] = [];
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/s);
      let jsonString: string;

      if (jsonMatch && jsonMatch[1]) {
        jsonString = jsonMatch[1];
        this.logger.log(`JSON match successful. Extracted JSON string: ${jsonString.substring(0, 200)}...`); // Log first 200 chars
      } else {
        // If jsonMatch fails, check if responseText is empty or just whitespace
        if (responseText.trim() === '') {
          this.logger.log(`Response from AI is empty. Assuming no spelling errors.`);
          return { errors: [], prompt: prompt };
        } else {
          // If not empty, then it's an invalid JSON format
          this.logger.error(`JSON match failed. ResponseText at failure: ${responseText}`);
          this.logger.error(`Phản hồi từ AI không chứa khối JSON hợp lệ. Phản hồi thô: ${responseText}`);
          return {
            errors: [{
              errorWord: 'N/A',
              originalSentence: text,
              correctedSentence: text,
              offset: 0,
              message: `Phản hồi từ AI không chứa khối JSON hợp lệ. Phản hồi thô: ${responseText}`
            }],
            prompt: prompt
          };
        }
      }

      try {
        errors = JSON.parse(jsonString);
        // Check if the parsed errors array matches the 'no errors' structure
        if (errors.length === 1 &&
            errors[0].errorWord === '' &&
            errors[0].originalSentence === '' &&
            errors[0].correctedSentence === '' &&
            errors[0].offset === 0 &&
            errors[0].message === 'Không phát hiện lỗi chính tả.') {
          this.logger.log('AI returned no errors. Clearing errors array.');
          errors = []; // Clear the errors array if it's the 'no errors' structure
        }
      } catch (parseError) {
        this.logger.error(`Lỗi phân tích phản hồi JSON từ AI: ${parseError.message}. JSON trích xuất: ${jsonString}. Phản hồi thô: ${responseText}`);
        return {
          errors: [{
            errorWord: 'N/A',
            originalSentence: text,
            correctedSentence: text,
            offset: 0,
            message: `Lỗi phân tích phản hồi JSON từ AI: ${parseError.message}. JSON trích xuất: ${jsonString}. Phản hồi thô: ${responseText}`
          }],
          prompt: prompt
        };
      }

      this.eventsGateway.emitScanProgress(`Đã tìm thấy ${errors.length} lỗi.`);
      this.isScanning = false; // Set scanning state to false when scan completes
      return { errors, prompt };
    } catch (error) {
      this.logger.error(`Lỗi khi kiểm tra văn bản với AI: ${error.message}`);
      this.eventsGateway.emitScanProgress(`Lỗi khi kiểm tra văn bản với AI: ${error.message}`);
      this.isScanning = false; // Set scanning state to false on error
      return {
        errors: [{
          errorWord: 'N/A',
          originalSentence: 'N/A',
          correctedSentence: 'N/A',
          offset: 0,
          message: error.message
        }],
        prompt: prompt
      };
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

    // Check for noindex in robots meta tag
    if (seoMeta && seoMeta.robots && seoMeta.robots.includes('noindex')) {
      seoIssues.push({
        type: 'noindex_found',
        message: 'Robots meta tag contains "noindex", preventing indexing.',
        url: url,
      });
    }

    // Check if SEO Title is missing or empty
    if (!seoMeta || !seoMeta.title || seoMeta.title.trim() === '') {
      seoIssues.push({
        type: 'missing_title',
        message: 'SEO Title is missing or empty.',
        url: url,
      });
    }

    // Check if SEO Description is missing or empty
    if (!seoMeta || !seoMeta.description || seoMeta.description.trim() === '') {
      seoIssues.push({
        type: 'missing_description',
        message: 'SEO Description is missing or empty.',
        url: url,
      });
    }

    return seoIssues;
  }

  async logErrors(slug: string, errors: SpellError[], checkedText: string, model: string, seoIssues: SeoIssue[], brokenLinks: string[], pageCount: number, permalink: string, prompt: string, checkTypes: string[]): Promise<void> {
    const urlObj = new URL(permalink);
    const baseDomain = urlObj.hostname.replace(/\./g, '_'); // Replace dots with underscores for valid folder name
    
    // Get existing scan count for this domain
    const existingScanCount = await this.getExistingScanCount(baseDomain);
    const domain = `${baseDomain}_${existingScanCount + 1}`; // Add scan index to domain name

    let fileName = slug.replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
                         .replace(/\s+/g, '-') // Replace spaces with hyphens
                         .toLowerCase();
    if (fileName === '') fileName = 'home'; // Fallback for empty slug after cleaning

    const siteLogDirectory = join(this.logDirectory, domain);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `${fileName}_${timestamp}.json`;
    const logFilePath = join(siteLogDirectory, logFileName);

    const logData = {
      timestamp: new Date().toISOString(),
      url: permalink,
      model: model,
      errors: errors,
      seoIssues: seoIssues,
      brokenLinks: brokenLinks,
      pageCount: pageCount,
      checkTypes: checkTypes,
      scanIndex: existingScanCount + 1 // Add scan index to log data
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

  // Add new method to get existing scan count
  private async getExistingScanCount(baseDomain: string): Promise<number> {
    try {
      // Get all directories in logs folder
      const dirs = await fs.readdir(this.logDirectory);
      
      // Filter directories that match the base domain pattern and get their scan numbers
      const scanNumbers = dirs
        .filter(dir => dir.startsWith(baseDomain + '_'))
        .map(dir => {
          const match = dir.match(new RegExp(`${baseDomain}_(\\d+)$`));
          return match ? parseInt(match[1]) : 0;
        });

      // Return the highest scan number (or 0 if none found)
      return scanNumbers.length > 0 ? Math.max(...scanNumbers) : 0;
    } catch (error) {
      this.logger.error(`Error getting existing scan count: ${error.message}`);
      return 0;
    }
  }
}