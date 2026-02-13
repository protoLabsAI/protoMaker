/**
 * Template Variable Validator
 *
 * Validates template strings and ensures all {{variables}} have values.
 * Prevents runtime errors from undefined variables in templates.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('TemplateValidator');

/**
 * Regular expression to match template variables: {{variableName}}
 */
const TEMPLATE_VAR_REGEX = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;

/**
 * Extract all variable names from a template string
 *
 * @param template - Template string to parse
 * @returns Array of variable names found in the template
 */
export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  const matches = template.matchAll(TEMPLATE_VAR_REGEX);

  for (const match of matches) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }

  return Array.from(variables);
}

/**
 * Validate that all template variables have corresponding values
 *
 * @param template - Template string to validate
 * @param variables - Object containing variable values
 * @returns Validation result with missing variables
 */
export function validateTemplateVariables(
  template: string,
  variables: Record<string, unknown>
): {
  success: boolean;
  missingVariables?: string[];
  errors?: string[];
} {
  const requiredVars = extractTemplateVariables(template);

  if (requiredVars.length === 0) {
    return { success: true };
  }

  const missingVariables = requiredVars.filter((varName) => {
    const value = getNestedValue(variables, varName);
    return value === undefined || value === null;
  });

  if (missingVariables.length === 0) {
    return { success: true };
  }

  const errors = missingVariables.map((varName) => {
    return `Template variable '{{${varName}}}' is undefined or null`;
  });

  logger.error('Template validation failed:', { missingVariables });

  return {
    success: false,
    missingVariables,
    errors,
  };
}

/**
 * Replace template variables with their values
 *
 * @param template - Template string
 * @param variables - Variable values
 * @returns Rendered template string or validation errors
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>
): {
  success: boolean;
  result?: string;
  errors?: string[];
} {
  // First validate all variables are present
  const validation = validateTemplateVariables(template, variables);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  try {
    // Replace all variables
    const result = template.replace(TEMPLATE_VAR_REGEX, (match, varName) => {
      const value = getNestedValue(variables, varName);

      // Convert value to string
      if (typeof value === 'string') {
        return value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      } else if (value === null || value === undefined) {
        // This should not happen after validation, but handle it just in case
        logger.error(`Variable ${varName} is null or undefined during rendering`);
        return match; // Keep original placeholder
      } else if (typeof value === 'object') {
        // For objects, use JSON representation
        return JSON.stringify(value);
      } else {
        return String(value);
      }
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    logger.error('Template rendering failed:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown rendering error'],
    };
  }
}

/**
 * Get nested value from object using dot notation
 * Supports paths like: "user.name", "config.discord.categoryId"
 *
 * @param obj - Object to get value from
 * @param path - Dot-separated path to value
 * @returns Value at path or undefined
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Validate variable type matches expected type
 *
 * @param value - Variable value to check
 * @param expectedType - Expected type ('string', 'number', 'boolean', 'object', 'array')
 * @returns Whether value matches expected type
 */
export function validateVariableType(
  value: unknown,
  expectedType: 'string' | 'number' | 'boolean' | 'object' | 'array'
): {
  success: boolean;
  actualType?: string;
  error?: string;
} {
  const actualType = Array.isArray(value) ? 'array' : typeof value;

  if (actualType === expectedType) {
    return { success: true };
  }

  return {
    success: false,
    actualType,
    error: `Expected ${expectedType}, got ${actualType}`,
  };
}

/**
 * Validate multiple templates at once
 *
 * @param templates - Map of template names to template strings
 * @param variables - Variable values
 * @returns Validation result for all templates
 */
export function validateTemplates(
  templates: Record<string, string>,
  variables: Record<string, unknown>
): {
  success: boolean;
  errors?: Record<string, string[]>;
} {
  const errors: Record<string, string[]> = {};
  let hasErrors = false;

  for (const [name, template] of Object.entries(templates)) {
    const result = validateTemplateVariables(template, variables);
    if (!result.success && result.errors) {
      errors[name] = result.errors;
      hasErrors = true;
    }
  }

  if (hasErrors) {
    return {
      success: false,
      errors,
    };
  }

  return { success: true };
}

/**
 * Check if a string contains any template variables
 *
 * @param str - String to check
 * @returns True if string contains template variables
 */
export function hasTemplateVariables(str: string): boolean {
  return TEMPLATE_VAR_REGEX.test(str);
}
