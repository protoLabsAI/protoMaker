#!/usr/bin/env node
import * as types from '../libs/types/dist/index.js';

console.log('Testing ceremony settings types and constants...\n');

// Test 1: Verify DEFAULT_CEREMONY_SETTINGS exists
if (!types.DEFAULT_CEREMONY_SETTINGS) {
  console.error('❌ DEFAULT_CEREMONY_SETTINGS is not exported');
  console.log('Available exports:', Object.keys(types).filter(k => k.includes('CEREMONY')));
  process.exit(1);
}
console.log('✅ DEFAULT_CEREMONY_SETTINGS exists');

// Test 2: Verify structure
const settings = types.DEFAULT_CEREMONY_SETTINGS;
console.log('Settings:', JSON.stringify(settings, null, 2));

const requiredProps = ['enabled', 'enableMilestoneUpdates', 'enableProjectRetros'];

for (const prop of requiredProps) {
  if (!(prop in settings)) {
    console.error(`❌ Missing required property: ${prop}`);
    process.exit(1);
  }
  console.log(`✅ Has property: ${prop} = ${JSON.stringify(settings[prop])}`);
}

// Test 3: Verify DEFAULT_PROJECT_SETTINGS includes ceremonySettings
if (!types.DEFAULT_PROJECT_SETTINGS) {
  console.error('❌ DEFAULT_PROJECT_SETTINGS is not exported');
  process.exit(1);
}
console.log('✅ DEFAULT_PROJECT_SETTINGS exists');

if (!('ceremonySettings' in types.DEFAULT_PROJECT_SETTINGS)) {
  console.error('❌ DEFAULT_PROJECT_SETTINGS missing ceremonySettings field');
  process.exit(1);
}
console.log('✅ DEFAULT_PROJECT_SETTINGS has ceremonySettings field');

// Test 4: Verify DEFAULT_PHASE_MODELS includes ceremonyModel
if (!types.DEFAULT_PHASE_MODELS) {
  console.error('❌ DEFAULT_PHASE_MODELS is not exported');
  process.exit(1);
}
console.log('✅ DEFAULT_PHASE_MODELS exists');

if (!('ceremonyModel' in types.DEFAULT_PHASE_MODELS)) {
  console.error('❌ DEFAULT_PHASE_MODELS missing ceremonyModel field');
  process.exit(1);
}
console.log(`✅ DEFAULT_PHASE_MODELS has ceremonyModel = ${JSON.stringify(types.DEFAULT_PHASE_MODELS.ceremonyModel)}`);

// Test 5: Verify ceremonyModel structure
const ceremonyModel = types.DEFAULT_PHASE_MODELS.ceremonyModel;
if (!ceremonyModel.model) {
  console.error('❌ ceremonyModel missing model field');
  process.exit(1);
}
console.log(`✅ ceremonyModel.model = ${ceremonyModel.model}`);

console.log('\n🎉 All ceremony settings types and constants verified successfully!');
