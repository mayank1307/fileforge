#!/usr/bin/env node
// Writes extension/background/buildInfo.js from the extension files. Run it after changing the extension: npm run build:id
import { writeFileSync } from 'fs';
import { BUILD_INFO_PATH, computeExtensionBuildId, renderBuildInfo } from '../extensionBuild.js';

const buildId = computeExtensionBuildId();
writeFileSync(BUILD_INFO_PATH, renderBuildInfo(buildId));
console.log(`Wrote ${BUILD_INFO_PATH} (build ${buildId})`);
