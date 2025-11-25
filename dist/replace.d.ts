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
export declare function isGitIgnored(filePath: string, gitRoot: string): boolean;
/**
 * Recursively walks a directory and calls callback for each file
 * @param dir - Directory path to walk
 * @param callback - Function to call for each file found
 * @param gitRoot - Optional git root to respect .gitignore
 */
export declare function walkDir(dir: string, callback: (filePath: string) => void, gitRoot?: string): void;
/**
 * Replaces actual secrets in a file with UUID-based placeholders
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any replacements were made, false otherwise
 */
export declare function replaceSecretsInFile(filePath: string, secrets: SecretsMap): boolean;
/**
 * Reverses UUID-based placeholders back to actual secrets in a file
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any replacements were made, false otherwise
 */
export declare function reverseSecretsInFile(filePath: string, secrets: SecretsMap): boolean;
//# sourceMappingURL=replace.d.ts.map