const { Vault } = require('ansible-vault');
const readline = require('readline');
const fs = require('fs');

function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
    rl.question(question, (password) => {
      rl.close();
      resolve(password);
    });
  });
}

function readPasswordFromStdin() {
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

async function getPassword(options = {}) {
  // Priority: 1. Password file, 2. Password param, 3. Stdin, 4. Prompt
  
  // 1. Check password file
  if (options.passwordFile) {
    try {
      const password = fs.readFileSync(options.passwordFile, 'utf8').trim();
      return password;
    } catch (err) {
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

async function decryptVaultFile(vaultPath, password) {
  try {
    const vault = new Vault({ password });
    const encryptedContent = fs.readFileSync(vaultPath, 'utf8');
    const decrypted = await vault.decrypt(encryptedContent);
    return decrypted;
  } catch (err) {
    throw new Error('Failed to decrypt vault file: ' + err.message);
  }
}

async function encryptVaultFile(vaultPath, password, data) {
  try {
    const vault = new Vault({ password });
    const encrypted = await vault.encrypt(data);
    fs.writeFileSync(vaultPath, encrypted, 'utf8');
  } catch (err) {
    throw new Error('Failed to encrypt vault file: ' + err.message);
  }
}

module.exports = {
  promptPassword,
  getPassword,
  decryptVaultFile,
  encryptVaultFile
};
