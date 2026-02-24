# @protolabs-ai/utils

Shared utility functions for AutoMaker.

## Overview

This package provides common utility functions used across AutoMaker's server and UI. It includes error handling, logging, conversation utilities, image handling, and prompt building.

## Installation

```bash
npm install @protolabs-ai/utils
```

## Exports

### Logger

Structured logging with context.

```typescript
import { createLogger, LogLevel } from '@protolabs-ai/utils';

const logger = createLogger('MyComponent');
logger.info('Processing request');
logger.error('Failed to process:', error);
logger.debug('Debug information', { data });
```

### Error Handler

Error classification and user-friendly messages.

```typescript
import {
  isAbortError,
  isCancellationError,
  isAuthenticationError,
  classifyError,
  getUserFriendlyErrorMessage,
} from '@protolabs-ai/utils';

try {
  await operation();
} catch (error) {
  if (isAbortError(error)) {
    console.log('Operation was aborted');
  }

  const errorInfo = classifyError(error);
  const message = getUserFriendlyErrorMessage(error);
}
```

### Conversation Utils

Message formatting and conversion.

```typescript
import {
  extractTextFromContent,
  normalizeContentBlocks,
  formatHistoryAsText,
  convertHistoryToMessages,
} from '@protolabs-ai/utils';

const text = extractTextFromContent(contentBlocks);
const normalized = normalizeContentBlocks(content);
const formatted = formatHistoryAsText(messages);
const converted = convertHistoryToMessages(history);
```

### Image Handler

Image processing for Claude prompts.

```typescript
import {
  getMimeTypeForImage,
  readImageAsBase64,
  convertImagesToContentBlocks,
  formatImagePathsForPrompt,
} from '@protolabs-ai/utils';

const mimeType = getMimeTypeForImage('screenshot.png');
const base64 = await readImageAsBase64('/path/to/image.jpg');
const blocks = await convertImagesToContentBlocks(imagePaths, basePath);
const formatted = formatImagePathsForPrompt(imagePaths);
```

### Prompt Builder

Build prompts with images for Claude.

```typescript
import { buildPromptWithImages } from '@protolabs-ai/utils';

const result = await buildPromptWithImages({
  basePrompt: 'Analyze this screenshot',
  imagePaths: ['/path/to/screenshot.png'],
  basePath: '/project/path',
});

console.log(result.prompt); // Prompt with image references
console.log(result.images); // Image data for Claude
```

### File System Utils

Common file system operations.

```typescript
import { ensureDir, fileExists, readJsonFile, writeJsonFile } from '@protolabs-ai/utils';

await ensureDir('/path/to/dir');
const exists = await fileExists('/path/to/file');
const data = await readJsonFile('/config.json');
await writeJsonFile('/config.json', data);
```

## Usage Example

```typescript
import { createLogger, classifyError, buildPromptWithImages } from '@protolabs-ai/utils';

const logger = createLogger('FeatureExecutor');

async function executeWithImages(prompt: string, images: string[]) {
  try {
    logger.info('Building prompt with images');

    const result = await buildPromptWithImages({
      basePrompt: prompt,
      imagePaths: images,
      basePath: process.cwd(),
    });

    logger.debug('Prompt built successfully', { imageCount: result.images.length });
    return result;
  } catch (error) {
    const errorInfo = classifyError(error);
    logger.error('Failed to build prompt:', errorInfo.message);
    throw error;
  }
}
```

## Dependencies

- `@protolabs-ai/types` - Type definitions

## Used By

- `@protolabs-ai/server`
- `@protolabs-ai/ui`
