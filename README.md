# uu-secret-manager

A Node.js CLI tool to manage secrets in Git repositories using encrypted storage with ansible-vault.

## Features

- Store secrets in an encrypted JSON file using ansible-vault
- Automatically places secrets file in git repository root
- List all stored secrets
- Add new secrets with UUID-based placeholders
- Replace secrets in files with placeholders (`<!secret_{uuid}!>`)
- Reverse placeholders back to original secrets
- Works exclusively with git repositories
- Git pre-commit hook to prevent committing unencrypted secrets

## Prerequisites

- Node.js (v14 or higher)
- Git repository (the tool requires a git repo to work)
- No additional dependencies (uses ansible-vault npm package)

## Installation

```bash
npm install
chmod +x cli.js
```

Or install globally:
```bash
npm install -g .
```

### Install Git Hook (Recommended)

To prevent accidentally committing secrets, install the pre-commit hook:

```bash
npx . install-hook
# or if installed globally:
uu-secret-manager install-hook
```

To remove the hook:

```bash
npx . remove-hook
# or if installed globally:
uu-secret-manager remove-hook
```

This will install a git pre-commit hook that:
- Checks staged files for common secret patterns (passwords, API keys, tokens, etc.)
- Warns you if potential secrets are found
- Suggests using the tool to encrypt them
- Prevents the commit unless you use `--no-verify`

## Usage

All commands work from anywhere within your git repository. The tool automatically finds the repository root.

### Global Options

- `-r, --repo <path>`: Specify a different git repository path (default: current directory)

### Add a Secret

Add a new secret to the encrypted store. The tool will generate a UUID and return the placeholder.
The secrets file will be created in the root of your git repository as `uu-secret-manager.json`.

```bash
uu-secret-manager add "my-secret-password"
# or with npx:
npx uu-secret-manager add "my-secret-password"
```

Output:
```
Vault password: ****
Secret added with placeholder: <!secret_35f8756c-5cf3-455e-b843-b73fa87769c6!>
```

### List Secrets

List all secrets stored in the encrypted file.

```bash
uu-secret-manager list
# or with npx:
npx uu-secret-manager list
```

### Replace Secrets in Files

Replace all secrets in files with their placeholders. You can specify a path (file or directory) within your repo, or omit it to process the entire repository.

```bash
# Replace in entire repository
uu-secret-manager replace

# Replace in specific directory
uu-secret-manager replace ./src

# Replace in specific file
uu-secret-manager replace ./config/database.yml
```

### Reverse Placeholders to Secrets

Restore all placeholders in files back to their original secret values. You can specify a path (file or directory) within your repo, or omit it to process the entire repository.

```bash
# Reverse in entire repository
uu-secret-manager reverse

# Reverse in specific directory
uu-secret-manager reverse ./src

# Reverse in specific file
uu-secret-manager reverse ./config/database.yml
```

## How It Works

1. **Git Repository**: The tool finds the root of your git repository automatically
2. **Encryption**: Secrets are stored in `uu-secret-manager.json` at the repository root, encrypted with ansible-vault
3. **Password Prompt**: The tool prompts for the vault password when accessing secrets
4. **UUID Mapping**: Each secret is mapped to a UUID (e.g., `35f8756c-5cf3-455e-b843-b73fa87769c6`)
5. **Placeholder Format**: Secrets are replaced with `<!secret_{uuid}!>` in files
6. **File Processing**: The tool recursively walks directories and replaces secrets/placeholders in all files

## Security Notes

- The secrets file remains encrypted on disk at all times
- The secrets file is stored at the repository root as `uu-secret-manager.json`
- The vault password is prompted each time the tool runs
- Add `uu-secret-manager.json` to `.gitignore` if you don't want to commit it (though it's encrypted)
- Use the pre-commit hook to prevent accidentally committing unencrypted secrets

## Example Workflow

```bash
# 1. Initialize git repo (if not already done)
git init

# 2. Add secrets to the store
uu-secret-manager add "database-password-123"
# Output: Secret added with placeholder: <!secret_abc-123!>

uu-secret-manager add "api-key-xyz"
# Output: Secret added with placeholder: <!secret_def-456!>

# 3. Replace secrets in your project files
uu-secret-manager replace

# 4. Your files now contain placeholders instead of secrets
# Example: connection_string = "postgres://user:<!secret_abc-123!>@localhost/db"

# 5. Commit the files with placeholders (safe!)
git add .
git commit -m "Use secret placeholders"

# 6. To restore secrets (e.g., before deployment):
uu-secret-manager reverse

# 7. List all stored secrets
uu-secret-manager list

# 8. Work with a different repository
uu-secret-manager -r /path/to/other/repo add "another-secret"
uu-secret-manager -r /path/to/other/repo list
```

## License

MIT

