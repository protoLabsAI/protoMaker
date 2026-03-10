/**
 * @protolabsai/git-utils
 * Git operations utilities for AutoMaker
 */

// Export types and constants
export { BINARY_EXTENSIONS, GIT_STATUS_MAP, type FileStatus } from './types.js';

// Export status utilities
export { isGitRepo, parseGitStatus } from './status.js';

// Export diff utilities
export {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory,
  getGitRepositoryDiffs,
} from './diff.js';

// Export merge detection utilities
export { isBranchMerged, isCommitOnBranch, getBranchHeadCommit, branchExists } from './merge.js';

// Export rebase utilities
export { rebaseWorktreeOnMain, type RebaseResult } from './rebase.js';

// Export exec environment utilities
export { createGitExecEnv, extractTitleFromDescription } from './exec-env.js';
