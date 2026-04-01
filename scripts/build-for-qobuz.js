// Build smtc_native.node for the Qobuz Electron version.
// Usage: node scripts/build-for-qobuz.js [qobuz-dir]

var path = require('path');
var fs = require('fs');
var child_process = require('child_process');
var qobuz = require('../lib/qobuz-paths');

var qobuzDir = process.argv[2] || qobuz.defaultQobuzDir();
var appVersion = qobuz.findLatestAppVersion(qobuzDir);

if (!appVersion) {
  console.error('Qobuz not found at: ' + qobuzDir);
  process.exit(1);
}

console.log('Found Qobuz: ' + appVersion);

var electronVersion = qobuz.detectElectronVersion(qobuzDir, appVersion);
if (!electronVersion) {
  console.error('Could not detect Electron version.');
  console.error('Manual fallback: npx @electron/rebuild -v <electron-version>');
  process.exit(1);
}

console.log('Electron version: ' + electronVersion);
console.log('\nBuilding native addon...');

var moduleDir = path.resolve(__dirname, '..');
var rebuildCmd = 'npx @electron/rebuild --version ' + electronVersion
  + ' --module-dir ' + JSON.stringify(moduleDir);

console.log('> ' + rebuildCmd + '\n');

try {
  child_process.execSync(rebuildCmd, {
    cwd: moduleDir,
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      npm_config_runtime: 'electron',
      npm_config_target: electronVersion,
      npm_config_disturl: 'https://electronjs.org/headers'
    })
  });
} catch (e) {
  console.error('\nBuild failed. Required:');
  console.error('  1. Visual Studio Build Tools (C++ workload)');
  console.error('  2. Windows SDK 10.0.19041.0+');
  console.error('\nhttps://visualstudio.microsoft.com/visual-cpp-build-tools/');
  process.exit(1);
}

var outputPath = path.join(moduleDir, 'build', 'Release', 'smtc_native.node');
if (fs.existsSync(outputPath)) {
  console.log('\nBuild successful: ' + outputPath);
  console.log('Size: ' + (fs.statSync(outputPath).size / 1024).toFixed(0) + ' KB');
  console.log('\nNext: node patch.js');
} else {
  console.error('Build completed but smtc_native.node not found.');
  process.exit(1);
}
