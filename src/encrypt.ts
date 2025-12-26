import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SecretData {
  secret: string;
  description?: string;
  created?: string;
  name?: string;  // Optional custom name for the placeholder (instead of UUID)
}

export interface IndexedFile {
  path: string;
  secretIds: string[];  // UUIDs of secrets found in this file
}

export interface SecretsStore {
  secrets: SecretsMap;
  index?: IndexedFile[];
}

export type SecretsMap = Record<string, SecretData | string>;

/**
 * Gets the placeholder identifier for a secret (name if available, otherwise UUID)
 * @param id - UUID or key for the secret
 * @param data - Secret data (string or SecretData object)
 * @returns Placeholder identifier (name or UUID)
 */
export function getPlaceholderId(id: string, data: SecretData | string): string {
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
export function generatePlaceholder(id: string, data: SecretData | string): string {
  const placeholderId = getPlaceholderId(id, data);
  return `<!secret_${placeholderId}!>`;
}

/**
 * Finds a secret entry by its custom name
 * @param secrets - Map of secrets
 * @param name - Custom name to search for
 * @returns Tuple of [id, data] if found, null otherwise
 */
export function findSecretByName(secrets: SecretsMap, name: string): [string, SecretData | string] | null {
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
export function nameExists(secrets: SecretsMap, name: string): boolean {
  return findSecretByName(secrets, name) !== null;
}

/**
 * Finds a secret by either its custom name or UUID
 * @param secrets - Map of secrets
 * @param identifier - Custom name or UUID to search for
 * @returns Tuple of [id, data] if found, null otherwise
 */
export function findSecretByIdentifier(secrets: SecretsMap, identifier: string): [string, SecretData | string] | null {
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
 * Gets list of modified files in git (staged and unstaged)
 * @param gitRoot - Root directory of the git repository
 * @returns Array of absolute file paths that have been modified
 */
export function getGitModifiedFiles(gitRoot: string): string[] {
  try {
    // Get both staged and unstaged files
    const output = execSync('git diff --name-only HEAD && git diff --name-only --cached', {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const files = output
      .split('\n')
      .filter(f => f.trim())
      .map(f => path.join(gitRoot, f.trim()))
      // Remove duplicates
      .filter((file, index, self) => self.indexOf(file) === index)
      // Only include files that exist
      .filter(f => fs.existsSync(f) && fs.statSync(f).isFile());
    
    return files;
  } catch (err) {
    // If git command fails, return empty array
    return [];
  }
}

/**
 * Checks if a file path matches a glob pattern
 * @param filePath - Path to check
 * @param pattern - Glob pattern (e.g., "*.js" or "(*.js|*.json)")
 * @returns true if the file matches the pattern
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
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
export function isGitIgnored(filePath: string, gitRoot: string): boolean {
  try {
    // Use git check-ignore to check if file is ignored
    execSync(`git check-ignore "${filePath}"`, {
      cwd: gitRoot,
      stdio: 'pipe'
    });
    // If command succeeds, file is ignored
    return true;
  } catch {
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
export function walkDir(dir: string, callback: (filePath: string) => void, gitRoot?: string): void {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    
    // Skip if ignored by git
    if (gitRoot && isGitIgnored(fullPath, gitRoot)) {
      return;
    }
    
    if (entry.isDirectory()) {
      walkDir(fullPath, callback, gitRoot);
    } else if (entry.isFile()) {
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
export function encryptSecretsInFile(filePath: string, secrets: SecretsMap): boolean {
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
export function decryptSecretsInFile(filePath: string, secrets: SecretsMap): boolean {
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
export function getRedactedFilePath(filePath: string): string {
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
export function isRedactedFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename.includes('.redacted.');
}

/**
 * Generates the original file path from a redacted file path
 * @param redactedFilePath - Redacted file path
 * @returns Original file path (e.g., "file.redacted.json" -> "file.json")
 */
export function getOriginalFilePath(redactedFilePath: string): string {
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
export function redactSecretsInFile(filePath: string, secrets: SecretsMap): string | null {
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
export function unredactSecretsInFile(redactedFilePath: string, secrets: SecretsMap): string | null {
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
export function addToGitignore(filePath: string, gitRoot: string): boolean {
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
export function indexFiles(
  searchPath: string,
  secrets: SecretsMap,
  pattern?: string,
  gitRoot?: string,
  specificFiles?: string[]
): IndexedFile[] {
  const indexedFiles: IndexedFile[] = [];
  
  const processFile = (filePath: string) => {
    // Apply pattern filter if provided
    if (pattern && !matchesPattern(filePath, pattern)) {
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const secretIds: string[] = [];
      
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
    } catch (err) {
      // Skip files that can't be read (binary, permission issues, etc.)
    }
  };
  
  // If specific files provided, only process those
  if (specificFiles && specificFiles.length > 0) {
    specificFiles.forEach(processFile);
  } else {
    const stats = fs.statSync(searchPath);
    if (stats.isFile()) {
      processFile(searchPath);
    } else {
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
export function encryptIndexedFiles(indexedFiles: IndexedFile[], secrets: SecretsMap): number {
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
export function decryptIndexedFiles(indexedFiles: IndexedFile[], secrets: SecretsMap): number {
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
