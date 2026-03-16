import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

/**
 * Creates a state annotation from a Zod schema with optional reducers
 */
export function createStateAnnotation<T extends Record<string, z.ZodTypeAny>>(
  schema: z.ZodObject<T>,
  reducers?: Partial<{
    [K in keyof T]: (left: z.infer<T[K]>, right: z.infer<T[K]>) => z.infer<T[K]>;
  }>
) {
  const schemaShape = schema.shape as T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annotationSpec: Record<string, any> = {};

  for (const key in schemaShape) {
    const fieldSchema = schemaShape[key];
    const reducer = reducers?.[key as keyof T];

    if (reducer) {
      annotationSpec[key] = {
        value: fieldSchema,
        reducer: reducer,
      };
    } else {
      annotationSpec[key] = fieldSchema;
    }
  }

  return Annotation.Root(annotationSpec);
}

/**
 * Validates state against a Zod schema
 */
export function validateState<T extends z.ZodTypeAny>(
  schema: T,
  state: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(state);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error as z.ZodError };
  }
}

/**
 * Creates a type-safe state updater function
 */
export function createStateUpdater<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return (state: Partial<z.infer<T>>): Partial<z.infer<T>> => {
    const result = schema.partial().safeParse(state);
    if (!result.success) {
      throw new Error(`Invalid state update: ${(result.error as z.ZodError).message}`);
    }
    return result.data as Partial<z.infer<T>>;
  };
}

/**
 * Merges two state objects, with right taking precedence
 */
export function mergeState<T extends Record<string, unknown>>(left: T, right: Partial<T>): T {
  return { ...left, ...right };
}

/**
 * Deep merges two state objects
 */
export function deepMergeState<T extends Record<string, unknown>>(left: T, right: Partial<T>): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = { ...left };

  for (const key in right) {
    const rightValue = right[key];
    const leftValue = left[key];

    if (
      rightValue !== undefined &&
      typeof rightValue === 'object' &&
      !Array.isArray(rightValue) &&
      leftValue !== undefined &&
      typeof leftValue === 'object' &&
      !Array.isArray(leftValue)
    ) {
      result[key] = deepMergeState(
        leftValue as Record<string, unknown>,
        rightValue as Record<string, unknown>
      );
    } else {
      result[key] = rightValue;
    }
  }

  return result;
}

/**
 * Type guard for checking if a value is a valid state update
 */
export function isValidStateUpdate<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  value: unknown
): value is Partial<z.infer<T>> {
  const result = schema.partial().safeParse(value);
  return result.success;
}
