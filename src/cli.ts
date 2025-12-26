#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import * as vault from './vault';
import { v4 as uuidv4 } from 'uuid';
import * as encrypt from './encrypt';
import { SecretData, SecretsMap, SecretsStore, generatePlaceholder, findSecretByName, nameExists } from './encrypt';

const program = new Command();

/**
 * Finds the root directory of a git repository
 * @param startPath - Starting path to search from
 * @returns Path to git root or null if not found
 */
function findGitRoot(startPath?: string): string | null {
  let currentPath = path.resolve(startPath || '.');
  
  while (currentPath !== path.parse(currentPath).root) {
    if (fs.existsSync(path.join(currentPath, '.git'))) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  
  return null;
}

/**
 * Gets the path to the secrets file in the git repository
 * @param repoPath - Path to the repository
 * @returns Path to the secrets file
 */
function getSecretsPath(repoPath?: string): string {
  const gitRoot = findGitRoot(repoPath || '.');
  if (!gitRoot) {
    console.error('Error: Not in a git repository');
    console.error('This tool is designed to work within git repositories.');
    console.error('Initialize a git repo with: git init');
    process.exit(1);
  }
  return path.join(gitRoot, 'repo-secret-manager.json');
}

program
  .name('repo-secret-manager')
  .description('CLI to manage secrets in files and folders')
  .version('2.1.0-DEV')
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
  $ echo "mypassword" | rsm add "db_password" "my_secret" "Database password"
  $ rsm add "api_key_123"  # Without name (auto-generated)
  $ rsm add "db_password" "my_secret"  # With name, without description
  $ rsm -f ~/.vault-pass list
  $ rsm -p mypassword encrypt
`);

program
  .command('list')
  .description('List all secrets in the store')
  .action(async (_options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      let store: SecretsStore;
      let secrets: SecretsMap;
      
      try {
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          secrets = store as any;
        } else {
          secrets = store.secrets;
        }
      } catch (err) {
        console.error('Error: Could not parse secrets file');
        process.exit(1);
      }
      
      console.log('Secrets:');
      console.log('━'.repeat(80));
      
      Object.entries(secrets).forEach(([id, data]) => {
        // Handle both old format (string) and new format (object)
        const secret = typeof data === 'string' ? data : data.secret;
        const description = typeof data === 'object' ? data.description : '';
        const created = typeof data === 'object' ? data.created : '';
        const name = typeof data === 'object' ? data.name : undefined;
        const placeholder = generatePlaceholder(id, data);
        
        console.log(`\nUUID: ${id}`);
        if (name) {
          console.log(`Name: ${name}`);
        }
        console.log(`Secret: ${secret}`);
        if (description) {
          console.log(`Description: ${description}`);
        }
        if (created) {
          console.log(`Created: ${new Date(created).toLocaleString()}`);
        }
        console.log(`Placeholder: ${placeholder}`);
      });
      
      console.log('\n' + '━'.repeat(80));
      console.log(`Total secrets: ${Object.keys(secrets).length}`);
    } catch (err) {
      console.error('Error listing secrets:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('export <csvPath>')
  .description('Export secrets to a CSV file')
  .action(async (csvPath: string, _options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      let store: SecretsStore;
      let secrets: SecretsMap;
      
      try {
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          secrets = store as any;
        } else {
          secrets = store.secrets;
        }
      } catch (err) {
        console.error('Error: Could not parse secrets file');
        process.exit(1);
      }
      
      // Build CSV content
      const csvLines: string[] = ['UUID,Name,Secret,Description,Created,Placeholder'];
      
      Object.entries(secrets).forEach(([id, data]) => {
        const secret = typeof data === 'string' ? data : data.secret;
        const description = typeof data === 'object' ? data.description || '' : '';
        const created = typeof data === 'object' ? data.created || '' : '';
        const name = typeof data === 'object' ? data.name || '' : '';
        const placeholder = generatePlaceholder(id, data);
        
        // Escape CSV values (handle commas and quotes)
        const escapeCsv = (value: string): string => {
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        };
        
        csvLines.push([
          escapeCsv(id),
          escapeCsv(name),
          escapeCsv(secret),
          escapeCsv(description),
          escapeCsv(created),
          escapeCsv(placeholder)
        ].join(','));
      });
      
      const csvContent = csvLines.join('\n');
      const resolvedPath = path.resolve(csvPath);
      fs.writeFileSync(resolvedPath, csvContent, 'utf8');
      
      console.log(`Exported ${Object.keys(secrets).length} secrets to: ${resolvedPath}`);
    } catch (err) {
      console.error('Error exporting secrets:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('index [path] [pattern]')
  .description('Index files containing secrets for faster encrypt/decrypt operations')
  .option('--all', 'Index all files (default is git-modified files only)')
  .action(async (targetPath: string | undefined, pattern: string | undefined, cmdOptions, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.json');
      
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      let store: SecretsStore;
      
      try {
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          store = { secrets: store as any, index: [] };
        }
      } catch (err) {
        console.error('Error: Could not parse secrets file');
        process.exit(1);
      }
      
      console.log('Indexing files...');
      if (pattern) {
        console.log(`Pattern: ${pattern}`);
      }
      
      let specificFiles: string[] | undefined;
      // Default to git-modified unless --all is specified
      if (!cmdOptions.all) {
        console.log('Mode: Git modified files only (use --all to index all files)');
        specificFiles = encrypt.getGitModifiedFiles(gitRoot);
        if (specificFiles.length === 0) {
          console.log('No git-modified files found');
        }
      } else {
        console.log('Mode: Indexing all files');
      }
      
      const newIndexedFiles = encrypt.indexFiles(searchPath, store.secrets, pattern, gitRoot, specificFiles);
      
      // Merge with existing index when using git-modified mode
      if (!cmdOptions.all && store.index && store.index.length > 0) {
        // Create a map of existing indexed files by path
        const existingMap = new Map(store.index.map(f => [f.path, f]));
        
        // Update or add new indexed files
        newIndexedFiles.forEach(newFile => {
          existingMap.set(newFile.path, newFile);
        });
        
        // Remove files that no longer exist
        const finalIndex: encrypt.IndexedFile[] = [];
        existingMap.forEach((file, filePath) => {
          if (fs.existsSync(filePath)) {
            finalIndex.push(file);
          }
        });
        
        store.index = finalIndex;
      } else {
        // Replace entire index when using --all or when no existing index
        store.index = newIndexedFiles;
      }
      
      await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
      
      console.log(`\nIndexed ${store.index!.length} files containing secrets`);
      if (store.index!.length > 0) {
        console.log('\nFiles indexed:');
        store.index!.forEach((f: encrypt.IndexedFile) => {
          const relPath = path.relative(gitRoot, f.path);
          console.log(`  ${relPath} (${f.secretIds.length} secret(s))`);
        });
      }
    } catch (err) {
      console.error('Error indexing files:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('add')
  .description('Add a secret to the store. Usage: add [name] <secret> [description]. If one parameter: secret value (name auto-generated). If two: name and secret. If three: name, secret, and description.')
  .argument('[args...]', 'Arguments: [name] <secret> [description]')
  .action(async (args: string[], _options, command) => {
    try {
      // Parse arguments based on count
      let customName: string | undefined;
      let secret: string;
      let desc: string | undefined;
      
      if (args.length === 0) {
        console.error('Error: Secret value is required');
        console.error('Usage: add [name] <secret> [description]');
        console.error('  - One parameter: secret value (name auto-generated)');
        console.error('  - Two parameters: name and secret value');
        console.error('  - Three parameters: name, secret value, and description');
        process.exit(1);
      } else if (args.length === 1) {
        // Only one argument provided: it's the secret value
        secret = args[0];
        customName = undefined;
        desc = undefined;
      } else if (args.length === 2) {
        // Two arguments provided: first is name, second is secret
        customName = args[0];
        secret = args[1];
        desc = undefined;
      } else {
        // Three or more arguments: first is name, second is secret, third is description
        customName = args[0];
        secret = args[1];
        desc = args[2];
      }
      
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const password = await vault.getPassword(globalOpts);
      let store: SecretsStore = { secrets: {}, index: undefined };
      
      try {
        const decrypted = await vault.decryptVaultFile(secretsPath, password);
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          store = { secrets: store as any, index: undefined };
        }
      } catch (err) {
        // If file doesn't exist or is empty, start fresh
        store = { secrets: {}, index: undefined };
      }
      
      // Check for duplicate secret value
      for (const [existingUuid, data] of Object.entries(store.secrets)) {
        const existingSecret = typeof data === 'string' ? data : data.secret;
        if (existingSecret === secret) {
          const placeholder = generatePlaceholder(existingUuid, data);
          console.error(`Error: Secret already exists`);
          console.error(`Use the existing placeholder: ${placeholder}`);
          process.exit(1);
        }
      }
      
      // Check if custom name is provided and if it already exists
      if (customName) {
        // Validate name format (alphanumeric, underscore, hyphen)
        if (!/^[a-zA-Z0-9_-]+$/.test(customName)) {
          console.error('Error: Name must contain only alphanumeric characters, underscores, or hyphens');
          process.exit(1);
        }
        
        if (nameExists(store.secrets, customName)) {
          console.error(`Error: A secret with name "${customName}" already exists`);
          console.error('Use "modify" command to update an existing secret, or choose a different name');
          process.exit(1);
        }
      }
      
      const uuid = uuidv4();
      const secretData: SecretData = {
        secret: secret,
        description: desc || '',
        created: new Date().toISOString()
      };
      
      // Add custom name if provided
      if (customName) {
        secretData.name = customName;
      }
      
      store.secrets[uuid] = secretData;
      
      await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
      const placeholder = generatePlaceholder(uuid, secretData);
      console.log(`Secret added with placeholder: ${placeholder}`);
      if (desc) {
        console.log(`Description: ${desc}`);
      }
      if (customName) {
        console.log(`Name: ${customName}`);
      }
    } catch (err) {
      console.error('Error adding secret:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('modify <name> <secret> [description]')
  .description('Modify an existing secret by its custom name')
  .action(async (name: string, secret: string, description: string | undefined, _options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const password = await vault.getPassword(globalOpts);
      let store: SecretsStore = { secrets: {}, index: undefined };
      
      try {
        const decrypted = await vault.decryptVaultFile(secretsPath, password);
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          store = { secrets: store as any, index: undefined };
        }
      } catch (err) {
        console.error('Error: Could not load secrets file');
        console.error('Make sure the secrets file exists and the password is correct');
        process.exit(1);
      }
      
      // Find the secret by name
      const found = findSecretByName(store.secrets, name);
      if (!found) {
        console.error(`Error: No secret found with name "${name}"`);
        console.error('Use "list" command to see all available secrets');
        process.exit(1);
      }
      
      const [id, oldData] = found;
      const oldSecret = typeof oldData === 'string' ? oldData : oldData.secret;
      
      // Update the secret value
      if (typeof oldData === 'string') {
        // Convert old format to new format
        store.secrets[id] = {
          secret: secret,
          description: description || '',
          created: new Date().toISOString(),
          name: name
        };
      } else {
        // Update existing object
        store.secrets[id] = {
          ...oldData,
          secret: secret,
          description: description !== undefined ? description : oldData.description || '',
          name: name
        };
      }
      
      await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
      const placeholder = generatePlaceholder(id, store.secrets[id]);
      console.log(`Secret "${name}" modified successfully`);
      console.log(`Placeholder: ${placeholder}`);
      if (description !== undefined) {
        console.log(`Description: ${description}`);
      }
      console.log(`Previous value: ${oldSecret.substring(0, 20)}${oldSecret.length > 20 ? '...' : ''}`);
    } catch (err) {
      console.error('Error modifying secret:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('encrypt [path]')
  .description('Encrypt secrets in files with placeholders (default: entire repo)')
  .action(async (targetPath: string | undefined, _options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.json');
      
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      let store: SecretsStore;
      let secrets: SecretsMap;
      
      try {
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          secrets = store as any;
          store = { secrets, index: undefined };
        } else {
          secrets = store.secrets;
        }
      } catch (err) {
        console.error('Error: Could not parse secrets file');
        process.exit(1);
      }
      
      let encryptedFiles = 0;
      
      // Use index if available and no specific path given
      if (store.index && store.index.length > 0 && !targetPath) {
        console.log(`Using index (${store.index.length} files)...`);
        store.index.forEach(indexedFile => {
          if (fs.existsSync(indexedFile.path)) {
            if (encrypt.encryptSecretsInFile(indexedFile.path, secrets)) {
              console.log(`Encrypted secrets in: ${indexedFile.path}`);
              encryptedFiles++;
            }
          }
        });
      } else {
        // Fall back to scanning all files
        if (store.index && !targetPath) {
          console.log('No index found. Run "index" command first for faster operation.');
        }
        
        const stats = fs.statSync(searchPath);
        if (stats.isFile()) {
          if (encrypt.encryptSecretsInFile(searchPath, secrets)) {
            console.log(`Encrypted secrets in: ${searchPath}`);
            encryptedFiles++;
          }
        } else {
          encrypt.walkDir(searchPath, (filePath) => {
            // Skip the secrets file itself
            if (filePath === secretsPath) return;
            if (encrypt.encryptSecretsInFile(filePath, secrets)) {
              console.log(`Encrypted secrets in: ${filePath}`);
              encryptedFiles++;
            }
          }, gitRoot);
        }
      }
      
      if (encryptedFiles === 0) {
        console.log('No secrets encrypted.');
      }
    } catch (err) {
      console.error('Error encrypting secrets:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('decrypt [path]')
  .description('Decrypt placeholders back to secrets in files (default: entire repo)')
  .action(async (targetPath: string | undefined, _options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.json');
      
      const password = await vault.getPassword(globalOpts);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      let store: SecretsStore;
      let secrets: SecretsMap;
      
      try {
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          secrets = store as any;
          store = { secrets, index: undefined };
        } else {
          secrets = store.secrets;
        }
      } catch (err) {
        console.error('Error: Could not parse secrets file');
        process.exit(1);
      }
      
      let decryptedFiles = 0;
      
      // Use index if available and no specific path given
      if (store.index && store.index.length > 0 && !targetPath) {
        console.log(`Using index (${store.index.length} files)...`);
        store.index.forEach(indexedFile => {
          if (fs.existsSync(indexedFile.path)) {
            if (encrypt.decryptSecretsInFile(indexedFile.path, secrets)) {
              console.log(`Decrypted placeholders in: ${indexedFile.path}`);
              decryptedFiles++;
            }
          }
        });
      } else {
        // Fall back to scanning all files
        if (store.index && !targetPath) {
          console.log('No index found. Run "index" command first for faster operation.');
        }
        
        const stats = fs.statSync(searchPath);
        if (stats.isFile()) {
          if (encrypt.decryptSecretsInFile(searchPath, secrets)) {
            console.log(`Decrypted placeholders in: ${searchPath}`);
            decryptedFiles++;
          }
        } else {
          encrypt.walkDir(searchPath, (filePath) => {
            // Skip the secrets file itself
            if (filePath === secretsPath) return;
            if (encrypt.decryptSecretsInFile(filePath, secrets)) {
              console.log(`Decrypted placeholders in: ${filePath}`);
              decryptedFiles++;
            }
          }, gitRoot);
        }
      }
      
      if (decryptedFiles === 0) {
        console.log('No placeholders decrypted.');
      }
    } catch (err) {
      console.error('Error decrypting placeholders:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('install-hook')
  .description('Install git pre-commit hook to check for secrets')
  .action(() => {
    try {
      require('./install-hook');
    } catch (err) {
      console.error('Error installing hook:', (err as Error).message);
    }
  });

program
  .command('remove-hook')
  .description('Remove git pre-commit hook')
  .action(() => {
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
    if (!hookContent.includes('repo-secret-manager')) {
      console.log(`${YELLOW}ℹ️  Pre-commit hook is not from repo-secret-manager${RESET}`);
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
