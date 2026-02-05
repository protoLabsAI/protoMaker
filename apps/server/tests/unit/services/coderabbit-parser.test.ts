import { describe, it, expect, beforeEach } from 'vitest';
import { CodeRabbitParserService, getCodeRabbitParserService } from '@/services/coderabbit-parser.js';

describe('coderabbit-parser.ts', () => {
  let service: CodeRabbitParserService;

  beforeEach(() => {
    service = new CodeRabbitParserService();
  });

  describe('CodeRabbitParserService', () => {
    describe('parseReview', () => {
      it('should parse a complete CodeRabbit review with summary', () => {
        const markdown = `
## Summary
CodeRabbit review complete. 3 files reviewed, 50 lines changed.
2 critical issues, 3 warnings, 5 suggestions found.
Overall: Code quality needs improvement.

### File: src/services/auth.ts

#### Line 15-20
Critical security issue: SQL injection vulnerability detected.

\`\`\`typescript
const query = "SELECT * FROM users WHERE id = " + userId;
\`\`\`

Suggested fix:
\`\`\`typescript
const query = "SELECT * FROM users WHERE id = ?";
db.query(query, [userId]);
\`\`\`

This should be fixed immediately to prevent SQL injection attacks.
`;

        const result = service.parseReview(markdown);

        // Verify summary
        expect(result.summary.filesReviewed).toBe(3);
        expect(result.summary.linesChanged).toBe(50);
        expect(result.summary.criticalCount).toBe(2);
        expect(result.summary.warningCount).toBe(3);
        expect(result.summary.suggestionCount).toBe(5);
        expect(result.summary.overallAssessment).toBe('Code quality needs improvement.');

        // Verify comments
        expect(result.comments.length).toBeGreaterThan(0);

        const comment = result.comments[0];
        expect(comment.filePath).toBe('src/services/auth.ts');
        expect(comment.lineRange).toEqual({ start: 15, end: 20 });
        expect(comment.severity).toBe('critical');
        expect(comment.category).toBe('security');
        expect(comment.actionable).toBe(true);
        expect(comment.originalCode).toContain('SELECT * FROM users');
        expect(comment.suggestedCode).toContain('db.query');
      });

      it('should parse file-level comments with line numbers', () => {
        const markdown = `
### File: src/components/Button.tsx

#### Line 42
Warning: Consider using a more specific type instead of 'any'.

\`\`\`typescript
function handleClick(event: any) {
\`\`\`

Recommended:
\`\`\`typescript
function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
\`\`\`
`;

        const result = service.parseReview(markdown);

        expect(result.comments.length).toBe(1);

        const comment = result.comments[0];
        expect(comment.filePath).toBe('src/components/Button.tsx');
        expect(comment.lineNumber).toBe(42);
        expect(comment.severity).toBe('warning');
        expect(comment.category).toBe('best-practice');
        expect(comment.actionable).toBe(true);
        expect(comment.suggestedCode).toContain('React.MouseEvent');
      });

      it('should detect severity levels correctly', () => {
        const markdown = `
### File: test.ts

Critical: Security vulnerability found.

---

### File: test2.ts

Warning: Performance issue detected.

---

### File: test3.ts

Suggestion: Consider refactoring this code.

---

### File: test4.ts

Note: This is informational only.
`;

        const result = service.parseReview(markdown);

        expect(result.comments.length).toBe(4);
        expect(result.comments[0].severity).toBe('critical');
        expect(result.comments[1].severity).toBe('warning');
        expect(result.comments[2].severity).toBe('suggestion');
        expect(result.comments[3].severity).toBe('info');
      });

      it('should detect categories correctly', () => {
        const markdown = `
### File: test.ts

Security vulnerability in authentication logic.

---

### File: test2.ts

Performance optimization needed for this loop.

---

### File: test3.ts

Maintainability: This function is too complex.

---

### File: test4.ts

Style: Inconsistent formatting detected.

---

### File: test5.ts

Bug: Null pointer exception possible here.

---

### File: test6.ts

Documentation: Add JSDoc comments.

---

### File: test7.ts

Testing: Missing unit tests for this function.
`;

        const result = service.parseReview(markdown);

        expect(result.comments.length).toBe(7);
        expect(result.comments[0].category).toBe('security');
        expect(result.comments[1].category).toBe('performance');
        expect(result.comments[2].category).toBe('maintainability');
        expect(result.comments[3].category).toBe('style');
        expect(result.comments[4].category).toBe('bug');
        expect(result.comments[5].category).toBe('documentation');
        expect(result.comments[6].category).toBe('testing');
      });

      it('should identify actionable comments', () => {
        const markdown = `
### File: test.ts

This should be fixed immediately.

\`\`\`typescript
const x = 1;
\`\`\`

---

### File: test2.ts

You must change this to use the new API.

---

### File: test3.ts

Note: Just for your information, this pattern is used elsewhere.

---

### File: test4.ts

This is actionable because it has suggested code.

\`\`\`typescript
// bad code
\`\`\`

\`\`\`typescript
// good code
\`\`\`
`;

        const result = service.parseReview(markdown);

        expect(result.comments.length).toBe(4);
        expect(result.comments[0].actionable).toBe(true); // has "should"
        expect(result.comments[1].actionable).toBe(true); // has "must"
        expect(result.comments[2].actionable).toBe(false); // has "note"
        expect(result.comments[3].actionable).toBe(true); // has suggested code
      });

      it('should handle flat comments without file sections', () => {
        const markdown = `
- File: src/utils.ts - Line 10: Fix this bug

- File: src/index.ts - Line 5: Update this import
`;

        const result = service.parseReview(markdown);

        expect(result.comments.length).toBe(2);
        expect(result.comments[0].filePath).toBe('src/utils.ts');
        expect(result.comments[1].filePath).toBe('src/index.ts');
      });

      it('should apply actionableOnly filter', () => {
        const markdown = `
### File: test.ts

This must be fixed.

---

### File: test2.ts

Note: This is just informational.
`;

        const result = service.parseReview(markdown, { actionableOnly: true });

        expect(result.comments.length).toBe(1);
        expect(result.comments[0].actionable).toBe(true);
      });

      it('should apply minSeverity filter', () => {
        const markdown = `
### File: test.ts

Critical: Fix this now.

---

### File: test2.ts

Warning: Consider fixing this.

---

### File: test3.ts

Suggestion: Maybe improve this.

---

### File: test4.ts

Info: Just noting this pattern.
`;

        const result = service.parseReview(markdown, { minSeverity: 'warning' });

        expect(result.comments.length).toBe(2);
        expect(result.comments[0].severity).toBe('critical');
        expect(result.comments[1].severity).toBe('warning');
      });

      it('should apply category filter', () => {
        const markdown = `
### File: test.ts

Security: Fix this vulnerability.

---

### File: test2.ts

Performance: Optimize this loop.

---

### File: test3.ts

Style: Fix formatting.
`;

        const result = service.parseReview(markdown, { categories: ['security', 'performance'] });

        expect(result.comments.length).toBe(2);
        expect(result.comments[0].category).toBe('security');
        expect(result.comments[1].category).toBe('performance');
      });
    });

    describe('getActionableSummary', () => {
      it('should generate a summary of actionable items', () => {
        const markdown = `
### File: test.ts

Critical: This must be fixed.

---

### File: test2.ts

Warning: Consider fixing this.

---

### File: test3.ts

Suggestion: Maybe improve this.

---

### File: test4.ts

Info: This is not actionable.
`;

        const review = service.parseReview(markdown);
        const summary = service.getActionableSummary(review);

        expect(summary).toContain('Found');
        expect(summary).toContain('actionable items');
        expect(summary).toContain('Critical');
        expect(summary).toContain('Warnings');
        expect(summary).toContain('Suggestions');
      });

      it('should return empty message when no actionable items', () => {
        const markdown = `
### File: test.ts

Note: This is just informational.
`;

        const review = service.parseReview(markdown);
        const summary = service.getActionableSummary(review);

        expect(summary).toBe('No actionable items found.');
      });
    });
  });

  describe('getCodeRabbitParserService', () => {
    it('should return singleton instance', () => {
      const instance1 = getCodeRabbitParserService();
      const instance2 = getCodeRabbitParserService();

      expect(instance1).toBe(instance2);
    });
  });
});
