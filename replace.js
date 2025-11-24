const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  });
}

function replaceSecretsInFile(filePath, secrets) {
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

function reverseSecretsInFile(filePath, secrets) {
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

module.exports = {
  walkDir,
  replaceSecretsInFile,
  reverseSecretsInFile
};
