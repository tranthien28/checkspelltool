import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class LogViewerService {
  private readonly logger = new Logger(LogViewerService.name);
  private readonly logDirectory = join(process.cwd(), 'logs');

  async getDomains(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.logDirectory, { withFileTypes: true });
      return entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
    } catch (error) {
      this.logger.error(`Error reading log domains: ${error.message}`);
      return [];
    }
  }

  async getUrlsForDomain(domain: string): Promise<{
    totalPageCount: number;
    latestModelFilename: string | null;
    urls: { displayPath: string; latestFilename: string; pageCount: number }[];
  }> {
    const domainPath = join(this.logDirectory, domain);
    try {
      const entries = await fs.readdir(domainPath, { withFileTypes: true });
      const urlMap = new Map<string, { filename: string; mtime: Date; pageCount: number }>();
      let latestDomainFileMtime: Date | null = null;
      let latestDomainFilename: string | null = null;

      for (const dirent of entries) {
        if (dirent.isFile() && dirent.name.endsWith('.json')) {
          const filePath = join(domainPath, dirent.name);
          const stats = await fs.stat(filePath);
          const filenameWithoutModel = dirent.name.replace(/_[a-zA-Z0-9-]+\.json$/, '').replace(/\.json$/, '');

          let pageCount = 0;
          try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const logData = JSON.parse(fileContent);
            if (logData.pageCount) {
              pageCount = logData.pageCount;
            }
          } catch (readError) {
            this.logger.warn(`Could not read pageCount from ${dirent.name}: ${readError.message}`);
          }

          const existingEntry = urlMap.get(filenameWithoutModel);
          if (!existingEntry || stats.mtime > existingEntry.mtime) {
            urlMap.set(filenameWithoutModel, { filename: dirent.name, mtime: stats.mtime, pageCount });
          }

          // Track the latest file for the domain to get its model
          if (!latestDomainFileMtime || stats.mtime > latestDomainFileMtime) {
            latestDomainFileMtime = stats.mtime;
            latestDomainFilename = dirent.name;
          }
        }
      }

      const urls = Array.from(urlMap.values()).map(item => {
        let displayPath = item.filename.replace(/_[a-zA-Z0-9-]+\.json$/, '').replace(/_/g, '/');
        if (displayPath === 'root') displayPath = '/';
        if (displayPath.startsWith('_')) displayPath = displayPath.substring(1);
        return { displayPath, latestFilename: item.filename, pageCount: item.pageCount };
      });

      let totalPageCount = 0;
      if (latestDomainFilename) {
        try {
          const latestFilePath = join(domainPath, latestDomainFilename);
          const fileContent = await fs.readFile(latestFilePath, 'utf8');
          const logData = JSON.parse(fileContent);
          if (logData.pageCount) {
            totalPageCount = logData.pageCount;
          }
        } catch (readError) {
          this.logger.warn(`Could not read totalPageCount from ${latestDomainFilename}: ${readError.message}`);
        }
      }

      return { totalPageCount, latestModelFilename: latestDomainFilename, urls };
    } catch (error) {
      this.logger.error(`Error reading URLs for domain ${domain}: ${error.message}`);
      return { totalPageCount: 0, latestModelFilename: null, urls: [] };
    }
  }

  async getLogContent(domain: string, filename: string): Promise<any | null> {
    const filePath = join(this.logDirectory, domain, filename);
    this.logger.log(`Attempting to read log file: ${filePath}`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`Error reading log content for ${domain}/${filename}: ${error.message}`);
      return null;
    }
  }

  async clearDomainLogs(domain: string): Promise<void> {
    const domainPath = join(this.logDirectory, domain);
    try {
      await fs.rm(domainPath, { recursive: true, force: true });
      this.logger.log(`Logs for domain ${domain} cleared successfully.`);
    } catch (error) {
      this.logger.error(`Error clearing logs for domain ${domain}: ${error.message}`);
      throw new Error(`Failed to clear logs for domain ${domain}.`);
    }
  }
}