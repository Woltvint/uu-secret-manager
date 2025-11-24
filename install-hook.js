#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function installHook() {
  // Check if we're in a git repository
  if (!fs.existsSync('.git')) {
    console.error(`${RED}Error: Not a git repository${RESET}`);
    console.error(`Run this command from the root of your git repository.`);
    process.exit(1);
  }

  // Create .git/hooks directory if it doesn't exist
  const hooksDir = '.git/hooks';
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // Find the pre-commit hook source
  const hookSource = path.join(__dirname, '.githooks', 'pre-commit');
  const hookDest = path.join(hooksDir, 'pre-commit');

  if (!fs.existsSync(hookSource)) {
    console.error(`${RED}Error: Hook source not found at ${hookSource}${RESET}`);
    process.exit(1);
  }

  // Check if hook already exists
  if (fs.existsSync(hookDest)) {
    const existingContent = fs.readFileSync(hookDest, 'utf8');
    if (existingContent.includes('uu-secret-manager')) {
      console.log(`${YELLOW}ℹ️  Pre-commit hook already installed${RESET}`);
      process.exit(0);
    }
    
    // Backup existing hook
    const backupPath = hookDest + '.backup';
    fs.copyFileSync(hookDest, backupPath);
    console.log(`${YELLOW}⚠️  Existing pre-commit hook backed up to: ${backupPath}${RESET}`);
  }

  // Copy and make executable
  fs.copyFileSync(hookSource, hookDest);
  fs.chmodSync(hookDest, 0o755);

  console.log(`${GREEN}✅ Git pre-commit hook installed successfully!${RESET}`);
  console.log(`\n${GREEN}The hook will now check for potential secrets before each commit.${RESET}`);
  console.log(`${YELLOW}To bypass the hook (not recommended), use: git commit --no-verify${RESET}\n`);
}

installHook();
