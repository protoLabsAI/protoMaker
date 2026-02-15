/**
 * Entity Review Wizard
 *
 * Multi-step wizard UI for reviewing entity extractions from content flows.
 * Supports merge duplicates, correct names, approve/reject entities.
 * Wired to EntityReview interrupt type via interrupt-router.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@automaker/ui-components/atoms';
import { CheckCircle, XCircle, Edit2, GitMerge, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Entity {
  id: string;
  name: string;
  type: string;
  approved?: boolean;
}

export interface EntityDecision {
  entityId: string;
  action: 'approve' | 'reject' | 'merge' | 'correct';
  newName?: string;
  mergeWith?: string;
}

interface EntityWizardProps {
  open: boolean;
  entities: Entity[];
  onResolve: (decisions: EntityDecision[]) => void;
  onCancel?: () => void;
}

export function EntityWizard({ open, entities, onResolve, onCancel }: EntityWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [decisions, setDecisions] = useState<Map<string, EntityDecision>>(new Map());
  const [editingEntity, setEditingEntity] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  const totalSteps = entities.length;
  const currentEntity = entities[currentStep];

  const handleApprove = () => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(currentEntity.id, {
        entityId: currentEntity.id,
        action: 'approve',
      });
      return next;
    });
    moveToNextStep();
  };

  const handleReject = () => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(currentEntity.id, {
        entityId: currentEntity.id,
        action: 'reject',
      });
      return next;
    });
    moveToNextStep();
  };

  const handleCorrect = (newName: string) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(currentEntity.id, {
        entityId: currentEntity.id,
        action: 'correct',
        newName,
      });
      return next;
    });
    setEditingEntity(null);
    setEditedName('');
    moveToNextStep();
  };

  const handleMerge = (targetEntityId: string) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(currentEntity.id, {
        entityId: currentEntity.id,
        action: 'merge',
        mergeWith: targetEntityId,
      });
      return next;
    });
    moveToNextStep();
  };

  const moveToNextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Finished reviewing all entities
      submitDecisions();
    }
  };

  const moveToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const submitDecisions = () => {
    onResolve(Array.from(decisions.values()));
  };

  const startEdit = () => {
    setEditingEntity(currentEntity.id);
    setEditedName(currentEntity.name);
  };

  const cancelEdit = () => {
    setEditingEntity(null);
    setEditedName('');
  };

  const saveEdit = () => {
    if (editedName.trim()) {
      handleCorrect(editedName.trim());
    }
  };

  const getDecisionForEntity = (entityId: string) => {
    return decisions.get(entityId);
  };

  const availableMergeTargets = entities.filter(
    (e) => e.id !== currentEntity?.id && e.type === currentEntity?.type
  );

  if (!currentEntity) {
    return null;
  }

  const currentDecision = getDecisionForEntity(currentEntity.id);
  const isEditing = editingEntity === currentEntity.id;

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Entities</DialogTitle>
          <DialogDescription>
            Review and approve extracted entities. You can correct names, merge duplicates, or
            reject entities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress indicator */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Entity {currentStep + 1} of {totalSteps}
            </span>
            <span className="text-xs">
              {Math.round(((currentStep + 1) / totalSteps) * 100)}% complete
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>

          {/* Entity card */}
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  {currentEntity.type}
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="text-lg font-semibold bg-background border border-border rounded px-2 py-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveEdit();
                      } else if (e.key === 'Escape') {
                        cancelEdit();
                      }
                    }}
                  />
                ) : (
                  <h3 className="text-lg font-semibold text-foreground">{currentEntity.name}</h3>
                )}
              </div>
              {currentDecision && (
                <div className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  {currentDecision.action}
                </div>
              )}
            </div>

            {/* Edit mode actions */}
            {isEditing && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={saveEdit}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Normal mode actions */}
            {!isEditing && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={handleApprove}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Correct
                </button>
                {availableMergeTargets.length > 0 && (
                  <div className="relative group">
                    <button className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
                      <GitMerge className="w-4 h-4" />
                      Merge
                    </button>
                    <div className="absolute left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="p-2 text-xs text-muted-foreground border-b border-border">
                        Merge with:
                      </div>
                      {availableMergeTargets.map((target) => (
                        <button
                          key={target.id}
                          onClick={() => handleMerge(target.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        >
                          {target.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Entity list */}
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
              All Entities
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {entities.map((entity, idx) => {
                const decision = getDecisionForEntity(entity.id);
                const isCurrent = idx === currentStep;
                return (
                  <div
                    key={entity.id}
                    className={`flex items-center justify-between px-2 py-1 rounded text-sm ${
                      isCurrent ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="truncate">{entity.name}</span>
                    {decision && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          decision.action === 'approve'
                            ? 'bg-green-500/10 text-green-600'
                            : decision.action === 'reject'
                              ? 'bg-red-500/10 text-red-600'
                              : 'bg-blue-500/10 text-blue-600'
                        }`}
                      >
                        {decision.action}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {currentStep > 0 && (
              <Button variant="outline" onClick={moveToPreviousStep}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {currentStep < totalSteps - 1 ? (
              <Button onClick={moveToNextStep}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={submitDecisions}>
                <CheckCircle className="w-4 h-4 mr-1" />
                Submit All
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
