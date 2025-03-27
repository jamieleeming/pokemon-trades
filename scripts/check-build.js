const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');

console.log('Checking build directory contents:');
console.log('----------------------------------');

// Check if build directory exists
if (!fs.existsSync(buildDir)) {
  console.error('Build directory does not exist!');
  process.exit(1);
}

// List all files in the build directory
const files = fs.readdirSync(buildDir);
console.log('Files in build directory:');
files.forEach(file => {
  const stats = fs.statSync(path.join(buildDir, file));
  console.log(`- ${file} ${stats.isDirectory() ? '(directory)' : `(${stats.size} bytes)`}`);
});

// Check for critical files
const criticalFiles = ['index.html', '.nojekyll', 'CNAME'];
console.log('\nChecking for critical files:');
criticalFiles.forEach(file => {
  if (files.includes(file)) {
    console.log(`✓ ${file} exists`);
  } else {
    console.error(`✗ ${file} is missing!`);
  }
});

// Check content of index.html
const indexPath = path.join(buildDir, 'index.html');
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf8');
  console.log('\nindex.html content length:', content.length);
  console.log('index.html first 200 characters:', content.substring(0, 200) + '...');
} else {
  console.error('Cannot check index.html content because the file does not exist!');
}

console.log('\nBuild directory check complete'); 