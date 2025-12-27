export interface VaultOptions {
    password?: string;
    passwordFile?: string;
    vaultExists?: boolean;
}
/**
 * Gets vault password from various sources with priority order:
 * 1. Password file, 2. Password parameter, 3. Stdin, 4. Interactive prompt
 * @param options - Vault options containing password sources
 * @param vaultPath - Optional path to vault file for validation
 * @returns Promise resolving to the password
 */
export declare function getPassword(options?: VaultOptions, vaultPath?: string): Promise<string>;
/**
 * Decrypts an ansible-vault encrypted file
 * @param vaultPath - Path to the encrypted vault file
 * @param password - Vault password
 * @returns Promise resolving to decrypted content
 */
export declare function decryptVaultFile(vaultPath: string, password: string): Promise<string>;
/**
 * Encrypts data and writes to ansible-vault file
 * @param vaultPath - Path to write the encrypted vault file
 * @param password - Vault password
 * @param data - Data to encrypt
 */
export declare function encryptVaultFile(vaultPath: string, password: string, data: string): Promise<void>;
//# sourceMappingURL=vault.d.ts.map