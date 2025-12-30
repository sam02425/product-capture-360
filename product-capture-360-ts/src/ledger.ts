import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';

/**
 * Session record - one entry per capture session
 */
export interface SessionRecord {
  sessionId: string;
  productName: string;
  startTime: string; // ISO timestamp
  endTime?: string; // ISO timestamp
  durationSeconds?: number;

  // Capture settings
  targetRate: number; // images per minute
  targetDuration: number; // seconds
  targetImages: number; // calculated target

  // Actual results
  imagesQueued: number;
  imagesSaved: number;
  imagesFailed: number;
  uniqueImages: number;
  duplicateImages: number;
  missedFrames: number;

  // Performance metrics
  actualRate?: number; // actual images/minute
  successRate?: number; // percentage
  uniqueRate?: number; // percentage

  // Storage info
  folderPath: string;
  totalSizeBytes?: number;
  averageImageSizeBytes?: number;

  // Status
  status: 'running' | 'completed' | 'failed' | 'stopped';
  errorMessage?: string;
}

/**
 * Product summary - aggregated stats per product
 */
export interface ProductSummary {
  productName: string;
  totalSessions: number;
  totalImages: number;
  totalSizeBytes: number;
  firstCaptured: string; // ISO timestamp
  lastCaptured: string; // ISO timestamp
  folderPath: string;
}

/**
 * Daily summary - aggregated stats per day
 */
export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalSessions: number;
  totalProducts: number;
  totalImages: number;
  totalSizeBytes: number;
  products: string[]; // list of product names
}

/**
 * Data Ledger - Crystal clear tracking of all captures
 */
export class DataLedger {
  private ledgerPath: string;
  private sessionsFile: string;
  private productsFile: string;
  private dailyFile: string;

  constructor(storagePath: string) {
    this.ledgerPath = path.join(storagePath, '.ledger');
    this.sessionsFile = path.join(this.ledgerPath, 'sessions.jsonl'); // JSON Lines format
    this.productsFile = path.join(this.ledgerPath, 'products.json');
    this.dailyFile = path.join(this.ledgerPath, 'daily.json');

    this.initialize();
  }

  /**
   * Initialize ledger directory and files
   */
  private initialize(): void {
    try {
      // Create ledger directory
      if (!fs.existsSync(this.ledgerPath)) {
        fs.mkdirSync(this.ledgerPath, { recursive: true });
      }

      // Create files if they don't exist
      if (!fs.existsSync(this.sessionsFile)) {
        fs.writeFileSync(this.sessionsFile, '');
      }
      if (!fs.existsSync(this.productsFile)) {
        fs.writeFileSync(this.productsFile, JSON.stringify({}, null, 2));
      }
      if (!fs.existsSync(this.dailyFile)) {
        fs.writeFileSync(this.dailyFile, JSON.stringify({}, null, 2));
      }
    } catch (error) {
      console.error('Failed to initialize ledger:', error);
    }
  }

  /**
   * Start a new session - create session record
   */
  async startSession(
    productName: string,
    ratePerMin: number,
    durationSec: number,
    folderPath: string
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const targetImages = Math.floor((durationSec * ratePerMin) / 60);

    const session: SessionRecord = {
      sessionId,
      productName,
      startTime: new Date().toISOString(),
      targetRate: ratePerMin,
      targetDuration: durationSec,
      targetImages,
      imagesQueued: 0,
      imagesSaved: 0,
      imagesFailed: 0,
      uniqueImages: 0,
      duplicateImages: 0,
      missedFrames: 0,
      folderPath,
      status: 'running',
    };

    // Append to sessions log (JSONL format - one JSON per line)
    await this.appendSession(session);

    return sessionId;
  }

  /**
   * Update session with progress
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionRecord>
  ): Promise<void> {
    const sessions = await this.getAllSessions();
    const session = sessions.find(s => s.sessionId === sessionId);

    if (session) {
      Object.assign(session, updates);

      // Recalculate derived metrics
      if (session.startTime && session.endTime) {
        const start = new Date(session.startTime).getTime();
        const end = new Date(session.endTime).getTime();
        session.durationSeconds = Math.round((end - start) / 1000);

        if (session.durationSeconds > 0) {
          session.actualRate = (session.imagesSaved / session.durationSeconds) * 60;
        }
      }

      if (session.imagesQueued > 0) {
        session.successRate = (session.imagesSaved / session.imagesQueued) * 100;
        session.uniqueRate = (session.uniqueImages / session.imagesQueued) * 100;
      }

      // Rewrite sessions file
      await this.rewriteSessions(sessions);
    }
  }

  /**
   * Complete a session
   */
  async completeSession(
    sessionId: string,
    finalStats: {
      imagesQueued: number;
      imagesSaved: number;
      imagesFailed: number;
      uniqueImages: number;
      duplicateImages: number;
      missedFrames: number;
      totalSizeBytes?: number;
      averageImageSizeBytes?: number;
    }
  ): Promise<void> {
    await this.updateSession(sessionId, {
      ...finalStats,
      endTime: new Date().toISOString(),
      status: 'completed',
    });

    // Update product summary
    const session = (await this.getAllSessions()).find(s => s.sessionId === sessionId);
    if (session) {
      await this.updateProductSummary(session);
      await this.updateDailySummary(session);
    }
  }

  /**
   * Fail a session
   */
  async failSession(sessionId: string, errorMessage: string): Promise<void> {
    await this.updateSession(sessionId, {
      endTime: new Date().toISOString(),
      status: 'failed',
      errorMessage,
    });
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionRecord[]> {
    try {
      const content = await fsPromises.readFile(this.sessionsFile, 'utf8');
      if (!content.trim()) return [];

      // Parse JSONL format (one JSON per line)
      return content
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      console.error('Failed to read sessions:', error);
      return [];
    }
  }

  /**
   * Get sessions for a specific product
   */
  async getProductSessions(productName: string): Promise<SessionRecord[]> {
    const sessions = await this.getAllSessions();
    return sessions.filter(s => s.productName === productName);
  }

  /**
   * Get product summary
   */
  async getProductSummary(productName: string): Promise<ProductSummary | null> {
    try {
      const summaries = JSON.parse(await fsPromises.readFile(this.productsFile, 'utf8'));
      return summaries[productName] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all product summaries
   */
  async getAllProductSummaries(): Promise<Record<string, ProductSummary>> {
    try {
      return JSON.parse(await fsPromises.readFile(this.productsFile, 'utf8'));
    } catch (error) {
      return {};
    }
  }

  /**
   * Get daily summary
   */
  async getDailySummary(date: string): Promise<DailySummary | null> {
    try {
      const summaries = JSON.parse(await fsPromises.readFile(this.dailyFile, 'utf8'));
      return summaries[date] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all daily summaries
   */
  async getAllDailySummaries(): Promise<Record<string, DailySummary>> {
    try {
      return JSON.parse(await fsPromises.readFile(this.dailyFile, 'utf8'));
    } catch (error) {
      return {};
    }
  }

  /**
   * Generate crystal-clear report
   */
  async generateReport(options?: {
    productName?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<string> {
    const sessions = await this.getAllSessions();
    const products = await this.getAllProductSummaries();
    const daily = await this.getAllDailySummaries();

    let filtered = sessions;

    // Filter by product
    if (options?.productName) {
      filtered = filtered.filter(s => s.productName === options.productName);
    }

    // Filter by date range
    if (options?.startDate || options?.endDate) {
      filtered = filtered.filter(s => {
        const sessionDate = s.startTime.split('T')[0];
        if (options.startDate && sessionDate < options.startDate) return false;
        if (options.endDate && sessionDate > options.endDate) return false;
        return true;
      });
    }

    // Generate report
    const report: string[] = [];
    report.push('═'.repeat(80));
    report.push('  CAPTURE DATA LEDGER - Crystal Clear Report');
    report.push('═'.repeat(80));
    report.push('');

    // Summary
    const totalSessions = filtered.length;
    const totalImages = filtered.reduce((sum, s) => sum + s.imagesSaved, 0);
    const totalSize = filtered.reduce((sum, s) => sum + (s.totalSizeBytes || 0), 0);

    report.push('📊 OVERALL SUMMARY');
    report.push('─'.repeat(80));
    report.push(`Total Sessions: ${totalSessions}`);
    report.push(`Total Images: ${totalImages.toLocaleString()}`);
    report.push(`Total Size: ${this.formatBytes(totalSize)}`);
    report.push(`Products: ${Object.keys(products).length}`);
    report.push('');

    // Product summaries
    if (!options?.productName) {
      report.push('📦 PRODUCT SUMMARIES');
      report.push('─'.repeat(80));

      Object.entries(products)
        .sort(([, a], [, b]) => b.totalImages - a.totalImages)
        .forEach(([name, summary]) => {
          report.push(`${name}:`);
          report.push(`  Sessions: ${summary.totalSessions}`);
          report.push(`  Images: ${summary.totalImages.toLocaleString()}`);
          report.push(`  Size: ${this.formatBytes(summary.totalSizeBytes)}`);
          report.push(`  First: ${new Date(summary.firstCaptured).toLocaleString()}`);
          report.push(`  Last: ${new Date(summary.lastCaptured).toLocaleString()}`);
          report.push('');
        });
    }

    // Recent sessions
    report.push('📝 RECENT SESSIONS (Last 10)');
    report.push('─'.repeat(80));

    filtered
      .slice(-10)
      .reverse()
      .forEach(session => {
        const status = this.getStatusEmoji(session.status);
        report.push(`${status} ${session.productName} - ${session.sessionId}`);
        report.push(`  Time: ${new Date(session.startTime).toLocaleString()}`);
        report.push(`  Target: ${session.targetImages} images @ ${session.targetRate}/min for ${session.targetDuration}s`);
        report.push(`  Result: ${session.imagesSaved}/${session.imagesQueued} saved (${session.successRate?.toFixed(1)}% success)`);
        report.push(`  Unique: ${session.uniqueImages} (${session.uniqueRate?.toFixed(1)}%)`);
        if (session.actualRate) {
          report.push(`  Rate: ${session.actualRate.toFixed(1)}/min (target: ${session.targetRate}/min)`);
        }
        if (session.errorMessage) {
          report.push(`  Error: ${session.errorMessage}`);
        }
        report.push('');
      });

    report.push('═'.repeat(80));

    return report.join('\n');
  }

  /**
   * Export ledger to CSV
   */
  async exportToCSV(outputPath: string): Promise<void> {
    const sessions = await this.getAllSessions();

    const headers = [
      'Session ID',
      'Product Name',
      'Start Time',
      'End Time',
      'Duration (s)',
      'Target Rate',
      'Target Duration',
      'Target Images',
      'Images Queued',
      'Images Saved',
      'Images Failed',
      'Unique Images',
      'Duplicate Images',
      'Missed Frames',
      'Actual Rate',
      'Success Rate (%)',
      'Unique Rate (%)',
      'Total Size (bytes)',
      'Avg Image Size (bytes)',
      'Folder Path',
      'Status',
      'Error Message',
    ];

    const rows = sessions.map(s => [
      s.sessionId,
      s.productName,
      s.startTime,
      s.endTime || '',
      s.durationSeconds || '',
      s.targetRate,
      s.targetDuration,
      s.targetImages,
      s.imagesQueued,
      s.imagesSaved,
      s.imagesFailed,
      s.uniqueImages,
      s.duplicateImages,
      s.missedFrames,
      s.actualRate?.toFixed(2) || '',
      s.successRate?.toFixed(2) || '',
      s.uniqueRate?.toFixed(2) || '',
      s.totalSizeBytes || '',
      s.averageImageSizeBytes || '',
      s.folderPath,
      s.status,
      s.errorMessage || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    await fsPromises.writeFile(outputPath, csv, 'utf8');
  }

  // ==================== Private Methods ====================

  private generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  private async appendSession(session: SessionRecord): Promise<void> {
    try {
      const line = JSON.stringify(session) + '\n';
      await fsPromises.appendFile(this.sessionsFile, line, 'utf8');
    } catch (error) {
      console.error('Failed to append session:', error);
    }
  }

  private async rewriteSessions(sessions: SessionRecord[]): Promise<void> {
    try {
      const content = sessions.map(s => JSON.stringify(s)).join('\n') + '\n';
      await fsPromises.writeFile(this.sessionsFile, content, 'utf8');
    } catch (error) {
      console.error('Failed to rewrite sessions:', error);
    }
  }

  private async updateProductSummary(session: SessionRecord): Promise<void> {
    try {
      const summaries = await this.getAllProductSummaries();
      const existing = summaries[session.productName];

      if (existing) {
        existing.totalSessions++;
        existing.totalImages += session.imagesSaved;
        existing.totalSizeBytes += session.totalSizeBytes || 0;
        existing.lastCaptured = session.startTime;
      } else {
        summaries[session.productName] = {
          productName: session.productName,
          totalSessions: 1,
          totalImages: session.imagesSaved,
          totalSizeBytes: session.totalSizeBytes || 0,
          firstCaptured: session.startTime,
          lastCaptured: session.startTime,
          folderPath: session.folderPath,
        };
      }

      await fsPromises.writeFile(this.productsFile, JSON.stringify(summaries, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to update product summary:', error);
    }
  }

  private async updateDailySummary(session: SessionRecord): Promise<void> {
    try {
      const date = session.startTime.split('T')[0];
      const summaries = await this.getAllDailySummaries();
      const existing = summaries[date];

      if (existing) {
        existing.totalSessions++;
        existing.totalImages += session.imagesSaved;
        existing.totalSizeBytes += session.totalSizeBytes || 0;
        if (!existing.products.includes(session.productName)) {
          existing.products.push(session.productName);
          existing.totalProducts++;
        }
      } else {
        summaries[date] = {
          date,
          totalSessions: 1,
          totalProducts: 1,
          totalImages: session.imagesSaved,
          totalSizeBytes: session.totalSizeBytes || 0,
          products: [session.productName],
        };
      }

      await fsPromises.writeFile(this.dailyFile, JSON.stringify(summaries, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to update daily summary:', error);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'stopped': return '⏹️';
      default: return '❓';
    }
  }
}
