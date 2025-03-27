const { execSync } = require('child_process');

console.log('Cleaning up GitHub Pages configuration...');

try {
  // Check if gh-pages branch exists locally
  const localBranches = execSync('git branch').toString();
  if (localBranches.includes('gh-pages')) {
    console.log('Removing local gh-pages branch...');
    execSync('git branch -D gh-pages');
    console.log('Local gh-pages branch removed.');
  } else {
    console.log('No local gh-pages branch found.');
  }

  // Check if gh-pages branch exists remotely
  const remoteBranches = execSync('git branch -a').toString();
  if (remoteBranches.includes('origin/gh-pages')) {
    console.log('Removing remote gh-pages branch...');
    execSync('git push origin --delete gh-pages');
    console.log('Remote gh-pages branch removed.');
  } else {
    console.log('No remote gh-pages branch found.');
  }

  console.log('Cleanup completed successfully.');
} catch (error) {
  console.error('Error during cleanup:', error.message);
  console.error('You may need to manually delete the gh-pages branch.');
  console.error('To delete locally: git branch -D gh-pages');
  console.error('To delete remotely: git push origin --delete gh-pages');
} 