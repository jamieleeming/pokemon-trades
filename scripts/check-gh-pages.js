const fs = require('fs');
const path = require('path');
const https = require('https');

console.log('GitHub Pages Configuration Check');
console.log('================================');

// Step 1: Check if the gh-pages branch exists locally
try {
  const result = require('child_process').execSync('git branch -a', { encoding: 'utf8' });
  console.log('\nGit branches:');
  console.log(result);
  
  const hasGhPages = result.includes('gh-pages') || result.includes('origin/gh-pages');
  console.log(`gh-pages branch exists: ${hasGhPages ? 'Yes' : 'No'}`);
} catch (error) {
  console.error('Error checking git branches:', error.message);
}

// Step 2: Check the structure of the build directory
console.log('\nBuild Directory Check:');
if (fs.existsSync('build')) {
  const files = fs.readdirSync('build');
  console.log('Files in build directory:');
  files.forEach(file => {
    const stats = fs.statSync(path.join('build', file));
    console.log(`- ${file} ${stats.isDirectory() ? '(directory)' : `(${stats.size} bytes)`}`);
  });
  
  // Check for critical files
  const criticalFiles = ['index.html', '.nojekyll', 'CNAME'];
  console.log('\nChecking for critical files:');
  criticalFiles.forEach(file => {
    if (files.includes(file)) {
      console.log(`✓ ${file} exists`);
    } else {
      console.log(`✗ ${file} is missing!`);
    }
  });
} else {
  console.log('Build directory does not exist!');
}

// Step 3: Check the GitHub repository settings
const owner = 'jamieleeming'; // Replace with your GitHub username
const repo = 'pokemon-trades'; // Replace with your repository name

console.log('\nChecking GitHub Pages settings (public info only):');
console.log(`Repository: ${owner}/${repo}`);

// Make a request to the GitHub API
const options = {
  hostname: 'api.github.com',
  path: `/repos/${owner}/${repo}/pages`,
  method: 'GET',
  headers: {
    'User-Agent': 'GitHub-Pages-Checker'
  }
};

const req = https.request(options, res => {
  let data = '';
  
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`API Response Status: ${res.statusCode}`);
    
    if (res.statusCode === 200) {
      try {
        const pagesInfo = JSON.parse(data);
        console.log('GitHub Pages Info:');
        console.log(`- URL: ${pagesInfo.html_url}`);
        console.log(`- Status: ${pagesInfo.status}`);
        console.log(`- HTTPS: ${pagesInfo.https_enforced ? 'Enforced' : 'Not enforced'}`);
        console.log(`- Custom Domain: ${pagesInfo.custom_domain || 'None'}`);
        console.log(`- Source: ${pagesInfo.source.branch} branch, ${pagesInfo.source.path} directory`);
      } catch (error) {
        console.error('Error parsing GitHub API response:', error.message);
      }
    } else {
      console.log('Could not fetch GitHub Pages settings. This often requires authentication.');
      console.log('Please check your GitHub repository settings manually.');
    }
    
    console.log('\nSuggestions:');
    console.log('1. Ensure your GitHub repository settings have Pages enabled');
    console.log('2. If using GitHub Actions for deployment, check that the workflow has the correct permissions');
    console.log('3. If seeing the README instead of your app, make sure the workflow is deploying to the correct branch');
    console.log('4. For custom domains, verify the DNS settings and CNAME file are correct');
  });
});

req.on('error', error => {
  console.error('Error making request to GitHub API:', error.message);
});

req.end(); 