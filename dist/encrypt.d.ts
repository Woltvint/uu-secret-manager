export interface SecretData {
    secret: string;
    description?: string;
    created?: string;
    name?: string;
}
export interface IndexedFile {
    path: string;
    secretIds: string[];
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
export declare function getPlaceholderId(id: string, data: SecretData | string): string;
/**
 * Generates a placeholder string for a secret
 * @param id - UUID or key for the secret
 * @param data - Secret data (string or SecretData object)
 * @returns Placeholder string in format <!secret_{id}!
 */
export declare function generatePlaceholder(id: string, data: SecretData | string): string;
/**
 * Finds a secret entry by its custom name
 * @param secrets - Map of secrets
 * @param name - Custom name to search for
 * @returns Tuple of [id, data] if found, null otherwise
 */
export declare function findSecretByName(secrets: SecretsMap, name: string): [string, SecretData | string] | null;
/**
 * Checks if a name already exists in the secrets map
 * @param secrets - Map of secrets
 * @param name - Custom name to check
 * @returns true if name exists, false otherwise
 */
export declare function nameExists(secrets: SecretsMap, name: string): boolean;
/**
 * Finds a secret by either its custom name or UUID
 * @param secrets - Map of secrets
 * @param identifier - Custom name or UUID to search for
 * @returns Tuple of [id, data] if found, null otherwise
 */
export declare function findSecretByIdentifier(secrets: SecretsMap, identifier: string): [string, SecretData | string] | null;
/**
 * Gets list of modified files in git (staged and unstaged)
 * @param gitRoot - Root directory of the git repository
 * @returns Array of absolute file paths that have been modified
 */
export declare function getGitModifiedFiles(gitRoot: string): string[];
/**
 * Checks if a file path matches a glob pattern
 * @param filePath - Path to check
 * @param pattern - Glob pattern (e.g., "*.js" or "(*.js|*.json)")
 * @returns true if the file matches the pattern
 */
export declare function matchesPattern(filePath: string, pattern: string): boolean;
/**
 * Checks if a file is ignored by git
 * @param filePath - Path to the file to check
 * @param gitRoot - Root directory of the git repository
 * @returns true if the file is ignored by git, false otherwise
 */
export declare function isGitIgnored(filePath: string, gitRoot: string): boolean;
/**
 * Recursively walks a directory and calls callback for each file
 * @param dir - Directory path to walk
 * @param callback - Function to call for each file found
 * @param gitRoot - Optional git root to respect .gitignore
 */
export declare function walkDir(dir: string, callback: (filePath: string) => void, gitRoot?: string): void;
/**
 * Encrypts actual secrets in a file with UUID-based placeholders
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any changes were made, false otherwise
 */
export declare function encryptSecretsInFile(filePath: string, secrets: SecretsMap): boolean;
/**
 * Decrypts UUID-based placeholders back to actual secrets in a file
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any changes were made, false otherwise
 */
export declare function decryptSecretsInFile(filePath: string, secrets: SecretsMap): boolean;
/**
 * Indexes files containing secrets
 * @param searchPath - Path to search for files
 * @param secrets - Map of UUIDs to secret data
 * @param pattern - Optional glob pattern to filter files (e.g., "*.js" or "(*.js|*.json)")
 * @param gitRoot - Optional git root to respect .gitignore
 * @param specificFiles - Optional array of specific files to index (e.g., git modified files)
 * @returns Array of indexed files with their secret IDs
 */
export declare function indexFiles(searchPath: string, secrets: SecretsMap, pattern?: string, gitRoot?: string, specificFiles?: string[]): IndexedFile[];
/**
 * Encrypts secrets only in indexed files
 * @param indexedFiles - Array of indexed files to process
 * @param secrets - Map of UUIDs to secret data
 * @returns Number of files that were encrypted
 */
export declare function encryptIndexedFiles(indexedFiles: IndexedFile[], secrets: SecretsMap): number;
/**
 * Decrypts secrets only in indexed files
 * @param indexedFiles - Array of indexed files to process
 * @param secrets - Map of UUIDs to secret data
 * @returns Number of files that were decrypted
 */
export declare function decryptIndexedFiles(indexedFiles: IndexedFile[], secrets: SecretsMap): number;
//# sourceMappingURL=encrypt.d.ts.map