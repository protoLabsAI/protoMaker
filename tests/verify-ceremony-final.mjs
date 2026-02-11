#!/usr/bin/env node
import * as types from '../libs/types/dist/index.js';

console.log('Testing ceremony settings types and constants...\n');

// Test 1: Verify DEFAULT_CEREMONY_SETTINGS exists and has correct structure
if (!types.DEFAULT_CEREMONY_SETTINGS) {
  console.error('❌ DEFAULT_CEREMONY_SETTINGS is not exported');
  process.exit(1);
}
console.log('✅ DEFAULT_CEREMONY_SETTINGS exists');

const settings = types.DEFAULT_CEREMONY_SETTINGS;
console.log('   Structure:', JSON.stringify(settings, null, 2));

const requiredProps = ['enabled', 'enableMilestoneUpdates', 'enableProjectRetros'];
for (const prop of requiredProps) {
  if (!(prop in settings)) {
    console.error(`❌ Missing required property: ${prop}`);
    process.exit(1);
  }
  console.log(`✅ Has property: ${prop} = ${JSON.stringify(settings[prop])}`);
}

// Test 2: Verify DEFAULT_PROJECT_SETTINGS exists (ceremonySettings is optional)
if (!types.DEFAULT_PROJECT_SETTINGS) {
  console.error('❌ DEFAULT_PROJECT_SETTINGS is not exported');
  process.exit(1);
}
console.log('✅ DEFAULT_PROJECT_SETTINGS exists');

// Test 3: Verify DEFAULT_PHASE_MODELS includes ceremonyModel
if (!types.DEFAULT_PHASE_MODELS) {
  console.error('❌ DEFAULT_PHASE_MODELS is not exported');
  process.exit(1);
}
console.log('✅ DEFAULT_PHASE_MODELS exists');

if (!('ceremonyModel' in types.DEFAULT_PHASE_MODELS)) {
  console.error('❌ DEFAULT_PHASE_MODELS missing ceremonyModel field');
  process.exit(1);
}

const ceremonyModel = types.DEFAULT_PHASE_MODELS.ceremonyModel;
console.log(`✅ DEFAULT_PHASE_MODELS has ceremonyModel`);
console.log(`   Model: ${JSON.stringify(ceremonyModel)}`);

if (!ceremonyModel.model) {
  console.error('❌ ceremonyModel missing model field');
  process.exit(1);
}
console.log(`✅ ceremonyModel.model = ${ceremonyModel.model}`);

// Test 4: Verify TypeScript types exist by checking the type definition file
console.log('\n✅ Checking TypeScript type definitions...');
import { readFileSync } from 'fs';
const typesDef = readFileSync('libs/types/dist/settings.d.ts', 'utf-8');

const checks = [
  { name: 'CeremonySettings interface', pattern: /interface CeremonySettings/ },
  { name: 'enabled field in CeremonySettings', pattern: /enabled:\s*boolean/ },
  { name: 'discordChannelId field in CeremonySettings', pattern: /discordChannelId\?:\s*string/ },
  { name: 'enableMilestoneUpdates field', pattern: /enableMilestoneUpdates\?:\s*boolean/ },
  { name: 'enableProjectRetros field', pattern: /enableProjectRetros\?:\s*boolean/ },
  { name: 'retroModel field', pattern: /retroModel\?:\s*PhaseModelEntry/ },
  { name: 'ProjectSettings has ceremonySettings', pattern: /ceremonySettings\?:\s*CeremonySettings/ },
  { name: 'PhaseModelConfig has ceremonyModel', pattern: /ceremonyModel:\s*PhaseModelEntry/ },
];

for (const check of checks) {
  if (!check.pattern.test(typesDef)) {
    console.error(`❌ ${check.name} not found in type definitions`);
    process.exit(1);
  }
  console.log(`✅ ${check.name} exists in type definitions`);
}

console.log('\n🎉 All ceremony settings types and constants verified successfully!');
console.log('\nSummary:');
console.log('- CeremonySettings interface defined with all required fields');
console.log('- DEFAULT_CEREMONY_SETTINGS constant exported');
console.log('- ProjectSettings includes optional ceremonySettings field');
console.log('- PhaseModelConfig includes ceremonyModel field');
console.log('- DEFAULT_PHASE_MODELS has ceremonyModel configured');
