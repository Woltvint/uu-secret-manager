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
