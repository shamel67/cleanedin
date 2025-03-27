const { execSync } = require('child_process');
const readline = require('readline');
const pkg = require('../package.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter commit message: ', (msg) => {
  try {
    const versionTag = `v${pkg.version}`;

    execSync('git add .', { stdio: 'inherit' });
    execSync(`git commit -m "${msg}"`, { stdio: 'inherit' });

    // Create or update version tag
    execSync(`git tag -f ${versionTag}`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    execSync(`git push origin ${versionTag} --force`, { stdio: 'inherit' });

    console.log(`✅ Pushed with tag ${versionTag}`);
  } catch (err) {
    console.error('❌ Git push failed:', err.message);
  } finally {
    rl.close();
  }
});