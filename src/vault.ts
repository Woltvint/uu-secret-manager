import { Vault } from 'ansible-vault';
import * as readline from 'readline';
import * as fs from 'fs';

export interface VaultOptions {
  password?: string;
  passwordFile?: string;
}

/**
 * Prompts the user for a password input with hidden characters
 * @param question - The question to display to the user
 * @returns Promise resolving to the entered password
 */
function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    
    stdout.write(question);
    
    // Hide input by not echoing characters
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    
    const onData = (char: string) => {
      // Handle special characters
      if (char === '\u0003') { // Ctrl+C
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.exit(1);
      } else if (char === '\r' || char === '\n') { // Enter
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
      } else if (char === '\u007f' || char === '\b') { // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write('\b \b');
        }
      } else {
        password += char;
        stdout.write('*');
      }
    };
    
    stdin.on('data', onData);
  });
}

/**
 * Reads password from stdin if available (non-TTY mode)
 * @returns Promise resolving to password from stdin or null if TTY
 */
function readPasswordFromStdin(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // Check if stdin is a pipe/file (not a terminal)
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data.trim()));
      process.stdin.on('error', reject);
    } else {
      resolve(null);
    }
  });
}

/**
 * Gets vault password from various sources with priority order:
 * 1. Password file, 2. Password parameter, 3. Stdin, 4. Interactive prompt
 * @param options - Vault options containing password sources
 * @returns Promise resolving to the password
 */
export async function getPassword(options: VaultOptions = {}): Promise<string> {
  // Priority: 1. Password file, 2. Password param, 3. Stdin, 4. Prompt
  
  // 1. Check password file
  if (options.passwordFile) {
    try {
      const password = fs.readFileSync(options.passwordFile, 'utf8').trim();
      return password;
    } catch (err) {
      throw new Error(`Failed to read password file: ${(err as Error).message}`);
    }
  }
  
  // 2. Check password parameter
  if (options.password) {
    return options.password;
  }
  
  // 3. Check stdin (if piped)
  const stdinPassword = await readPasswordFromStdin();
  if (stdinPassword) {
    return stdinPassword;
  }
  
  // 4. Prompt user
  return await promptPassword('Vault password: ');
}

/**
 * Decrypts an ansible-vault encrypted file
 * @param vaultPath - Path to the encrypted vault file
 * @param password - Vault password
 * @returns Promise resolving to decrypted content
 */
export async function decryptVaultFile(vaultPath: string, password: string): Promise<string> {
  try {
    const vault = new Vault({ password });
    const encryptedContent = fs.readFileSync(vaultPath, 'utf8');
    const decrypted = await vault.decrypt(encryptedContent, undefined);
    return decrypted || '';
  } catch (err) {
    throw new Error('Failed to decrypt vault file: ' + (err as Error).message);
  }
}

/**
 * Encrypts data and writes to ansible-vault file
 * @param vaultPath - Path to write the encrypted vault file
 * @param password - Vault password
 * @param data - Data to encrypt
 */
export async function encryptVaultFile(vaultPath: string, password: string, data: string): Promise<void> {
  try {
    const vault = new Vault({ password });
    const encrypted = await vault.encrypt(data, 'default');
    fs.writeFileSync(vaultPath, encrypted, 'utf8');
  } catch (err) {
    throw new Error('Failed to encrypt vault file: ' + (err as Error).message);
  }
}
