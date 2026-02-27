import { createFileRoute } from '@tanstack/react-router';
import { FileEditorView } from '@/components/views/file-editor-view/file-editor-view';

export const Route = createFileRoute('/file-editor')({
  component: FileEditorView,
});
