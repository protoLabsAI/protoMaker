import { test, expect } from '@playwright/test';

test('verify ceremony settings types and constants', async () => {
  // Dynamic import to ensure fresh module load
  const typesModule = await import('@automaker/types');

  // Verify CeremonySettings interface exists (check constant shape)
  expect(typesModule.DEFAULT_CEREMONY_SETTINGS).toBeDefined();
  expect(typeof typesModule.DEFAULT_CEREMONY_SETTINGS).toBe('object');

  // Verify structure of DEFAULT_CEREMONY_SETTINGS
  const ceremonySetting = typesModule.DEFAULT_CEREMONY_SETTINGS;
  expect(ceremonySetting).toHaveProperty('enabled');
  expect(ceremonySetting).toHaveProperty('discordChannelId');
  expect(ceremonySetting).toHaveProperty('enableMilestoneUpdates');
  expect(ceremonySetting).toHaveProperty('enableProjectRetros');
  expect(ceremonySetting).toHaveProperty('retroModel');

  // Verify types
  expect(typeof ceremonySetting.enabled).toBe('boolean');
  expect(typeof ceremonySetting.discordChannelId).toBe('string');
  expect(typeof ceremonySetting.enableMilestoneUpdates).toBe('boolean');
  expect(typeof ceremonySetting.enableProjectRetros).toBe('boolean');
  expect(typeof ceremonySetting.retroModel).toBe('object');

  // Verify retroModel structure (PhaseModelEntry)
  expect(ceremonySetting.retroModel).toHaveProperty('modelId');
  expect(typeof ceremonySetting.retroModel.modelId).toBe('string');

  // Verify DEFAULT_PROJECT_SETTINGS includes ceremonySettings
  expect(typesModule.DEFAULT_PROJECT_SETTINGS).toBeDefined();
  expect(typesModule.DEFAULT_PROJECT_SETTINGS).toHaveProperty('ceremonySettings');

  // Verify PhaseModelConfig includes ceremonyModel (via DEFAULT_PHASE_MODELS)
  expect(typesModule.DEFAULT_PHASE_MODELS).toBeDefined();
  expect(typesModule.DEFAULT_PHASE_MODELS).toHaveProperty('ceremonyModel');
  expect(typeof typesModule.DEFAULT_PHASE_MODELS.ceremonyModel).toBe('object');
  expect(typesModule.DEFAULT_PHASE_MODELS.ceremonyModel).toHaveProperty('modelId');

  console.log('✅ All ceremony settings types and constants verified successfully');
});
