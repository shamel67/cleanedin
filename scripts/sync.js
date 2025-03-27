const fs = require('fs');
const pkg = require('../package.json');
const manifestPath = './src/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Updated manifest.json version to ${pkg.version}`);
} else {
  console.log('Versions are already in sync.');
}