#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command();
const path = require('path');
const fs = require('fs');
const vault = require('./vault');
const { v4: uuidv4 } = require('uuid');
const replace = require('./replace');

function findGitRoot(startPath) {
  let currentPath = path.resolve(startPath || '.');
  
  while (currentPath !== path.parse(currentPath).root) {
    if (fs.existsSync(path.join(currentPath, '.git'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  
  return null;
}

function getSecretsPath(repoPath) {
  const gitRoot = findGitRoot(repoPath || '.');
  if (!gitRoot) {
    console.error('Error: Not in a git repository');
    console.error('This tool is designed to work within git repositories.');
    console.error('Initialize a git repo with: git init');
    process.exit(1);
  }
  return path.join(gitRoot, 'uu-secret-manager.json');
}

program
  .name('uu-secret-manager')
  .description('CLI to manage secrets in files and folders')
  .version('1.0.0')
  .option('-r, --repo <path>', 'Path to git repository (default: current directory)', '.')
  .option('-p, --password <password>', 'Vault password (not recommended for security)')
  .option('-f, --password-file <path>', 'Path to file containing vault password')
  .addHelpText('after', `
Password Options (in priority order):
  1. --password-file: Read password from a file
  2. --password: Provide password directly (not recommended)
  3. stdin: Pipe password via stdin (e.g., echo "pass" | usm list)
  4. prompt: Interactive password prompt (default)

Examples:
  $ echo "mypassword" | usm add "my_secret" "Database password"
  $ usm add "api_key_123"  # Without description
  $ usm -f ~/.vault-pass list
  $ usm -p mypassword replace
`);

program
  .command('list')
  .description('List all secrets in the store')
  .action(async (options, command) => {
    try {
      const globalOpts = command.parent.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      const secrets = JSON.parse(decrypted);
      console.log('Secrets:');
      console.log('━'.repeat(80));
      Object.entries(secrets).forEach(([uuid, data]) => {
        // Handle both old format (string) and new format (object)
        const secret = typeof data === 'string' ? data : data.secret;
        const description = typeof data === 'object' ? data.description : '';
        const created = typeof data === 'object' ? data.created : '';
        
        console.log(`\nUUID: ${uuid}`);
        console.log(`Secret: ${secret}`);
        if (description) {
          console.log(`Description: ${description}`);
        }
        if (created) {
          console.log(`Created: ${new Date(created).toLocaleString()}`);
        }
        console.log(`Placeholder: <!secret_${uuid}!>`);
      });
      console.log('\n' + '━'.repeat(80));
      console.log(`Total secrets: ${Object.keys(secrets).length}`);
    } catch (err) {
      console.error('Error listing secrets:', err.message);
      process.exit(1);
    }
  });

program
  .command('add <secret> [description]')
  .description('Add a secret to the store with optional description')
  .action(async (secret, description, options, command) => {
    try {
      const globalOpts = command.parent.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const password = await vault.getPassword(globalOpts);
      let secrets = {};
      try {
        const decrypted = await vault.decryptVaultFile(secretsPath, password);
        secrets = JSON.parse(decrypted);
      } catch (err) {
        // If file doesn't exist or is empty, start fresh
        secrets = {};
      }
      
      // Check for duplicate secret
      for (const [existingUuid, data] of Object.entries(secrets)) {
        const existingSecret = typeof data === 'string' ? data : data.secret;
        if (existingSecret === secret) {
          console.error(`Error: Secret already exists with UUID: ${existingUuid}`);
          console.error(`Use the existing placeholder: <!secret_${existingUuid}!>`);
          process.exit(1);
        }
      }
      
      const uuid = uuidv4();
      secrets[uuid] = {
        secret: secret,
        description: description || '',
        created: new Date().toISOString()
      };
      await vault.encryptVaultFile(secretsPath, password, JSON.stringify(secrets, null, 2));
      console.log(`Secret added with placeholder: <!secret_${uuid}!>`);
      if (description) {
        console.log(`Description: ${description}`);
      }
    } catch (err) {
      console.error('Error adding secret:', err.message);
      process.exit(1);
    }
  });

program
  .command('replace [path]')
  .description('Replace secrets in files with placeholders (default: entire repo)')
  .action(async (targetPath, options, command) => {
    try {
      const globalOpts = command.parent.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'uu-secret-manager.json');
      
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      const secrets = JSON.parse(decrypted);
      let replacedFiles = 0;
      const stats = fs.statSync(searchPath);
      if (stats.isFile()) {
        if (replace.replaceSecretsInFile(searchPath, secrets)) {
          console.log(`Replaced secrets in: ${searchPath}`);
          replacedFiles++;
        }
      } else {
        replace.walkDir(searchPath, (filePath) => {
          // Skip the secrets file itself
          if (filePath === secretsPath) return;
          if (replace.replaceSecretsInFile(filePath, secrets)) {
            console.log(`Replaced secrets in: ${filePath}`);
            replacedFiles++;
          }
        });
      }
      if (replacedFiles === 0) {
        console.log('No secrets replaced.');
      }
    } catch (err) {
      console.error('Error replacing secrets:', err.message);
      process.exit(1);
    }
  });

program
  .command('reverse [path]')
  .description('Reverse placeholders back to secrets in files (default: entire repo)')
  .action(async (targetPath, options, command) => {
    try {
      const globalOpts = command.parent.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'uu-secret-manager.json');
      
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      const secrets = JSON.parse(decrypted);
      let reversedFiles = 0;
      const stats = fs.statSync(searchPath);
      if (stats.isFile()) {
        if (replace.reverseSecretsInFile(searchPath, secrets)) {
          console.log(`Reversed placeholders in: ${searchPath}`);
          reversedFiles++;
        }
      } else {
        replace.walkDir(searchPath, (filePath) => {
          // Skip the secrets file itself
          if (filePath === secretsPath) return;
          if (replace.reverseSecretsInFile(filePath, secrets)) {
            console.log(`Reversed placeholders in: ${filePath}`);
            reversedFiles++;
          }
        });
      }
      if (reversedFiles === 0) {
        console.log('No placeholders reversed.');
      }
    } catch (err) {
      console.error('Error reversing placeholders:', err.message);
      process.exit(1);
    }
  });

program
  .command('install-hook')
  .description('Install git pre-commit hook to check for secrets')
  .action(() => {
    try {
      require('./install-hook.js');
    } catch (err) {
      console.error('Error installing hook:', err.message);
    }
  });

program
  .command('remove-hook')
  .description('Remove git pre-commit hook')
  .action(() => {
    const fs = require('fs');
    const GREEN = '\x1b[32m';
    const RED = '\x1b[31m';
    const YELLOW = '\x1b[33m';
    const RESET = '\x1b[0m';
    
    const hookPath = '.git/hooks/pre-commit';
    
    if (!fs.existsSync('.git')) {
      console.error(`${RED}Error: Not a git repository${RESET}`);
      process.exit(1);
    }
    
    if (!fs.existsSync(hookPath)) {
      console.log(`${YELLOW}ℹ️  No pre-commit hook found${RESET}`);
      process.exit(0);
    }
    
    const hookContent = fs.readFileSync(hookPath, 'utf8');
    if (!hookContent.includes('uu-secret-manager')) {
      console.log(`${YELLOW}ℹ️  Pre-commit hook is not from uu-secret-manager${RESET}`);
      process.exit(0);
    }
    
    // Restore backup if it exists
    const backupPath = hookPath + '.backup';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, hookPath);
      fs.unlinkSync(backupPath);
      console.log(`${GREEN}✅ Pre-commit hook removed and backup restored${RESET}`);
    } else {
      fs.unlinkSync(hookPath);
      console.log(`${GREEN}✅ Pre-commit hook removed${RESET}`);
    }
  });

program.parse(process.argv);
