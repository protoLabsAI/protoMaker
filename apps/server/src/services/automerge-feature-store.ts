/**
 * AutomergeFeatureStore — FeatureStore implementation backed by an in-memory Automerge CRDT document.
 *
 * Reads are served from the in-memory Automerge doc (no disk I/O after init).
 * Writes go through the parent FeatureLoader for disk persistence, then update the CRDT doc.
 * Remote peer changes can be merged in via applyRemoteChanges(), which emits feature:updated events.
 *
 * Falls back to the parent FeatureLoader for all operations when no proto.config.yaml is present
 * at the projectPath (single-instance mode).
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import * as Automerge from '@automerge/automerge';
import type { Feature } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('AutomergeFeatureStore');

// Automerge document shape.
// Feature values are typed as Feature so reads are convenient;
// writes use direct assignment which Automerge deep-copies.
type FeaturesDoc = { features: Record<string, Feature> };

export class AutomergeFeatureStore extends FeatureLoader {
  /** Automerge docs, one per projectPath */
  private readonly docs = new Map<string, Automerge.Doc<FeaturesDoc>>();

  /** Initialization promises keyed by projectPath — prevents concurrent inits */
  private readonly initPromises = new Map<string, Promise<void>>();

  /** Cache of proto.config presence per projectPath — true means CRDT is enabled */
  private readonly crdtEnabled = new Map<string, boolean>();

  /** EventEmitter for broadcasting feature:updated events */
  private readonly crdtEvents: EventEmitter;

  constructor(events: EventEmitter) {
    super();
    this.crdtEvents = events;
  }

  // ─── CRDT gate ────────────────────────────────────────────────────────────

  private isCrdtEnabled(projectPath: string): boolean {
    if (this.crdtEnabled.has(projectPath)) {
      return this.crdtEnabled.get(projectPath)!;
    }
    const enabled = existsSync(path.join(projectPath, 'proto.config.yaml'));
    this.crdtEnabled.set(projectPath, enabled);
    return enabled;
  }

  // ─── Automerge helpers ────────────────────────────────────────────────────

  /**
   * Strip undefined values from an object before inserting into Automerge.
   * Automerge does not support undefined — use null or omit the key.
   * JSON round-trip drops undefined-valued properties, which is equivalent.
   */
  private toAutomergeValue(feature: Feature): Record<string, unknown> {
    return JSON.parse(JSON.stringify(feature)) as Record<string, unknown>;
  }

  // ─── Doc lifecycle ────────────────────────────────────────────────────────

  private async ensureDoc(projectPath: string): Promise<Automerge.Doc<FeaturesDoc>> {
    if (this.docs.has(projectPath)) {
      return this.docs.get(projectPath)!;
    }
    if (!this.initPromises.has(projectPath)) {
      this.initPromises.set(projectPath, this.initDoc(projectPath));
    }
    await this.initPromises.get(projectPath);
    return this.docs.get(projectPath)!;
  }

  private async initDoc(projectPath: string): Promise<void> {
    const features = await super.getAll(projectPath);
    let doc = Automerge.from<FeaturesDoc>({ features: {} });
    doc = Automerge.change(doc, (d) => {
      for (const feature of features) {
        if (feature.id) {
          // Cast through unknown to satisfy Automerge's mutable-doc typing in the change callback
          (d.features as Record<string, unknown>)[feature.id] = this.toAutomergeValue(feature);
        }
      }
    });
    this.docs.set(projectPath, doc);
    logger.info(`Initialized Automerge doc for ${projectPath} with ${features.length} features`);
  }

  // ─── FeatureStore read methods ────────────────────────────────────────────

  override async getAll(projectPath: string): Promise<Feature[]> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.getAll(projectPath);
    }
    const doc = await this.ensureDoc(projectPath);
    const features = Object.values(doc.features || {}).map((f) =>
      this.normalizeFeature(f as Feature)
    );
    features.sort((a, b) => {
      const aTime = a.id ? parseInt(a.id.split('-')[1] || '0') : 0;
      const bTime = b.id ? parseInt(b.id.split('-')[1] || '0') : 0;
      return aTime - bTime;
    });
    return features;
  }

  override async get(projectPath: string, featureId: string): Promise<Feature | null> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.get(projectPath, featureId);
    }
    const doc = await this.ensureDoc(projectPath);
    const raw = (doc.features || {})[featureId];
    if (!raw) return null;
    return this.normalizeFeature(raw as Feature);
  }

  // ─── FeatureStore write methods ───────────────────────────────────────────

  override async create(projectPath: string, featureData: Partial<Feature>): Promise<Feature> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.create(projectPath, featureData);
    }
    // Persist to disk via parent (handles dirs, images, backups, Prometheus)
    const feature = await super.create(projectPath, featureData);
    // Update in-memory CRDT doc
    const doc = await this.ensureDoc(projectPath);
    const newDoc = Automerge.change(doc, (d) => {
      (d.features as Record<string, unknown>)[feature.id] = this.toAutomergeValue(feature);
    });
    this.docs.set(projectPath, newDoc);
    this.crdtEvents.emit('feature:updated', { featureId: feature.id, projectPath, feature });
    return feature;
  }

  override async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string,
    options?: { skipEventEmission?: boolean }
  ): Promise<Feature> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.update(
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription,
        options
      );
    }
    // Persist to disk via parent
    const updated = await super.update(
      projectPath,
      featureId,
      updates,
      descriptionHistorySource,
      enhancementMode,
      preEnhancementDescription,
      options
    );
    // Update in-memory CRDT doc
    const doc = await this.ensureDoc(projectPath);
    const newDoc = Automerge.change(doc, (d) => {
      (d.features as Record<string, unknown>)[featureId] = this.toAutomergeValue(updated);
    });
    this.docs.set(projectPath, newDoc);
    this.crdtEvents.emit('feature:updated', { featureId, projectPath, feature: updated });
    return updated;
  }

  override async delete(projectPath: string, featureId: string): Promise<boolean> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.delete(projectPath, featureId);
    }
    const result = await super.delete(projectPath, featureId);
    if (result) {
      const doc = await this.ensureDoc(projectPath);
      const newDoc = Automerge.change(doc, (d) => {
        delete (d.features as Record<string, Feature | undefined>)[featureId];
      });
      this.docs.set(projectPath, newDoc);
      this.crdtEvents.emit('feature:updated', { featureId, projectPath, feature: null });
    }
    return result;
  }

  // ─── claim / release ─────────────────────────────────────────────────────

  /**
   * Optimistic CRDT claim:
   *   1. Check the in-memory doc — reject immediately if already claimed by another instance.
   *   2. Write the claim (to disk + CRDT doc).
   *   3. Wait ~200ms for sync to settle.
   *   4. Re-read from the CRDT doc; if another instance won, release and return false.
   */
  override async claim(
    projectPath: string,
    featureId: string,
    instanceId: string
  ): Promise<boolean> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.claim(projectPath, featureId, instanceId);
    }

    // Pre-check from in-memory doc
    const doc = await this.ensureDoc(projectPath);
    const current = (doc.features || {})[featureId] as Feature | undefined;
    if (!current) return false;
    if (current.claimedBy && current.claimedBy !== instanceId) {
      return false;
    }

    // Write the claim
    await this.update(projectPath, featureId, { claimedBy: instanceId });

    // Wait for sync to settle
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    // Re-read and verify ownership
    const verifiedDoc = await this.ensureDoc(projectPath);
    const verified = (verifiedDoc.features || {})[featureId] as Feature | undefined;
    if (!verified) {
      return false;
    }
    if (verified.claimedBy !== instanceId) {
      await this.release(projectPath, featureId);
      return false;
    }

    return true;
  }

  override async release(projectPath: string, featureId: string): Promise<void> {
    if (!this.isCrdtEnabled(projectPath)) {
      return super.release(projectPath, featureId);
    }
    await this.update(projectPath, featureId, { claimedBy: undefined });
  }

  // ─── Peer sync ────────────────────────────────────────────────────────────

  /**
   * Apply changes received from a remote peer (delivered by the sync layer).
   * Merges the changes into the local Automerge doc and emits feature:updated
   * events for any features that changed.
   *
   * Called by the wiring layer when 'crdt:remote-changes' fires on the EventBus.
   */
  applyRemoteChanges(projectPath: string, changes: Uint8Array[]): void {
    let doc = this.docs.get(projectPath);
    const isNew = !doc;

    if (!doc) {
      // Initialise an empty doc; caller is responsible for applying a full snapshot
      doc = Automerge.init<FeaturesDoc>();
      // Mark as initialised so ensureDoc skips disk load
      this.initPromises.set(projectPath, Promise.resolve());
    }

    const oldFeatures = doc.features || {};
    const [newDoc] = Automerge.applyChanges<FeaturesDoc>(doc, changes);
    this.docs.set(projectPath, newDoc);

    const newFeatures = newDoc.features || {};
    const allIds = new Set([...Object.keys(oldFeatures), ...Object.keys(newFeatures)]);

    for (const featureId of allIds) {
      const oldRaw = isNew ? undefined : oldFeatures[featureId];
      const newRaw = newFeatures[featureId];
      const unchanged =
        !isNew &&
        oldRaw !== undefined &&
        newRaw !== undefined &&
        JSON.stringify(oldRaw) === JSON.stringify(newRaw);
      if (!unchanged) {
        const feature = newRaw ? (newRaw as Feature) : null;
        this.crdtEvents.emit('feature:updated', { featureId, projectPath, feature });
      }
    }

    logger.debug(
      `Applied ${changes.length} remote change(s) for ${projectPath}, ` +
        `${allIds.size} feature(s) in scope`
    );
  }

  /**
   * Returns the binary Automerge snapshot for a project's doc.
   * Used by tests and the sync layer to obtain changes to send to peers.
   */
  async getDocBinary(projectPath: string): Promise<Uint8Array> {
    const doc = await this.ensureDoc(projectPath);
    return Automerge.save(doc);
  }

  /**
   * Invalidate the cached doc for a project (forces re-init from disk on next access).
   * Useful when an external process modifies feature files directly.
   */
  invalidateDoc(projectPath: string): void {
    this.docs.delete(projectPath);
    this.initPromises.delete(projectPath);
    this.crdtEnabled.delete(projectPath);
  }
}
