import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeStreamingMarkdown } from '@/lib/sanitize-streaming-markdown';

const SEGMENT_SIZE = 500;
const REMARK_PLUGINS = [remarkGfm];

function splitIntoSegments(content: string): { settled: string[]; tail: string } {
  const settled: string[] = [];
  let remaining = content;

  while (remaining.length > SEGMENT_SIZE + 200) {
    const breakAt = remaining.indexOf('\n\n', SEGMENT_SIZE);
    if (breakAt === -1 || breakAt > SEGMENT_SIZE + 200) {
      settled.push(remaining.slice(0, SEGMENT_SIZE));
      remaining = remaining.slice(SEGMENT_SIZE);
    } else {
      settled.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + 2);
    }
  }

  return { settled, tail: remaining };
}

const SettledSegment = memo(({ content }: { content: string }) => (
  <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
));
SettledSegment.displayName = 'SettledSegment';

interface StreamedMessageProps {
  content: string;
  isComplete: boolean;
}

export function StreamedMessage({ content, isComplete }: StreamedMessageProps) {
  // For short messages skip segmentation entirely — no overhead
  if (content.length <= 5000) {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
        {isComplete ? content : sanitizeStreamingMarkdown(content)}
      </ReactMarkdown>
    );
  }

  return <SegmentedMessage content={content} isComplete={isComplete} />;
}

function SegmentedMessage({ content, isComplete }: StreamedMessageProps) {
  const { settled, tail } = useMemo(() => splitIntoSegments(content), [content]);

  return (
    <>
      {settled.map((seg, i) => (
        <SettledSegment key={i} content={seg} />
      ))}
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
        {isComplete ? tail : sanitizeStreamingMarkdown(tail)}
      </ReactMarkdown>
    </>
  );
}
