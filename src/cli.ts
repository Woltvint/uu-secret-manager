#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import * as vault from './vault';
import { v4 as uuidv4 } from 'uuid';
import * as encrypt from './encrypt';
import { SecretData, SecretsMap, SecretsStore, generatePlaceholder, findSecretByName, nameExists, findSecretByIdentifier } from './encrypt';

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
  return path.join(gitRoot, 'repo-secret-manager.vault');
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
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.vault');
      
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      // Default to git-modified and .gitignore files unless --all is specified
      if (!cmdOptions.all) {
        console.log('Mode: Git modified files and .gitignore files (use --all to index all files)');
        specificFiles = encrypt.getGitModifiedFiles(gitRoot);
        if (specificFiles.length === 0) {
          console.log('No git-modified or .gitignore files found');
        }
      } else {
        console.log('Mode: Indexing all files');
      }
      
      const newIndexedFiles = encrypt.indexFiles(searchPath, store.secrets, pattern, gitRoot, specificFiles);
      
      // Merge with existing index when using git-modified mode
      if (!cmdOptions.all && store.index && store.index.length > 0) {
        // Create a map of existing indexed files by path (relative paths)
        const existingMap = new Map(store.index.map(f => [f.path, f]));
        
        // Update or add new indexed files
        newIndexedFiles.forEach(newFile => {
          existingMap.set(newFile.path, newFile);
        });
        
        // Remove files that no longer exist (convert relative to absolute to check)
        const finalIndex: encrypt.IndexedFile[] = [];
        existingMap.forEach((file, relativePath) => {
          const absolutePath = path.join(gitRoot, relativePath);
          if (fs.existsSync(absolutePath)) {
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
          // Path is already relative
          console.log(`  ${f.path} (${f.secretIds.length} secret(s))`);
        });
      }
    } catch (err) {
      console.error('Error indexing files:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('clearindex')
  .description('Clear the index from the store. Use this to fully recreate the index afterwards.')
  .action(async (_options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.vault');
      
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
      const decrypted = await vault.decryptVaultFile(secretsPath, password);
      let store: SecretsStore;
      
      try {
        store = JSON.parse(decrypted);
        // Handle old format without index
        if (!store.secrets) {
          store = { secrets: store as any, index: undefined };
        }
      } catch (err) {
        console.error('Error: Could not parse secrets file');
        process.exit(1);
      }
      
      // Check if index exists
      if (!store.index || store.index.length === 0) {
        console.log('No index found in the store.');
        process.exit(0);
      }
      
      const indexCount = store.index.length;
      
      // Clear the index
      store.index = undefined;
      
      // Save the updated store
      await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
      
      console.log(`Index cleared successfully (removed ${indexCount} indexed file(s)).`);
      console.log('Run "index" command to recreate the index.');
    } catch (err) {
      console.error('Error clearing index:', (err as Error).message);
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
      const vaultExists = fs.existsSync(secretsPath);
      const password = await vault.getPassword({ ...globalOpts, vaultExists }, secretsPath);
      let store: SecretsStore = { secrets: {}, index: undefined };
      
      if (vaultExists) {
        try {
          const decrypted = await vault.decryptVaultFile(secretsPath, password);
          store = JSON.parse(decrypted);
          // Handle old format without index
          if (!store.secrets) {
            store = { secrets: store as any, index: undefined };
          }
        } catch (err) {
          console.error('Error: Could not decrypt vault file');
          console.error('Make sure the password is correct');
          process.exit(1);
        }
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
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
  .command('delete <identifier>')
  .description('Delete a secret by its custom name or UUID')
  .action(async (identifier: string, _options, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const secretsPath = getSecretsPath(repoPath);
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      
      // Find the secret by name or UUID
      const found = findSecretByIdentifier(store.secrets, identifier);
      if (!found) {
        console.error(`Error: No secret found with identifier "${identifier}"`);
        console.error('Use "list" command to see all available secrets');
        process.exit(1);
      }
      
      const [id, data] = found;
      const secret = typeof data === 'string' ? data : data.secret;
      const name = typeof data === 'object' ? data.name : undefined;
      const placeholder = generatePlaceholder(id, data);
      
      // Delete the secret
      delete store.secrets[id];
      
      // Update index to remove references to this secret
      if (store.index) {
        store.index = store.index.map(indexedFile => ({
          ...indexedFile,
          secretIds: indexedFile.secretIds.filter(secretId => secretId !== id)
        })).filter(indexedFile => indexedFile.secretIds.length > 0);
      }
      
      await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
      console.log(`Secret "${identifier}" deleted successfully`);
      console.log(`Note: Placeholders in files (${placeholder}) will remain but will not be decrypted.`);
      console.log('Consider running "encrypt" to remove placeholders from files, or update files manually.');
    } catch (err) {
      console.error('Error deleting secret:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('encrypt [path]')
  .description('Encrypt secrets in files with placeholders (default: entire repo)')
  .option('--noindex', 'Do not use index, perform full directory scan')
  .action(async (targetPath: string | undefined, cmdOptions, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.vault');
      
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      
      // Use index if available and no specific path given and --noindex is not set
      if (store.index && store.index.length > 0 && !targetPath && !cmdOptions.noindex) {
        console.log(`Using index: processing ${store.index.length} indexed file(s)...`);
        store.index.forEach(indexedFile => {
          // Convert relative path to absolute path
          const absolutePath = path.join(gitRoot, indexedFile.path);
          if (fs.existsSync(absolutePath)) {
            if (encrypt.encryptSecretsInFile(absolutePath, secrets)) {
              console.log(`Encrypted secrets in: ${indexedFile.path}`);
              encryptedFiles++;
            }
          }
        });
      } else {
        // Fall back to scanning all files
        if (cmdOptions.noindex) {
          console.log('Performing full directory scan (--noindex flag set)...');
        } else if (store.index && !targetPath) {
          console.log('No index found. Performing full directory scan...');
          console.log('Tip: Run "index" command first for faster operation.');
        } else if (!store.index) {
          console.log('Performing full directory scan (no index available)...');
        } else {
          console.log('Performing full directory scan (specific path provided)...');
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
  .option('--noindex', 'Do not use index, perform full directory scan')
  .action(async (targetPath: string | undefined, cmdOptions, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.vault');
      
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
          // Convert relative path to absolute path
          const absolutePath = path.join(gitRoot, indexedFile.path);
          if (fs.existsSync(absolutePath)) {
            if (encrypt.decryptSecretsInFile(absolutePath, secrets)) {
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
  .command('redact [path]')
  .description('Create redacted files with placeholders (default: entire repo). Redacted files have ".redacted" inserted before the file extension.')
  .option('--nogitignore', 'Do not add original files to .gitignore')
  .option('--nogitremove', 'Do not remove tracked files from git')
  .option('--noindex', 'Do not use index, perform full directory scan')
  .action(async (targetPath: string | undefined, cmdOptions, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.vault');
      
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      
      let redactedFiles = 0;
      let gitignoreUpdated = false;
      let gitRemovedFiles = 0;
      
      // Use index if available and no specific path given and --noindex is not set
      if (store.index && store.index.length > 0 && !targetPath && !cmdOptions.noindex) {
        console.log(`Using index: processing ${store.index.length} indexed file(s)...`);
        store.index.forEach(indexedFile => {
          // Convert relative path to absolute path
          const absolutePath = path.join(gitRoot, indexedFile.path);
          if (fs.existsSync(absolutePath)) {
            // Skip if already a redacted file
            if (encrypt.isRedactedFile(absolutePath)) {
              return;
            }
            const result = encrypt.redactSecretsInFile(absolutePath, secrets);
            if (result) {
              if (result.unchanged) {
                // File exists and content is the same, no logging needed
              } else if (result.created) {
                const redactedRelativePath = path.relative(gitRoot, result.redactedPath).replace(/\\/g, '/');
                console.log(`Created redacted file: ${redactedRelativePath}`);
                redactedFiles++;
              } else {
                const redactedRelativePath = path.relative(gitRoot, result.redactedPath).replace(/\\/g, '/');
                console.log(`Updating redacted file: ${redactedRelativePath}`);
                redactedFiles++;
              }
              
              // Add original file to .gitignore if not disabled (only if file was created or updated)
              if (!result.unchanged && !cmdOptions.nogitignore) {
                if (encrypt.addToGitignore(absolutePath, gitRoot)) {
                  gitignoreUpdated = true;
                }
                
                // Remove file from git if tracked and not disabled (only if file was created or updated)
                if (!cmdOptions.nogitremove) {
                  if (encrypt.removeFileFromGit(absolutePath, gitRoot)) {
                    gitRemovedFiles++;
                  }
                }
              }
            }
          }
        });
      } else {
        // Fall back to scanning all files
        if (cmdOptions.noindex) {
          console.log('Performing full directory scan (--noindex flag set)...');
        } else if (store.index && !targetPath) {
          console.log('No index found. Performing full directory scan...');
          console.log('Tip: Run "index" command first for faster operation.');
        } else if (!store.index) {
          console.log('Performing full directory scan (no index available)...');
        } else {
          console.log('Performing full directory scan (specific path provided)...');
        }
        
        const stats = fs.statSync(searchPath);
        if (stats.isFile()) {
          // Skip if already a redacted file
          if (!encrypt.isRedactedFile(searchPath)) {
            const result = encrypt.redactSecretsInFile(searchPath, secrets);
            if (result) {
              if (result.unchanged) {
                // File exists and content is the same, no logging needed
              } else if (result.created) {
                console.log(`Created redacted file: ${result.redactedPath}`);
                redactedFiles++;
              } else {
                console.log(`Updating redacted file: ${result.redactedPath}`);
                redactedFiles++;
              }
              
              // Add original file to .gitignore if not disabled (only if file was created or updated)
              if (!result.unchanged && !cmdOptions.nogitignore) {
                if (encrypt.addToGitignore(searchPath, gitRoot)) {
                  gitignoreUpdated = true;
                }
                
                // Remove file from git if tracked and not disabled (only if file was created or updated)
                if (!cmdOptions.nogitremove) {
                  if (encrypt.removeFileFromGit(searchPath, gitRoot)) {
                    gitRemovedFiles++;
                  }
                }
              }
            }
          }
        } else {
          encrypt.walkDir(searchPath, (filePath) => {
            // Skip the secrets file itself and redacted files
            if (filePath === secretsPath || encrypt.isRedactedFile(filePath)) {
              return;
            }
            const result = encrypt.redactSecretsInFile(filePath, secrets);
            if (result) {
              if (result.unchanged) {
                // File exists and content is the same, no logging needed
              } else if (result.created) {
                const redactedRelativePath = path.relative(gitRoot, result.redactedPath).replace(/\\/g, '/');
                console.log(`Created redacted file: ${redactedRelativePath}`);
                redactedFiles++;
              } else {
                const redactedRelativePath = path.relative(gitRoot, result.redactedPath).replace(/\\/g, '/');
                console.log(`Updating redacted file: ${redactedRelativePath}`);
                redactedFiles++;
              }
              
              // Add original file to .gitignore if not disabled (only if file was created or updated)
              if (!result.unchanged && !cmdOptions.nogitignore) {
                if (encrypt.addToGitignore(filePath, gitRoot)) {
                  gitignoreUpdated = true;
                }
                
                // Remove file from git if tracked and not disabled (only if file was created or updated)
                if (!cmdOptions.nogitremove) {
                  if (encrypt.removeFileFromGit(filePath, gitRoot)) {
                    gitRemovedFiles++;
                  }
                }
              }
            }
          }, gitRoot);
        }
      }
      
      if (redactedFiles === 0) {
        console.log('No redacted files created.');
      } else {
        console.log(`\nCreated ${redactedFiles} redacted file(s).`);
        if (gitignoreUpdated) {
          console.log('Added original file(s) to .gitignore to prevent accidental commits.');
        }
        if (gitRemovedFiles > 0) {
          console.log(`Removed ${gitRemovedFiles} tracked file(s) from git (files preserved locally).`);
        }
      }
    } catch (err) {
      console.error('Error creating redacted files:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('unredact [path]')
  .description('Restore secrets from redacted files. Takes files with ".redacted" in the name and creates files without ".redacted" containing real values.')
  .option('--noindex', 'Do not use index, perform full directory scan')
  .action(async (targetPath: string | undefined, cmdOptions, command) => {
    try {
      const globalOpts = command.parent!.opts();
      const repoPath = globalOpts.repo;
      const gitRoot = findGitRoot(repoPath);
      if (!gitRoot) {
        console.error('Error: Not in a git repository');
        process.exit(1);
      }
      
      const searchPath = targetPath ? path.resolve(targetPath) : gitRoot;
      const secretsPath = path.join(gitRoot, 'repo-secret-manager.vault');
      
      const vaultExists = fs.existsSync(secretsPath);
      if (!vaultExists) {
        console.error('Error: Vault file does not exist');
        console.error('Create a vault by adding a secret with: rsm add <secret>');
        process.exit(1);
      }
      const password = await vault.getPassword({ ...globalOpts, vaultExists: true }, secretsPath);
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
      
      let unredactedFiles = 0;
      
      const processRedactedFile = (filePath: string) => {
        if (encrypt.isRedactedFile(filePath)) {
          const result = encrypt.unredactSecretsInFile(filePath, secrets);
          if (result) {
            if (result.unchanged) {
              // File exists and content is the same, no logging needed
            } else if (result.created) {
              const originalRelativePath = path.relative(gitRoot, result.originalPath).replace(/\\/g, '/');
              console.log(`Created unredacted file: ${originalRelativePath}`);
              unredactedFiles++;
            } else {
              const originalRelativePath = path.relative(gitRoot, result.originalPath).replace(/\\/g, '/');
              console.log(`Updating unredacted file: ${originalRelativePath}`);
              unredactedFiles++;
            }
          }
        }
      };
      
      // Use index if available and no specific path given and --noindex is not set
      if (store.index && store.index.length > 0 && !targetPath && !cmdOptions.noindex) {
        console.log(`Using index: checking ${store.index.length} indexed file(s) for redacted versions...`);
        store.index.forEach(indexedFile => {
          // Convert relative path to absolute path
          const absolutePath = path.join(gitRoot, indexedFile.path);
          // The index stores original file paths (e.g., "file.json")
          // We need to check if a redacted version exists (e.g., "file.redacted.json")
          // But also handle the case where the indexed path might already be a redacted file
          let redactedPath: string;
          if (encrypt.isRedactedFile(absolutePath)) {
            // Indexed path is already a redacted file, use it directly
            redactedPath = absolutePath;
          } else {
            // Convert original path to redacted path
            redactedPath = encrypt.getRedactedFilePath(absolutePath);
          }
          
          if (fs.existsSync(redactedPath)) {
            processRedactedFile(redactedPath);
          }
        });
      } else {
        // Fall back to scanning all files
        if (cmdOptions.noindex) {
          console.log('Performing full directory scan (--noindex flag set)...');
        } else if (store.index && !targetPath) {
          console.log('No index found. Performing full directory scan...');
          console.log('Tip: Run "index" command first for faster operation.');
        } else if (!store.index) {
          console.log('Performing full directory scan (no index available)...');
        } else {
          console.log('Performing full directory scan (specific path provided)...');
        }
        
        const stats = fs.statSync(searchPath);
        if (stats.isFile()) {
          processRedactedFile(searchPath);
        } else {
          encrypt.walkDir(searchPath, (filePath) => {
            // Skip the secrets file itself
            if (filePath === secretsPath) {
              return;
            }
            processRedactedFile(filePath);
          }, gitRoot);
        }
      }
      
      if (unredactedFiles === 0) {
        console.log('No redacted files found to unredact.');
      } else {
        console.log(`\nCreated ${unredactedFiles} unredacted file(s).`);
      }
    } catch (err) {
      console.error('Error unredacting files:', (err as Error).message);
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
