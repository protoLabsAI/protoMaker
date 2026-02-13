import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

/**
 * Type utility to extract Zod schema type
 */
export type InferZodType<T extends z.ZodType<any>> = z.infer<T>;

/**
 * Creates a state annotation from a Zod schema with optional reducers
 */
export function createStateAnnotation<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  reducers?: Partial<{
    [K in keyof T]: (left: InferZodType<T[K]>, right: InferZodType<T[K]>) => InferZodType<T[K]>;
  }>
) {
  const schemaShape = schema.shape;
  const annotationSpec: Record<string, any> = {};

  for (const key in schemaShape) {
    const fieldSchema = schemaShape[key];
    const reducer = reducers?.[key];

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
export function validateState<T extends z.ZodType<any>>(
  schema: T,
  state: unknown
): { success: true; data: InferZodType<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(state);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Creates a type-safe state updater function
 */
export function createStateUpdater<T extends z.ZodObject<any>>(schema: T) {
  return (state: Partial<InferZodType<T>>): Partial<InferZodType<T>> => {
    const result = schema.partial().safeParse(state);
    if (!result.success) {
      throw new Error(`Invalid state update: ${result.error.message}`);
    }
    return result.data;
  };
}

/**
 * Merges two state objects, with right taking precedence
 */
export function mergeState<T extends Record<string, any>>(left: T, right: Partial<T>): T {
  return { ...left, ...right };
}

/**
 * Deep merges two state objects
 */
export function deepMergeState<T extends Record<string, any>>(left: T, right: Partial<T>): T {
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
      result[key] = deepMergeState(leftValue, rightValue);
    } else {
      result[key] = rightValue;
    }
  }

  return result;
}

/**
 * Type guard for checking if a value is a valid state update
 */
export function isValidStateUpdate<T extends z.ZodObject<any>>(
  schema: T,
  value: unknown
): value is Partial<InferZodType<T>> {
  const result = schema.partial().safeParse(value);
  return result.success;
}
