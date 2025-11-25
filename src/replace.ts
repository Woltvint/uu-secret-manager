import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SecretData {
  secret: string;
  description?: string;
  created?: string;
}

export type SecretsMap = Record<string, SecretData | string>;

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
 * Replaces actual secrets in a file with UUID-based placeholders
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any replacements were made, false otherwise
 */
export function replaceSecretsInFile(filePath: string, secrets: SecretsMap): boolean {
  let content = fs.readFileSync(filePath, 'utf8');
  let replaced = false;
  
  Object.entries(secrets).forEach(([uuid, data]) => {
    // Handle both old format (string) and new format (object)
    const secret = typeof data === 'string' ? data : data.secret;
    const placeholder = `<!secret_${uuid}!>`;
    
    if (content.includes(secret)) {
      content = content.split(secret).join(placeholder);
      replaced = true;
    }
  });
  
  if (replaced) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

/**
 * Reverses UUID-based placeholders back to actual secrets in a file
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any replacements were made, false otherwise
 */
export function reverseSecretsInFile(filePath: string, secrets: SecretsMap): boolean {
  let content = fs.readFileSync(filePath, 'utf8');
  let replaced = false;
  
  Object.entries(secrets).forEach(([uuid, data]) => {
    // Handle both old format (string) and new format (object)
    const secret = typeof data === 'string' ? data : data.secret;
    const placeholder = `<!secret_${uuid}!>`;
    
    if (content.includes(placeholder)) {
      content = content.split(placeholder).join(secret);
      replaced = true;
    }
  });
  
  if (replaced) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}
