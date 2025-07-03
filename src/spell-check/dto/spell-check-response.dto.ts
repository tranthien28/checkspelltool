export interface SpellError {
  errorWord: string; // The specific word/phrase identified as incorrect
  originalSentence: string; // The full sentence containing the error
  correctedSentence: string; // The full sentence with the suggested correction
  offset: number;
  message: string;
  url?: string; // Add url to SpellError
}

export interface SeoMeta {
  title?: string;
  description?: string;
  robots?: string;
}

export interface SeoIssue {
  type: 'missing_title' | 'missing_description' | 'noindex_found';
  message: string;
  url: string;
}

export class SpellCheckResponseDto {
  originalUrl: string;
  
  errors: SpellError[];
  seoIssues: SeoIssue[]; // Added for SEO issues
  brokenLinks?: string[]; // Added for broken links
  hasErrors: boolean;
  errorMessage?: string;
}