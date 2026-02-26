/**
 * Filesystem and basic operations client mixin.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - ping, openExternalLink, openInEditor (basic ops)
 *   - openDirectory, openFile (file picker — uses server-side file browser dialog)
 *   - readFile, writeFile, mkdir, readdir, exists, stat, deleteFile, trashItem,
 *     getPath, saveImageToTemp, saveBoardBackground, deleteBoardBackground (FS ops)
 */
import type {
  FileResult,
  WriteResult,
  ReaddirResult,
  StatResult,
  DialogResult,
  SaveImageResult,
} from '../electron';
import { getGlobalFileBrowser } from '@/contexts/file-browser-context';
import { createLogger } from '@protolabs-ai/utils/logger';
import { BaseHttpClient, type Constructor } from './base-http-client';

const logger = createLogger('HttpClient');

export const withFilesystemClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Basic operations
    async ping(): Promise<string> {
      const result = await this.get<{ status: string }>('/api/health');
      return result.status === 'ok' ? 'pong' : 'error';
    }

    async openExternalLink(url: string): Promise<{ success: boolean; error?: string }> {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { success: true };
    }

    async openInEditor(
      filePath: string,
      line?: number,
      column?: number
    ): Promise<{ success: boolean; error?: string }> {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const encodedPath = normalizedPath.startsWith('/')
        ? '/' + normalizedPath.slice(1).split('/').map(encodeURIComponent).join('/')
        : normalizedPath.split('/').map(encodeURIComponent).join('/');
      let url = `vscode://file${encodedPath}`;
      if (line !== undefined && line > 0) {
        url += `:${line}`;
        if (column !== undefined && column > 0) {
          url += `:${column}`;
        }
      }

      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open in editor',
        };
      }
    }

    // File picker — uses server-side file browser dialog
    async openDirectory(): Promise<DialogResult> {
      const fileBrowser = getGlobalFileBrowser();
      if (!fileBrowser) {
        logger.error('File browser not initialized');
        return { canceled: true, filePaths: [] };
      }
      const path = await fileBrowser();
      if (!path) return { canceled: true, filePaths: [] };

      const result = await this.post<{
        success: boolean;
        path?: string;
        isAllowed?: boolean;
        error?: string;
      }>('/api/fs/validate-path', { filePath: path });

      if (result.success && result.path && result.isAllowed !== false) {
        return { canceled: false, filePaths: [result.path] };
      }
      logger.error('Invalid directory:', result.error || 'Path not allowed');
      return { canceled: true, filePaths: [] };
    }

    async openFile(_options?: object): Promise<DialogResult> {
      const fileBrowser = getGlobalFileBrowser();
      if (!fileBrowser) {
        logger.error('File browser not initialized');
        return { canceled: true, filePaths: [] };
      }
      const path = await fileBrowser();
      if (!path) return { canceled: true, filePaths: [] };

      const result = await this.post<{ success: boolean; exists: boolean }>('/api/fs/exists', {
        filePath: path,
      });
      if (result.success && result.exists) return { canceled: false, filePaths: [path] };
      logger.error('File not found');
      return { canceled: true, filePaths: [] };
    }

    // File system operations
    async readFile(filePath: string): Promise<FileResult> {
      return this.post('/api/fs/read', { filePath });
    }

    async writeFile(filePath: string, content: string): Promise<WriteResult> {
      return this.post('/api/fs/write', { filePath, content });
    }

    async mkdir(dirPath: string): Promise<WriteResult> {
      return this.post('/api/fs/mkdir', { dirPath });
    }

    async readdir(dirPath: string): Promise<ReaddirResult> {
      return this.post('/api/fs/readdir', { dirPath });
    }

    async exists(filePath: string): Promise<boolean> {
      const result = await this.post<{ success: boolean; exists: boolean }>('/api/fs/exists', {
        filePath,
      });
      return result.exists;
    }

    async stat(filePath: string): Promise<StatResult> {
      return this.post('/api/fs/stat', { filePath });
    }

    async deleteFile(filePath: string): Promise<WriteResult> {
      return this.post('/api/fs/delete', { filePath });
    }

    async trashItem(filePath: string): Promise<WriteResult> {
      return this.deleteFile(filePath);
    }

    async getPath(name: string): Promise<string> {
      if (name === 'userData') {
        const result = await this.get<{ dataDir: string }>('/api/health/detailed');
        return result.dataDir || '/data';
      }
      return `/data/${name}`;
    }

    async saveImageToTemp(
      data: string,
      filename: string,
      mimeType: string,
      projectPath?: string
    ): Promise<SaveImageResult> {
      return this.post('/api/fs/save-image', { data, filename, mimeType, projectPath });
    }

    async saveBoardBackground(
      data: string,
      filename: string,
      mimeType: string,
      projectPath: string
    ): Promise<{ success: boolean; path?: string; error?: string }> {
      return this.post('/api/fs/save-board-background', { data, filename, mimeType, projectPath });
    }

    async deleteBoardBackground(
      projectPath: string
    ): Promise<{ success: boolean; error?: string }> {
      return this.post('/api/fs/delete-board-background', { projectPath });
    }
  };
