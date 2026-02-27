/**
 * Signal Intent Types
 *
 * Classifies the intent behind an incoming signal to enable differentiated
 * routing within the signal intake pipeline.
 *
 * Intent Taxonomy:
 *
 *   work_order     - A concrete task or feature request to be implemented.
 *                    Routes through the Ops (PM Agent) pipeline for planning
 *                    and execution. Example: "Build the login page."
 *
 *   idea           - A vague or exploratory concept that needs PM refinement
 *                    before becoming actionable. Routes through the PM Agent
 *                    for research, PRD generation, and decomposition.
 *                    Example: "We should make auth easier somehow."
 *
 *   feedback       - Reaction or commentary on existing work (not a new task).
 *                    Routes through the Ops pipeline tagged as feedback context.
 *                    Example: "The new dashboard is too slow."
 *
 *   conversational - A casual message, question, or social exchange that does
 *                    not map to any work item. Routes to GTM or is acknowledged
 *                    without creating a feature. Example: "GM team!"
 *
 *   interrupt      - An urgent signal that requires immediate human attention.
 *                    Bypasses the PM pipeline entirely. Creates a HITL form
 *                    directly so a human can respond and triage.
 *                    Example: "Production is down, need someone NOW."
 */
export type SignalIntent = 'work_order' | 'feedback' | 'conversational' | 'idea' | 'interrupt';
