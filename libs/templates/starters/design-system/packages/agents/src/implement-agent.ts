/**
 * implement-agent.ts
 *
 * AI agent that converts .pen designs to production React components.
 *
 * The agent uses a two-phase approach:
 *
 * 1. **Generation phase** — runs the pen-to-react codegen pipeline to produce
 *    initial component source files from reusable frames in the .pen document.
 *
 * 2. **Refinement phase** — sends the generated code to Claude along with
 *    natural-language instructions. Claude reads each file, applies the requested
 *    changes (accessibility improvements, styling tweaks, logic additions), and
 *    returns the refined source. This loop runs until instructions are satisfied
 *    or `maxIterations` is reached.
 *
 * Usage:
 * ```ts
 * import { ImplementAgent } from '@@PROJECT_NAME-agents';
 *
 * const agent = new ImplementAgent({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *
 * // Generate all reusable components from a .pen file
 * const result = await agent.generate({
 *   penFilePath: './designs/shadcn-kit.pen',
 *   outputDir: './src/components',
 *   mode: 'library',
 * });
 *
 * // Generate a single component and refine it with instructions
 * const result = await agent.generate({
 *   penFilePath: './designs/my-design.pen',
 *   outputDir: './src/components',
 *   mode: 'single',
 *   componentName: 'Button',
 *   instructions: 'Add ARIA roles and keyboard event handlers for accessibility.',
 * });
 * ```
 *
 * @module
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ============================================================================
// Codegen pipeline types (inlined to keep this package self-contained)
// Mirrors the interfaces exported by @@PROJECT_NAME-codegen / react-generator.ts
// ============================================================================

/** A single generated React component file. */
interface GeneratedFile {
  /** Filename, e.g. 'Button.tsx'. */
  filename: string;
  /** PascalCase component name, e.g. 'Button'. */
  componentName: string;
  /** Complete .tsx source code ready to write to disk. */
  content: string;
}

/** Generator configuration forwarded to the codegen pipeline. */
interface GeneratorOptions {
  cssStrategy?: 'inline' | 'css-modules' | 'tailwind';
  exportStyle?: 'named' | 'default';
}

// ============================================================================
// Public Request / Result interfaces
// ============================================================================

/** Controls what the agent generates and how it refines the output. */
export interface GenerateOptions {
  /** Absolute or relative path to the source .pen design file. */
  penFilePath: string;

  /** Directory where generated .tsx files will be written. Created if it doesn't exist. */
  outputDir: string;

  /**
   * `'library'` — generate every reusable component found in the .pen file.
   * `'single'`  — generate only the component matching `componentName`.
   */
  mode: 'library' | 'single';

  /**
   * Required when `mode = 'single'`. The PascalCase name of the component
   * to generate (must match a reusable frame name in the .pen file).
   */
  componentName?: string;

  /**
   * Natural-language instructions passed to Claude for the refinement phase.
   * Leave undefined to skip refinement and use the raw codegen output.
   *
   * @example 'Add ARIA attributes and keyboard event handlers.'
   * @example 'Convert inline styles to Tailwind CSS classes.'
   */
  instructions?: string;

  /** CSS output strategy forwarded to the codegen pipeline. Defaults to `'inline'`. */
  cssStrategy?: 'inline' | 'css-modules' | 'tailwind';

  /** Export style forwarded to the codegen pipeline. Defaults to `'named'`. */
  exportStyle?: 'named' | 'default';

  /**
   * Maximum number of Claude refinement iterations.
   * Only relevant when `instructions` is provided. Defaults to `3`.
   */
  maxIterations?: number;
}

/** Summary of a single generated file after writing to disk. */
export interface GeneratedFileResult {
  /** Output file path relative to `outputDir`. */
  filename: string;
  /** PascalCase component name. */
  componentName: string;
  /** Absolute path of the written file. */
  absolutePath: string;
  /** Final source content (possibly refined). */
  content: string;
}

/** Result returned by `ImplementAgent.generate()`. */
export interface GenerateResult {
  /** Whether the generation (and optional refinement) succeeded. */
  success: boolean;
  /** All generated files with their final content and paths. */
  files: GeneratedFileResult[];
  /** Absolute path of the output directory. */
  outputDir: string;
  /** Number of Claude refinement iterations performed. */
  refinements: number;
  /** TypeScript compilation result for the output directory. */
  typeCheck: { passed: boolean; errors: string[] };
  /** Error message if `success` is `false`. */
  error?: string;
}

// ============================================================================
// Agent configuration
// ============================================================================

/** Configuration options for `ImplementAgent`. */
export interface ImplementAgentOptions {
  /** Anthropic API key. Defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;

  /**
   * Claude model to use for the refinement phase.
   * Defaults to `claude-3-5-sonnet-20241022`.
   */
  model?: string;

  /** Enable verbose logging to stderr. Defaults to `false`. */
  verbose?: boolean;
}

// ============================================================================
// Internal helpers
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve to the system prompt markdown file packaged alongside this module. */
function getSystemPromptPath(): string {
  return path.join(__dirname, 'prompts', 'implement.md');
}

/** Load and return the system prompt text. Cached after first read. */
let _cachedSystemPrompt: string | undefined;
async function loadSystemPrompt(): Promise<string> {
  if (_cachedSystemPrompt !== undefined) return _cachedSystemPrompt;
  const promptPath = getSystemPromptPath();
  _cachedSystemPrompt = await fs.readFile(promptPath, 'utf-8');
  return _cachedSystemPrompt;
}

/** Convert an arbitrary name to PascalCase for component name matching. */
function toPascalCase(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9\s_/-]/g, '')
      .split(/[\s_/-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join('') || 'Component'
  );
}

/** Dynamically import the pen parser (@@PROJECT_NAME-pen package). */
async function parsePenFileFromPath(filePath: string): Promise<unknown> {
  // Resolve the pen package relative to this file's location.
  // After scaffolding: packages/agents/dist → packages/pen/dist
  const penIndexPath = path.resolve(__dirname, '../../pen/dist/index.js');
  const absFilePath = path.resolve(filePath);

  try {
    const { parsePenFileFromPath: parse } = (await import(penIndexPath)) as {
      parsePenFileFromPath: (p: string) => Promise<unknown>;
    };
    return parse(absFilePath);
  } catch {
    // Fallback: parse the JSON directly without validation.
    const raw = await fs.readFile(absFilePath, 'utf-8');
    return JSON.parse(raw) as unknown;
  }
}

/** Dynamically import and call the codegen pipeline. */
async function runCodegen(doc: unknown, options: GeneratorOptions): Promise<GeneratedFile[]> {
  // Resolve the codegen package relative to this file's location.
  // After scaffolding: packages/agents/dist → packages/codegen/dist
  const codegenPath = path.resolve(__dirname, '../../codegen/dist/react-generator.js');

  const { generateFromDocument } = (await import(codegenPath)) as {
    generateFromDocument: (doc: unknown, opts: GeneratorOptions) => GeneratedFile[];
  };

  return generateFromDocument(doc, options);
}

/** Filter codegen results to a single named component. */
function filterSingleComponent(files: GeneratedFile[], componentName: string): GeneratedFile[] {
  const target = toPascalCase(componentName);
  const match = files.find((f) => f.componentName === target);
  if (!match) {
    throw new Error(
      `Component "${componentName}" not found in .pen file. ` +
        `Available: ${files.map((f) => f.componentName).join(', ')}`
    );
  }
  return [match];
}

/** Write generated files to disk. Creates outputDir if it doesn't exist. */
async function writeFiles(
  files: GeneratedFile[],
  outputDir: string
): Promise<GeneratedFileResult[]> {
  await fs.mkdir(outputDir, { recursive: true });

  return Promise.all(
    files.map(async (file) => {
      const absPath = path.join(outputDir, file.filename);
      await fs.writeFile(absPath, file.content, 'utf-8');
      return {
        filename: file.filename,
        componentName: file.componentName,
        absolutePath: absPath,
        content: file.content,
      };
    })
  );
}

/** Run `tsc --noEmit` against the output directory to verify generated code compiles. */
async function runTypeCheck(outputDir: string): Promise<{ passed: boolean; errors: string[] }> {
  // Build a minimal tsconfig for the generated components.
  const tmpConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: [outputDir + '/**/*.tsx', outputDir + '/**/*.ts'],
  };

  const tmpConfigPath = path.join(outputDir, '.tsconfig.verify.json');

  try {
    await fs.writeFile(tmpConfigPath, JSON.stringify(tmpConfig, null, 2), 'utf-8');
    await execFileAsync('npx', ['tsc', '--project', tmpConfigPath], { cwd: outputDir });
    return { passed: true, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Parse tsc output for error lines.
    const errors = message
      .split('\n')
      .filter((line) => line.includes('error TS'))
      .slice(0, 20); // Cap at 20 errors for readability.
    return { passed: false, errors };
  } finally {
    await fs.unlink(tmpConfigPath).catch(() => undefined);
  }
}

// ============================================================================
// Claude refinement loop
// ============================================================================

/** A single file to be reviewed/refined by Claude. */
interface FileForRefinement {
  filename: string;
  componentName: string;
  content: string;
}

/** Serialise files into a block that Claude can read. */
function formatFilesForPrompt(files: FileForRefinement[]): string {
  return files
    .map(
      (f) =>
        `=== FILE: ${f.filename} (component: ${f.componentName}) ===\n\`\`\`tsx\n${f.content}\n\`\`\``
    )
    .join('\n\n');
}

/** Parse refined file content out of Claude's response. */
function parseRefinedFiles(response: string, original: FileForRefinement[]): FileForRefinement[] {
  const refined: FileForRefinement[] = [];

  for (const file of original) {
    // Look for a code block labelled with the filename.
    const filenamePattern = new RegExp(
      `===\\s*FILE:\\s*${file.filename}[^=]*===\\s*\`\`\`(?:tsx|typescript|ts)?\\s*([\\s\\S]*?)\`\`\``,
      'i'
    );
    const match = filenamePattern.exec(response);

    if (match?.[1]) {
      refined.push({ ...file, content: match[1].trim() });
      continue;
    }

    // Fallback: look for any tsx code block if only one file.
    if (original.length === 1) {
      const genericPattern = /```(?:tsx|typescript|ts)?\s*([\s\S]*?)```/i;
      const genericMatch = genericPattern.exec(response);
      if (genericMatch?.[1]) {
        refined.push({ ...file, content: genericMatch[1].trim() });
        continue;
      }
    }

    // No refinement found for this file — keep original.
    refined.push(file);
  }

  return refined;
}

/** Run one refinement iteration with Claude. */
async function refineIteration(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  files: FileForRefinement[],
  instructions: string,
  iterationNumber: number
): Promise<FileForRefinement[]> {
  const userMessage =
    iterationNumber === 1
      ? `Here are the generated React components:\n\n${formatFilesForPrompt(files)}\n\n` +
        `Please refine them according to these instructions:\n${instructions}\n\n` +
        `Return each refined file in the same format: === FILE: <filename> === followed by a tsx code block.`
      : `Iteration ${iterationNumber}. Please continue refining based on the instructions:\n${instructions}\n\n` +
        `Current state of files:\n\n${formatFilesForPrompt(files)}\n\n` +
        `Return any files that need further changes in the same format.`;

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  // Check if Claude says no further changes are needed.
  const doneSignals = [
    'no further changes',
    'no changes needed',
    'looks good',
    'already complete',
    'no refinements needed',
  ];
  const isDone = doneSignals.some((signal) => responseText.toLowerCase().includes(signal));

  if (isDone) {
    return files; // Stop iterating early.
  }

  return parseRefinedFiles(responseText, files);
}

// ============================================================================
// ImplementAgent — public class
// ============================================================================

/**
 * AI agent that converts .pen design files to production React components.
 *
 * @example
 * ```ts
 * const agent = new ImplementAgent({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *
 * const result = await agent.generate({
 *   penFilePath: './designs/shadcn-kit.pen',
 *   outputDir: './src/components',
 *   mode: 'library',
 *   instructions: 'Add data-testid attributes and ARIA roles to every component.',
 * });
 *
 * console.log(`Generated ${result.files.length} components`);
 * console.log(`TypeCheck: ${result.typeCheck.passed ? 'PASS' : 'FAIL'}`);
 * ```
 */
export class ImplementAgent {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly verbose: boolean;

  constructor(options: ImplementAgentOptions = {}) {
    const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'ImplementAgent: No API key provided. ' +
          'Pass `apiKey` in options or set the ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? 'claude-3-5-sonnet-20241022';
    this.verbose = options.verbose ?? false;
  }

  /** Log to stderr when verbose mode is enabled. */
  private log(message: string): void {
    if (this.verbose) {
      process.stderr.write(`[implement-agent] ${message}\n`);
    }
  }

  /**
   * Generate React components from a .pen design file.
   *
   * Steps:
   * 1. Parse the .pen file.
   * 2. Run the codegen pipeline to produce initial .tsx files.
   * 3. Filter to a single component if `mode = 'single'`.
   * 4. Optionally refine with Claude using the provided `instructions`.
   * 5. Write all files to `outputDir`.
   * 6. Run TypeScript type-checking on the output.
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const {
      penFilePath,
      outputDir,
      mode,
      componentName,
      instructions,
      cssStrategy = 'inline',
      exportStyle = 'named',
      maxIterations = 3,
    } = options;

    const absOutputDir = path.resolve(outputDir);

    try {
      // ── Step 1: Parse the .pen file ─────────────────────────────────────────
      this.log(`Parsing .pen file: ${penFilePath}`);
      const doc = await parsePenFileFromPath(penFilePath);

      // ── Step 2: Run codegen pipeline ─────────────────────────────────────────
      this.log(`Running codegen pipeline (mode: ${mode})`);
      let generatedFiles = await runCodegen(doc, { cssStrategy, exportStyle });

      if (generatedFiles.length === 0) {
        return {
          success: false,
          files: [],
          outputDir: absOutputDir,
          refinements: 0,
          typeCheck: { passed: false, errors: [] },
          error:
            'No reusable components found in the .pen file. ' +
            'Mark frames as reusable (reusable: true) to generate components.',
        };
      }

      this.log(`Codegen produced ${generatedFiles.length} component(s)`);

      // ── Step 3: Filter for single-component mode ──────────────────────────────
      if (mode === 'single') {
        if (!componentName) {
          throw new Error('`componentName` is required when `mode = "single"`');
        }
        generatedFiles = filterSingleComponent(generatedFiles, componentName);
        this.log(`Filtered to single component: ${generatedFiles[0]!.componentName}`);
      }

      // ── Step 4: Claude refinement (optional) ──────────────────────────────────
      let refinements = 0;
      let filesForOutput: FileForRefinement[] = generatedFiles.map((f) => ({
        filename: f.filename,
        componentName: f.componentName,
        content: f.content,
      }));

      if (instructions) {
        this.log(`Starting refinement loop (max ${maxIterations} iteration(s))`);
        const systemPrompt = await loadSystemPrompt();

        for (let i = 1; i <= maxIterations; i++) {
          this.log(`Refinement iteration ${i}/${maxIterations}`);
          const refined = await refineIteration(
            this.client,
            this.model,
            systemPrompt,
            filesForOutput,
            instructions,
            i
          );

          refinements++;

          // Check if anything actually changed.
          const changed = refined.some((r, idx) => r.content !== filesForOutput[idx]?.content);

          filesForOutput = refined;

          if (!changed) {
            this.log(`No changes in iteration ${i} — stopping early`);
            break;
          }
        }
      }

      // ── Step 5: Write files to disk ───────────────────────────────────────────
      this.log(`Writing ${filesForOutput.length} file(s) to ${absOutputDir}`);
      const written = await writeFiles(filesForOutput, absOutputDir);

      // ── Step 6: TypeScript type-check ─────────────────────────────────────────
      this.log(`Running TypeScript type-check on output`);
      const typeCheck = await runTypeCheck(absOutputDir);

      if (!typeCheck.passed) {
        this.log(`Type-check failed with ${typeCheck.errors.length} error(s)`);
      } else {
        this.log(`Type-check passed`);
      }

      return {
        success: true,
        files: written,
        outputDir: absOutputDir,
        refinements,
        typeCheck,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log(`Error: ${error}`);
      return {
        success: false,
        files: [],
        outputDir: absOutputDir,
        refinements: 0,
        typeCheck: { passed: false, errors: [] },
        error,
      };
    }
  }

  /**
   * Refine existing generated components in a directory based on instructions.
   *
   * Use this when you want to iterate on components that have already been
   * generated (e.g. from a previous `generate()` call).
   *
   * @param outputDir    Directory containing the .tsx files to refine.
   * @param instructions Natural-language refinement instructions for Claude.
   * @param maxIterations Maximum number of Claude refinement iterations. Defaults to `3`.
   */
  async refine(
    outputDir: string,
    instructions: string,
    maxIterations = 3
  ): Promise<GenerateResult> {
    const absOutputDir = path.resolve(outputDir);

    try {
      // Read existing .tsx files from the output directory.
      const entries = await fs.readdir(absOutputDir);
      const tsxFiles = entries.filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

      if (tsxFiles.length === 0) {
        return {
          success: false,
          files: [],
          outputDir: absOutputDir,
          refinements: 0,
          typeCheck: { passed: false, errors: [] },
          error: `No .tsx / .ts files found in ${absOutputDir}`,
        };
      }

      const files: FileForRefinement[] = await Promise.all(
        tsxFiles.map(async (filename) => {
          const content = await fs.readFile(path.join(absOutputDir, filename), 'utf-8');
          // Derive component name from filename (strip extension).
          const componentName = toPascalCase(filename.replace(/\.(tsx|ts)$/, ''));
          return { filename, componentName, content };
        })
      );

      this.log(`Refining ${files.length} file(s) in ${absOutputDir}`);

      const systemPrompt = await loadSystemPrompt();
      let current = files;
      let refinements = 0;

      for (let i = 1; i <= maxIterations; i++) {
        this.log(`Refinement iteration ${i}/${maxIterations}`);
        const refined = await refineIteration(
          this.client,
          this.model,
          systemPrompt,
          current,
          instructions,
          i
        );

        refinements++;
        const changed = refined.some((r, idx) => r.content !== current[idx]?.content);
        current = refined;

        if (!changed) {
          this.log(`No changes in iteration ${i} — stopping early`);
          break;
        }
      }

      // Write refined files back.
      const written = await writeFiles(current, absOutputDir);
      const typeCheck = await runTypeCheck(absOutputDir);

      return {
        success: true,
        files: written,
        outputDir: absOutputDir,
        refinements,
        typeCheck,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        files: [],
        outputDir: absOutputDir,
        refinements: 0,
        typeCheck: { passed: false, errors: [] },
        error,
      };
    }
  }
}

// ============================================================================
// Convenience factory
// ============================================================================

/**
 * Create an `ImplementAgent` with the given API key.
 *
 * @example
 * ```ts
 * const agent = createImplementAgent({ apiKey: process.env.ANTHROPIC_API_KEY! });
 * const result = await agent.generate({ ... });
 * ```
 */
export function createImplementAgent(options: ImplementAgentOptions = {}): ImplementAgent {
  return new ImplementAgent(options);
}
