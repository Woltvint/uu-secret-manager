#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vault = __importStar(require("./vault"));
const uuid_1 = require("uuid");
const encrypt = __importStar(require("./encrypt"));
const program = new commander_1.Command();
/**
 * Finds the root directory of a git repository
 * @param startPath - Starting path to search from
 * @returns Path to git root or null if not found
 */
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
/**
 * Gets the path to the secrets file in the git repository
 * @param repoPath - Path to the repository
 * @returns Path to the secrets file
 */
function getSecretsPath(repoPath) {
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
    .version('2.0.0')
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
  $ echo "mypassword" | rsm add "my_secret" "Database password"
  $ rsm add "api_key_123"  # Without description
  $ rsm -f ~/.vault-pass list
  $ rsm -p mypassword encrypt
`);
program
    .command('list')
    .description('List all secrets in the store')
    .action(async (_options, command) => {
    try {
        const globalOpts = command.parent.opts();
        const repoPath = globalOpts.repo;
        const secretsPath = getSecretsPath(repoPath);
        const password = await vault.getPassword(globalOpts);
        const decrypted = await vault.decryptVaultFile(secretsPath, password);
        let store;
        let secrets;
        try {
            store = JSON.parse(decrypted);
            // Handle old format without index
            if (!store.secrets) {
                secrets = store;
            }
            else {
                secrets = store.secrets;
            }
        }
        catch (err) {
            console.error('Error: Could not parse secrets file');
            process.exit(1);
        }
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
    }
    catch (err) {
        console.error('Error listing secrets:', err.message);
        process.exit(1);
    }
});
program
    .command('export <csvPath>')
    .description('Export secrets to a CSV file')
    .action(async (csvPath, _options, command) => {
    try {
        const globalOpts = command.parent.opts();
        const repoPath = globalOpts.repo;
        const secretsPath = getSecretsPath(repoPath);
        const password = await vault.getPassword(globalOpts);
        const decrypted = await vault.decryptVaultFile(secretsPath, password);
        let store;
        let secrets;
        try {
            store = JSON.parse(decrypted);
            // Handle old format without index
            if (!store.secrets) {
                secrets = store;
            }
            else {
                secrets = store.secrets;
            }
        }
        catch (err) {
            console.error('Error: Could not parse secrets file');
            process.exit(1);
        }
        // Build CSV content
        const csvLines = ['UUID,Secret,Description,Created,Placeholder'];
        Object.entries(secrets).forEach(([uuid, data]) => {
            const secret = typeof data === 'string' ? data : data.secret;
            const description = typeof data === 'object' ? data.description || '' : '';
            const created = typeof data === 'object' ? data.created || '' : '';
            const placeholder = `<!secret_${uuid}!>`;
            // Escape CSV values (handle commas and quotes)
            const escapeCsv = (value) => {
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            };
            csvLines.push([
                escapeCsv(uuid),
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
    }
    catch (err) {
        console.error('Error exporting secrets:', err.message);
        process.exit(1);
    }
});
program
    .command('index [path] [pattern]')
    .description('Index files containing secrets for faster encrypt/decrypt operations')
    .option('--all', 'Index all files (default is git-modified files only)')
    .action(async (targetPath, pattern, cmdOptions, command) => {
    try {
        const globalOpts = command.parent.opts();
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
        let store;
        try {
            store = JSON.parse(decrypted);
            // Handle old format without index
            if (!store.secrets) {
                store = { secrets: store, index: [] };
            }
        }
        catch (err) {
            console.error('Error: Could not parse secrets file');
            process.exit(1);
        }
        console.log('Indexing files...');
        if (pattern) {
            console.log(`Pattern: ${pattern}`);
        }
        let specificFiles;
        // Default to git-modified unless --all is specified
        if (!cmdOptions.all) {
            console.log('Mode: Git modified files only (use --all to index all files)');
            specificFiles = encrypt.getGitModifiedFiles(gitRoot);
            if (specificFiles.length === 0) {
                console.log('No git-modified files found');
            }
        }
        else {
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
            const finalIndex = [];
            existingMap.forEach((file, filePath) => {
                if (fs.existsSync(filePath)) {
                    finalIndex.push(file);
                }
            });
            store.index = finalIndex;
        }
        else {
            // Replace entire index when using --all or when no existing index
            store.index = newIndexedFiles;
        }
        await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
        console.log(`\nIndexed ${store.index.length} files containing secrets`);
        if (store.index.length > 0) {
            console.log('\nFiles indexed:');
            store.index.forEach((f) => {
                const relPath = path.relative(gitRoot, f.path);
                console.log(`  ${relPath} (${f.secretIds.length} secret(s))`);
            });
        }
    }
    catch (err) {
        console.error('Error indexing files:', err.message);
        process.exit(1);
    }
});
program
    .command('add <secret> [description]')
    .description('Add a secret to the store with optional description')
    .action(async (secret, description, _options, command) => {
    try {
        const globalOpts = command.parent.opts();
        const repoPath = globalOpts.repo;
        const secretsPath = getSecretsPath(repoPath);
        const password = await vault.getPassword(globalOpts);
        let store = { secrets: {}, index: undefined };
        try {
            const decrypted = await vault.decryptVaultFile(secretsPath, password);
            store = JSON.parse(decrypted);
            // Handle old format without index
            if (!store.secrets) {
                store = { secrets: store, index: undefined };
            }
        }
        catch (err) {
            // If file doesn't exist or is empty, start fresh
            store = { secrets: {}, index: undefined };
        }
        // Check for duplicate secret
        for (const [existingUuid, data] of Object.entries(store.secrets)) {
            const existingSecret = typeof data === 'string' ? data : data.secret;
            if (existingSecret === secret) {
                console.error(`Error: Secret already exists with UUID: ${existingUuid}`);
                console.error(`Use the existing placeholder: <!secret_${existingUuid}!>`);
                process.exit(1);
            }
        }
        const uuid = (0, uuid_1.v4)();
        store.secrets[uuid] = {
            secret: secret,
            description: description || '',
            created: new Date().toISOString()
        };
        await vault.encryptVaultFile(secretsPath, password, JSON.stringify(store, null, 2));
        console.log(`Secret added with placeholder: <!secret_${uuid}!>`);
        if (description) {
            console.log(`Description: ${description}`);
        }
    }
    catch (err) {
        console.error('Error adding secret:', err.message);
        process.exit(1);
    }
});
program
    .command('encrypt [path]')
    .description('Encrypt secrets in files with placeholders (default: entire repo)')
    .action(async (targetPath, _options, command) => {
    try {
        const globalOpts = command.parent.opts();
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
        let store;
        let secrets;
        try {
            store = JSON.parse(decrypted);
            // Handle old format without index
            if (!store.secrets) {
                secrets = store;
                store = { secrets, index: undefined };
            }
            else {
                secrets = store.secrets;
            }
        }
        catch (err) {
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
        }
        else {
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
            }
            else {
                encrypt.walkDir(searchPath, (filePath) => {
                    // Skip the secrets file itself
                    if (filePath === secretsPath)
                        return;
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
    }
    catch (err) {
        console.error('Error encrypting secrets:', err.message);
        process.exit(1);
    }
});
program
    .command('decrypt [path]')
    .description('Decrypt placeholders back to secrets in files (default: entire repo)')
    .action(async (targetPath, _options, command) => {
    try {
        const globalOpts = command.parent.opts();
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
        let store;
        let secrets;
        try {
            store = JSON.parse(decrypted);
            // Handle old format without index
            if (!store.secrets) {
                secrets = store;
                store = { secrets, index: undefined };
            }
            else {
                secrets = store.secrets;
            }
        }
        catch (err) {
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
        }
        else {
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
            }
            else {
                encrypt.walkDir(searchPath, (filePath) => {
                    // Skip the secrets file itself
                    if (filePath === secretsPath)
                        return;
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
    }
    catch (err) {
        console.error('Error decrypting placeholders:', err.message);
        process.exit(1);
    }
});
program
    .command('install-hook')
    .description('Install git pre-commit hook to check for secrets')
    .action(() => {
    try {
        require('./install-hook');
    }
    catch (err) {
        console.error('Error installing hook:', err.message);
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
    }
    else {
        fs.unlinkSync(hookPath);
        console.log(`${GREEN}✅ Pre-commit hook removed${RESET}`);
    }
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map