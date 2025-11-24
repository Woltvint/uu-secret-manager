# Secret Manager

A Node.js CLI tool to manage secrets in files and folders using encrypted storage with ansible-vault.

## Features

- Store secrets in an encrypted JSON file using ansible-vault
- List all stored secrets
- Add new secrets with UUID-based placeholders
- Replace secrets in files with placeholders (`<!secret_{uuid}!>`)
- Reverse placeholders back to original secrets
- Configurable secrets file path

## Prerequisites

- Node.js (v14 or higher)
- ansible-vault installed and available in PATH

## Installation

```bash
npm install
chmod +x cli.js
```

Or install globally:
```bash
npm install -g .
```

## Usage

### Add a Secret

Add a new secret to the encrypted store. The tool will generate a UUID and return the placeholder.

```bash
node cli.js add "my-secret-password"
# or if installed globally:
secret-manager add "my-secret-password"
```

Output:
```
Vault password: ****
Secret added with placeholder: <!secret_35f8756c-5cf3-455e-b843-b73fa87769c6!>
```

### List Secrets

List all secrets stored in the encrypted file.

```bash
node cli.js list
# With custom secrets file path:
node cli.js list -s /path/to/secrets.json
```

### Replace Secrets in Files

Replace all secrets in files within a directory (recursively) with their placeholders.

```bash
node cli.js replace /path/to/directory
# With custom secrets file path:
node cli.js replace /path/to/directory -s /path/to/secrets.json
```

### Reverse Placeholders to Secrets

Restore all placeholders in files back to their original secret values.

```bash
node cli.js reverse /path/to/directory
# With custom secrets file path:
node cli.js reverse /path/to/directory -s /path/to/secrets.json
```

## Options

- `-s, --secrets <path>`: Path to the encrypted secrets.json file (default: `secrets.json` in current directory)

## How It Works

1. **Encryption**: Secrets are stored in a JSON file encrypted with ansible-vault
2. **Password Prompt**: The tool prompts for the vault password when accessing secrets
3. **UUID Mapping**: Each secret is mapped to a UUID (e.g., `35f8756c-5cf3-455e-b843-b73fa87769c6`)
4. **Placeholder Format**: Secrets are replaced with `<!secret_{uuid}!>` in files
5. **File Processing**: The tool recursively walks directories and replaces secrets/placeholders in all files

## Security Notes

- The secrets file remains encrypted on disk at all times
- Temporary files used for decryption are deleted immediately after use
- The vault password is prompted each time the tool runs
- Do not commit the encrypted secrets.json file to version control unless intended

## Example Workflow

```bash
# 1. Add secrets to the store
node cli.js add "database-password-123"
# Output: Secret added with placeholder: <!secret_abc-123!>

node cli.js add "api-key-xyz"
# Output: Secret added with placeholder: <!secret_def-456!>

# 2. Replace secrets in your project files
node cli.js replace ./src

# 3. Your files now contain placeholders instead of secrets
# Example: connection_string = "postgres://user:<!secret_abc-123!>@localhost/db"

# 4. To restore secrets (e.g., before deployment):
node cli.js reverse ./src

# 5. List all stored secrets
node cli.js list
```

## License

MIT

