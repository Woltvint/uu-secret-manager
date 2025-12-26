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
exports.getPassword = getPassword;
exports.decryptVaultFile = decryptVaultFile;
exports.encryptVaultFile = encryptVaultFile;
const ansible_vault_1 = require("ansible-vault");
const fs = __importStar(require("fs"));
/**
 * Prompts the user for a password input with hidden characters
 * @param question - The question to display to the user
 * @returns Promise resolving to the entered password
 */
function promptPassword(question) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const stdout = process.stdout;
        stdout.write(question);
        // Hide input by not echoing characters
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let password = '';
        const onData = (char) => {
            // Handle special characters
            if (char === '\u0003') { // Ctrl+C
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.exit(1);
            }
            else if (char === '\r' || char === '\n') { // Enter
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                stdout.write('\n');
                resolve(password);
            }
            else if (char === '\u007f' || char === '\b') { // Backspace
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    stdout.write('\b \b');
                }
            }
            else {
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
function readPasswordFromStdin() {
    return new Promise((resolve, reject) => {
        // Check if stdin is a pipe/file (not a terminal)
        if (!process.stdin.isTTY) {
            let data = '';
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve(data.trim()));
            process.stdin.on('error', reject);
        }
        else {
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
async function getPassword(options = {}) {
    // Priority: 1. Password file, 2. Password param, 3. Stdin, 4. Prompt
    // 1. Check password file
    if (options.passwordFile) {
        try {
            const password = fs.readFileSync(options.passwordFile, 'utf8').trim();
            return password;
        }
        catch (err) {
            throw new Error(`Failed to read password file: ${err.message}`);
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
async function decryptVaultFile(vaultPath, password) {
    try {
        const vault = new ansible_vault_1.Vault({ password });
        const encryptedContent = fs.readFileSync(vaultPath, 'utf8');
        const decrypted = await vault.decrypt(encryptedContent, undefined);
        return decrypted || '';
    }
    catch (err) {
        throw new Error('Failed to decrypt vault file: ' + err.message);
    }
}
/**
 * Encrypts data and writes to ansible-vault file
 * @param vaultPath - Path to write the encrypted vault file
 * @param password - Vault password
 * @param data - Data to encrypt
 */
async function encryptVaultFile(vaultPath, password, data) {
    try {
        const vault = new ansible_vault_1.Vault({ password });
        const encrypted = await vault.encrypt(data, 'default');
        fs.writeFileSync(vaultPath, encrypted, 'utf8');
    }
    catch (err) {
        throw new Error('Failed to encrypt vault file: ' + err.message);
    }
}
//# sourceMappingURL=vault.js.map