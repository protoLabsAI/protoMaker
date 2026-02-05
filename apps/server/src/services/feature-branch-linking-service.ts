/**
 * Feature-Branch Linking Service
 *
 * Links features to their corresponding branches and PRs, enabling
 * CodeRabbit feedback to be associated with the correct feature.
 */

import path from 'path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';
import type { Feature, FeatureBranchLink, FeatureCodeRabbitFeedback } from '@automaker/types';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('FeatureBranchLinking');

const BRANCH_LINKS_FILE = 'branch-links.json';
const CODERABBIT_FEEDBACK_FILE = 'coderabbit-feedback.json';

interface BranchLinksData {
  version: number;
  links: FeatureBranchLink[];
  updatedAt: string;
}

interface CodeRabbitFeedbackData {
  version: number;
  feedback: FeatureCodeRabbitFeedback[];
  updatedAt: string;
}

export class FeatureBranchLinkingService {
  /**
   * Get the path to the branch links file
   */
  private getBranchLinksPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), BRANCH_LINKS_FILE);
  }

  /**
   * Get the path to the CodeRabbit feedback file
   */
  private getCodeRabbitFeedbackPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), CODERABBIT_FEEDBACK_FILE);
  }

  /**
   * Load branch links from storage
   */
  private async loadBranchLinks(projectPath: string): Promise<BranchLinksData> {
    const filePath = this.getBranchLinksPath(projectPath);
    const defaultData: BranchLinksData = {
      version: 1,
      links: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      const result = await readJsonWithRecovery<BranchLinksData>(filePath, defaultData);
      return result.data;
    } catch {
      return defaultData;
    }
  }

  /**
   * Save branch links to storage
   */
  private async saveBranchLinks(projectPath: string, data: BranchLinksData): Promise<void> {
    const filePath = this.getBranchLinksPath(projectPath);
    data.updatedAt = new Date().toISOString();
    await atomicWriteJson(filePath, data, { indent: 2 });
  }

  /**
   * Load CodeRabbit feedback from storage
   */
  private async loadCodeRabbitFeedback(projectPath: string): Promise<CodeRabbitFeedbackData> {
    const filePath = this.getCodeRabbitFeedbackPath(projectPath);
    const defaultData: CodeRabbitFeedbackData = {
      version: 1,
      feedback: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      const result = await readJsonWithRecovery<CodeRabbitFeedbackData>(filePath, defaultData);
      return result.data;
    } catch {
      return defaultData;
    }
  }

  /**
   * Save CodeRabbit feedback to storage
   */
  private async saveCodeRabbitFeedback(
    projectPath: string,
    data: CodeRabbitFeedbackData
  ): Promise<void> {
    const filePath = this.getCodeRabbitFeedbackPath(projectPath);
    data.updatedAt = new Date().toISOString();
    await atomicWriteJson(filePath, data, { indent: 2 });
  }

  /**
   * Create or update a link between a feature and its branch/PR
   */
  async linkFeatureToBranch(
    projectPath: string,
    featureId: string,
    branchName: string,
    prNumber?: number,
    prUrl?: string
  ): Promise<FeatureBranchLink> {
    const data = await this.loadBranchLinks(projectPath);

    // Check if link already exists
    const existingIndex = data.links.findIndex((link) => link.featureId === featureId);

    const link: FeatureBranchLink = {
      featureId,
      branchName,
      prNumber,
      prUrl,
      linkedAt: existingIndex >= 0 ? data.links[existingIndex].linkedAt : new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      data.links[existingIndex] = link;
      logger.info(`Updated link for feature ${featureId} to branch ${branchName}`);
    } else {
      data.links.push(link);
      logger.info(`Created link for feature ${featureId} to branch ${branchName}`);
    }

    await this.saveBranchLinks(projectPath, data);
    return link;
  }

  /**
   * Get feature linked to a specific branch
   */
  async getFeatureByBranch(projectPath: string, branchName: string): Promise<FeatureBranchLink | null> {
    const data = await this.loadBranchLinks(projectPath);
    return data.links.find((link) => link.branchName === branchName) || null;
  }

  /**
   * Get feature linked to a specific PR number
   */
  async getFeatureByPR(projectPath: string, prNumber: number): Promise<FeatureBranchLink | null> {
    const data = await this.loadBranchLinks(projectPath);
    return data.links.find((link) => link.prNumber === prNumber) || null;
  }

  /**
   * Get branch link for a specific feature
   */
  async getBranchLinkByFeature(projectPath: string, featureId: string): Promise<FeatureBranchLink | null> {
    const data = await this.loadBranchLinks(projectPath);
    return data.links.find((link) => link.featureId === featureId) || null;
  }

  /**
   * List all branch links
   */
  async listBranchLinks(projectPath: string): Promise<FeatureBranchLink[]> {
    const data = await this.loadBranchLinks(projectPath);
    return data.links;
  }

  /**
   * Remove a branch link
   */
  async removeBranchLink(projectPath: string, featureId: string): Promise<boolean> {
    const data = await this.loadBranchLinks(projectPath);
    const initialLength = data.links.length;
    data.links = data.links.filter((link) => link.featureId !== featureId);

    if (data.links.length < initialLength) {
      await this.saveBranchLinks(projectPath, data);
      logger.info(`Removed branch link for feature ${featureId}`);
      return true;
    }

    return false;
  }

  /**
   * Store CodeRabbit feedback for a feature
   */
  async storeCodeRabbitFeedback(
    projectPath: string,
    feedback: FeatureCodeRabbitFeedback
  ): Promise<void> {
    const data = await this.loadCodeRabbitFeedback(projectPath);

    // Check if feedback already exists for this feature
    const existingIndex = data.feedback.findIndex((f) => f.featureId === feedback.featureId);

    if (existingIndex >= 0) {
      data.feedback[existingIndex] = feedback;
      logger.info(`Updated CodeRabbit feedback for feature ${feedback.featureId}`);
    } else {
      data.feedback.push(feedback);
      logger.info(`Stored CodeRabbit feedback for feature ${feedback.featureId}`);
    }

    await this.saveCodeRabbitFeedback(projectPath, data);
  }

  /**
   * Get CodeRabbit feedback for a feature
   */
  async getCodeRabbitFeedback(
    projectPath: string,
    featureId: string
  ): Promise<FeatureCodeRabbitFeedback | null> {
    const data = await this.loadCodeRabbitFeedback(projectPath);
    return data.feedback.find((f) => f.featureId === featureId) || null;
  }

  /**
   * List all CodeRabbit feedback
   */
  async listCodeRabbitFeedback(projectPath: string): Promise<FeatureCodeRabbitFeedback[]> {
    const data = await this.loadCodeRabbitFeedback(projectPath);
    return data.feedback;
  }

  /**
   * Remove CodeRabbit feedback for a feature
   */
  async removeCodeRabbitFeedback(projectPath: string, featureId: string): Promise<boolean> {
    const data = await this.loadCodeRabbitFeedback(projectPath);
    const initialLength = data.feedback.length;
    data.feedback = data.feedback.filter((f) => f.featureId !== featureId);

    if (data.feedback.length < initialLength) {
      await this.saveCodeRabbitFeedback(projectPath, data);
      logger.info(`Removed CodeRabbit feedback for feature ${featureId}`);
      return true;
    }

    return false;
  }

  /**
   * Auto-link features based on their branchName property
   * This should be called when features are created or when a PR is created
   */
  async autoLinkFeaturesFromBranches(
    projectPath: string,
    features: Feature[]
  ): Promise<FeatureBranchLink[]> {
    const links: FeatureBranchLink[] = [];

    for (const feature of features) {
      if (feature.branchName) {
        const link = await this.linkFeatureToBranch(
          projectPath,
          feature.id,
          feature.branchName
        );
        links.push(link);
      }
    }

    logger.info(`Auto-linked ${links.length} features to branches`);
    return links;
  }
}

// Export singleton instance
export const featureBranchLinkingService = new FeatureBranchLinkingService();
