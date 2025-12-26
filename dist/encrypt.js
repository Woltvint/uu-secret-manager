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
exports.getPlaceholderId = getPlaceholderId;
exports.generatePlaceholder = generatePlaceholder;
exports.findSecretByName = findSecretByName;
exports.nameExists = nameExists;
exports.findSecretByIdentifier = findSecretByIdentifier;
exports.getGitignoreFiles = getGitignoreFiles;
exports.getGitModifiedFiles = getGitModifiedFiles;
exports.matchesPattern = matchesPattern;
exports.isGitIgnored = isGitIgnored;
exports.walkDir = walkDir;
exports.encryptSecretsInFile = encryptSecretsInFile;
exports.decryptSecretsInFile = decryptSecretsInFile;
exports.getRedactedFilePath = getRedactedFilePath;
exports.isRedactedFile = isRedactedFile;
exports.getOriginalFilePath = getOriginalFilePath;
exports.redactSecretsInFile = redactSecretsInFile;
exports.unredactSecretsInFile = unredactSecretsInFile;
exports.addToGitignore = addToGitignore;
exports.indexFiles = indexFiles;
exports.encryptIndexedFiles = encryptIndexedFiles;
exports.decryptIndexedFiles = decryptIndexedFiles;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/**
 * Gets the placeholder identifier for a secret (name if available, otherwise UUID)
 * @param id - UUID or key for the secret
 * @param data - Secret data (string or SecretData object)
 * @returns Placeholder identifier (name or UUID)
 */
function getPlaceholderId(id, data) {
    if (typeof data === 'object' && data.name) {
        return data.name;
    }
    return id;
}
/**
 * Generates a placeholder string for a secret
 * @param id - UUID or key for the secret
 * @param data - Secret data (string or SecretData object)
 * @returns Placeholder string in format <!secret_{id}!
 */
function generatePlaceholder(id, data) {
    const placeholderId = getPlaceholderId(id, data);
    return `<!secret_${placeholderId}!>`;
}
/**
 * Finds a secret entry by its custom name
 * @param secrets - Map of secrets
 * @param name - Custom name to search for
 * @returns Tuple of [id, data] if found, null otherwise
 */
function findSecretByName(secrets, name) {
    for (const [id, data] of Object.entries(secrets)) {
        if (typeof data === 'object' && data.name === name) {
            return [id, data];
        }
    }
    return null;
}
/**
 * Checks if a name already exists in the secrets map
 * @param secrets - Map of secrets
 * @param name - Custom name to check
 * @returns true if name exists, false otherwise
 */
function nameExists(secrets, name) {
    return findSecretByName(secrets, name) !== null;
}
/**
 * Finds a secret by either its custom name or UUID
 * @param secrets - Map of secrets
 * @param identifier - Custom name or UUID to search for
 * @returns Tuple of [id, data] if found, null otherwise
 */
function findSecretByIdentifier(secrets, identifier) {
    // First try to find by custom name
    const byName = findSecretByName(secrets, identifier);
    if (byName) {
        return byName;
    }
    // Then try to find by UUID
    if (secrets[identifier]) {
        return [identifier, secrets[identifier]];
    }
    return null;
}
/**
 * Gets exact file paths from .gitignore (ignores patterns, directories, and comments)
 * @param gitRoot - Root directory of the git repository
 * @returns Array of absolute file paths from .gitignore that are exact file matches
 */
function getGitignoreFiles(gitRoot) {
    const gitignorePath = path.join(gitRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split('\n');
        const files = [];
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            // Skip patterns with wildcards (*, ?, [])
            if (trimmed.includes('*') || trimmed.includes('?') || trimmed.includes('[')) {
                continue;
            }
            // Skip directory paths (ending with /)
            if (trimmed.endsWith('/')) {
                continue;
            }
            // Skip negated patterns (starting with !)
            if (trimmed.startsWith('!')) {
                continue;
            }
            // This looks like an exact file path
            const filePath = path.join(gitRoot, trimmed.replace(/\\/g, '/'));
            // Verify it exists and is a file (not a directory)
            if (fs.existsSync(filePath)) {
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.isFile()) {
                        files.push(filePath);
                    }
                }
                catch {
                    // Skip if we can't stat the file
                }
            }
        }
        return files;
    }
    catch (err) {
        // If reading .gitignore fails, return empty array
        return [];
    }
}
/**
 * Gets list of modified files in git (staged and unstaged) plus files from .gitignore
 * @param gitRoot - Root directory of the git repository
 * @returns Array of absolute file paths that have been modified or are in .gitignore
 */
function getGitModifiedFiles(gitRoot) {
    const files = [];
    // Get git-modified files
    try {
        // Get both staged and unstaged files
        const output = (0, child_process_1.execSync)('git diff --name-only HEAD && git diff --name-only --cached', {
            cwd: gitRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const gitFiles = output
            .split('\n')
            .filter(f => f.trim())
            .map(f => path.join(gitRoot, f.trim()))
            // Only include files that exist
            .filter(f => fs.existsSync(f) && fs.statSync(f).isFile());
        files.push(...gitFiles);
    }
    catch (err) {
        // If git command fails, continue with .gitignore files
    }
    // Get files from .gitignore (exact file paths only)
    const gitignoreFiles = getGitignoreFiles(gitRoot);
    files.push(...gitignoreFiles);
    // Remove duplicates and return
    return files.filter((file, index, self) => self.indexOf(file) === index);
}
/**
 * Checks if a file path matches a glob pattern
 * @param filePath - Path to check
 * @param pattern - Glob pattern (e.g., "*.js" or "(*.js|*.json)")
 * @returns true if the file matches the pattern
 */
function matchesPattern(filePath, pattern) {
    const fileName = path.basename(filePath);
    // Handle parentheses for multiple patterns: (*.js|*.json)
    if (pattern.startsWith('(') && pattern.endsWith(')')) {
        const patterns = pattern.slice(1, -1).split('|');
        return patterns.some(p => matchesPattern(filePath, p.trim()));
    }
    // Convert glob pattern to regex
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(fileName);
}
/**
 * Checks if a file is ignored by git
 * @param filePath - Path to the file to check
 * @param gitRoot - Root directory of the git repository
 * @returns true if the file is ignored by git, false otherwise
 */
function isGitIgnored(filePath, gitRoot) {
    try {
        // Use git check-ignore to check if file is ignored
        (0, child_process_1.execSync)(`git check-ignore "${filePath}"`, {
            cwd: gitRoot,
            stdio: 'pipe'
        });
        // If command succeeds, file is ignored
        return true;
    }
    catch {
        // If command fails (exit code 1), file is not ignored
        return false;
    }
}
/**
 * Recursively walks a directory and calls callback for each file
 * @param dir - Directory path to walk
 * @param callback - Function to call for each file found
 * @param gitRoot - Optional git root to respect .gitignore
 */
function walkDir(dir, callback, gitRoot) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const fullPath = path.join(dir, entry.name);
        // Skip if ignored by git
        if (gitRoot && isGitIgnored(fullPath, gitRoot)) {
            return;
        }
        if (entry.isDirectory()) {
            walkDir(fullPath, callback, gitRoot);
        }
        else if (entry.isFile()) {
            callback(fullPath);
        }
    });
}
/**
 * Encrypts actual secrets in a file with UUID-based placeholders
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any changes were made, false otherwise
 */
function encryptSecretsInFile(filePath, secrets) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    Object.entries(secrets).forEach(([id, data]) => {
        // Handle both old format (string) and new format (object)
        const secret = typeof data === 'string' ? data : data.secret;
        const placeholder = generatePlaceholder(id, data);
        if (content.includes(secret)) {
            content = content.split(secret).join(placeholder);
            changed = true;
        }
    });
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    }
    return false;
}
/**
 * Decrypts UUID-based placeholders back to actual secrets in a file
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any changes were made, false otherwise
 */
function decryptSecretsInFile(filePath, secrets) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    Object.entries(secrets).forEach(([id, data]) => {
        // Handle both old format (string) and new format (object)
        const secret = typeof data === 'string' ? data : data.secret;
        const placeholder = generatePlaceholder(id, data);
        if (content.includes(placeholder)) {
            content = content.split(placeholder).join(secret);
            changed = true;
        }
    });
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    }
    return false;
}
/**
 * Generates a redacted file path by inserting ".redacted" before the file extension
 * @param filePath - Original file path
 * @returns Redacted file path (e.g., "file.json" -> "file.redacted.json")
 */
function getRedactedFilePath(filePath) {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const ext = path.extname(basename);
    const nameWithoutExt = path.basename(basename, ext);
    return path.join(dir, `${nameWithoutExt}.redacted${ext}`);
}
/**
 * Checks if a file path represents a redacted file
 * @param filePath - File path to check
 * @returns true if the file is a redacted file
 */
function isRedactedFile(filePath) {
    const basename = path.basename(filePath);
    return basename.includes('.redacted.');
}
/**
 * Generates the original file path from a redacted file path
 * @param redactedFilePath - Redacted file path
 * @returns Original file path (e.g., "file.redacted.json" -> "file.json")
 */
function getOriginalFilePath(redactedFilePath) {
    const dir = path.dirname(redactedFilePath);
    const basename = path.basename(redactedFilePath);
    const ext = path.extname(basename);
    const nameWithoutExt = path.basename(basename, ext);
    // Remove .redacted from the name
    const originalName = nameWithoutExt.replace(/\.redacted$/, '');
    return path.join(dir, `${originalName}${ext}`);
}
/**
 * Redacts secrets in a file by creating a new file with placeholders
 * @param filePath - Path to the original file
 * @param secrets - Map of UUIDs to secret data
 * @returns Path to the created redacted file, or null if no secrets were found
 */
function redactSecretsInFile(filePath, secrets) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    Object.entries(secrets).forEach(([id, data]) => {
        // Handle both old format (string) and new format (object)
        const secret = typeof data === 'string' ? data : data.secret;
        const placeholder = generatePlaceholder(id, data);
        if (content.includes(secret)) {
            content = content.split(secret).join(placeholder);
            changed = true;
        }
    });
    if (changed) {
        const redactedPath = getRedactedFilePath(filePath);
        fs.writeFileSync(redactedPath, content, 'utf8');
        return redactedPath;
    }
    return null;
}
/**
 * Unredacts placeholders in a redacted file by creating a new file with real values
 * @param redactedFilePath - Path to the redacted file
 * @param secrets - Map of UUIDs to secret data
 * @returns Path to the created unredacted file, or null if no placeholders were found
 */
function unredactSecretsInFile(redactedFilePath, secrets) {
    let content = fs.readFileSync(redactedFilePath, 'utf8');
    let changed = false;
    Object.entries(secrets).forEach(([id, data]) => {
        // Handle both old format (string) and new format (object)
        const secret = typeof data === 'string' ? data : data.secret;
        const placeholder = generatePlaceholder(id, data);
        if (content.includes(placeholder)) {
            content = content.split(placeholder).join(secret);
            changed = true;
        }
    });
    if (changed) {
        const originalPath = getOriginalFilePath(redactedFilePath);
        fs.writeFileSync(originalPath, content, 'utf8');
        return originalPath;
    }
    return null;
}
/**
 * Adds a file path to .gitignore if it doesn't already exist there
 * @param filePath - Path to the file to add to .gitignore
 * @param gitRoot - Root directory of the git repository
 * @returns true if the file was added, false if it already existed
 */
function addToGitignore(filePath, gitRoot) {
    const gitignorePath = path.join(gitRoot, '.gitignore');
    const relativePath = path.relative(gitRoot, filePath).replace(/\\/g, '/'); // Normalize path separators
    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }
    // Check if the path already exists in .gitignore
    // Since comments are on separate lines, we only need to check for exact path matches
    // Lines starting with # are comments and are ignored (they don't count as matches)
    const lines = gitignoreContent.split('\n');
    const pathExists = lines.some(line => {
        const trimmed = line.trim();
        // Skip commented lines - they don't count as matches
        if (trimmed.startsWith('#')) {
            return false;
        }
        // Check for exact match (comments are on separate lines, so no need for complex matching)
        return trimmed === relativePath;
    });
    if (pathExists) {
        return false; // Already exists
    }
    // Add the path to .gitignore with a comment on a separate line before the path
    const comment = `# Added by repo-secret-manager (redacted version is stored in git)`;
    // Ensure there's a newline at the end of existing content
    const separator = gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : '';
    const entry = separator + comment + '\n' + relativePath + '\n';
    const newContent = gitignoreContent + entry;
    fs.writeFileSync(gitignorePath, newContent, 'utf8');
    return true; // Added
}
/**
 * Indexes files containing secrets
 * @param searchPath - Path to search for files
 * @param secrets - Map of UUIDs to secret data
 * @param pattern - Optional glob pattern to filter files (e.g., "*.js" or "(*.js|*.json)")
 * @param gitRoot - Optional git root to respect .gitignore
 * @param specificFiles - Optional array of specific files to index (e.g., git modified files)
 * @returns Array of indexed files with their secret IDs
 */
function indexFiles(searchPath, secrets, pattern, gitRoot, specificFiles) {
    const indexedFiles = [];
    const processFile = (filePath) => {
        // Apply pattern filter if provided
        if (pattern && !matchesPattern(filePath, pattern)) {
            return;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const secretIds = [];
            // Check which secrets are in this file
            Object.entries(secrets).forEach(([id, data]) => {
                const secret = typeof data === 'string' ? data : data.secret;
                if (content.includes(secret)) {
                    secretIds.push(id);
                }
            });
            // Only index files that contain secrets
            if (secretIds.length > 0) {
                indexedFiles.push({
                    path: filePath,
                    secretIds
                });
            }
        }
        catch (err) {
            // Skip files that can't be read (binary, permission issues, etc.)
        }
    };
    // If specific files provided, only process those
    if (specificFiles && specificFiles.length > 0) {
        specificFiles.forEach(processFile);
    }
    else {
        const stats = fs.statSync(searchPath);
        if (stats.isFile()) {
            processFile(searchPath);
        }
        else {
            walkDir(searchPath, processFile, gitRoot);
        }
    }
    return indexedFiles;
}
/**
 * Encrypts secrets only in indexed files
 * @param indexedFiles - Array of indexed files to process
 * @param secrets - Map of UUIDs to secret data
 * @returns Number of files that were encrypted
 */
function encryptIndexedFiles(indexedFiles, secrets) {
    let encryptedCount = 0;
    for (const indexedFile of indexedFiles) {
        if (fs.existsSync(indexedFile.path)) {
            if (encryptSecretsInFile(indexedFile.path, secrets)) {
                encryptedCount++;
            }
        }
    }
    return encryptedCount;
}
/**
 * Decrypts secrets only in indexed files
 * @param indexedFiles - Array of indexed files to process
 * @param secrets - Map of UUIDs to secret data
 * @returns Number of files that were decrypted
 */
function decryptIndexedFiles(indexedFiles, secrets) {
    let decryptedCount = 0;
    for (const indexedFile of indexedFiles) {
        if (fs.existsSync(indexedFile.path)) {
            if (decryptSecretsInFile(indexedFile.path, secrets)) {
                decryptedCount++;
            }
        }
    }
    return decryptedCount;
}
//# sourceMappingURL=encrypt.js.map