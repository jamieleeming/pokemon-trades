const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

console.log(`${colors.blue}Starting enhanced deployment process...${colors.reset}`);

// Step 1: Ensure the build directory is clean
console.log(`\n${colors.yellow}Step 1: Cleaning build directory...${colors.reset}`);
try {
  if (fs.existsSync('build')) {
    console.log('Removing existing build directory...');
    fs.rmSync('build', { recursive: true, force: true });
  }
  console.log(`${colors.green}✓ Build directory cleaned${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error cleaning build directory:${colors.reset}`, error);
  process.exit(1);
}

// Step 2: Build the project
console.log(`\n${colors.yellow}Step 2: Building the project...${colors.reset}`);
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log(`${colors.green}✓ Build completed successfully${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error building the project${colors.reset}`);
  process.exit(1);
}

// Step 3: Copy necessary files to build directory
console.log(`\n${colors.yellow}Step 3: Copying necessary files to build directory...${colors.reset}`);
try {
  // Ensure .nojekyll file exists
  fs.writeFileSync('build/.nojekyll', '');
  console.log(`${colors.green}✓ Created .nojekyll file${colors.reset}`);
  
  // Copy CNAME file
  fs.copyFileSync('public/CNAME', 'build/CNAME');
  console.log(`${colors.green}✓ Copied CNAME file${colors.reset}`);
  
  // Copy 404.html
  fs.copyFileSync('public/404.html', 'build/404.html');
  console.log(`${colors.green}✓ Copied 404.html file${colors.reset}`);
  
  // Copy other important files
  fs.copyFileSync('public/robots.txt', 'build/robots.txt');
  fs.copyFileSync('public/sitemap.xml', 'build/sitemap.xml');
  console.log(`${colors.green}✓ Copied additional files${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error copying files:${colors.reset}`, error);
  process.exit(1);
}

// Step 4: Validate build output
console.log(`\n${colors.yellow}Step 4: Validating build output...${colors.reset}`);
try {
  require('./check-build.js');
} catch (error) {
  console.error(`${colors.red}Error validating build:${colors.reset}`, error);
  process.exit(1);
}

// Step 5: Deploy to GitHub Pages
console.log(`\n${colors.yellow}Step 5: Deploying to GitHub Pages...${colors.reset}`);
try {
  execSync('npx gh-pages -d build --dotfiles', { stdio: 'inherit' });
  console.log(`${colors.green}✓ Deployment completed successfully${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error deploying to GitHub Pages${colors.reset}`);
  process.exit(1);
}

console.log(`\n${colors.magenta}Deployment process complete!${colors.reset}`);
console.log(`\n${colors.blue}Please wait a few minutes for the changes to propagate.${colors.reset}`);
console.log(`${colors.blue}Your site should be available at https://pocket-trades.com${colors.reset}`); 