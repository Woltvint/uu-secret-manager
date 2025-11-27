# repo-secret-manager

A Node.js CLI tool to manage secrets in Git repositories using encrypted storage with ansible-vault. Written in TypeScript for type safety and better developer experience.

## Features

- Store secrets in an encrypted JSON file using ansible-vault
- Automatically places secrets file in git repository root
- List all stored secrets
- Export secrets to CSV for backup or migration
- Add new secrets with UUID-based placeholders
- **Index files** for dramatically faster encrypt/decrypt operations
- Encrypt secrets in files with placeholders (`<!secret_{uuid}!>`)
- Decrypt placeholders back to original secrets
- Filter indexing by file patterns (e.g., `*.js`, `(*.js|*.json)`)
- Works exclusively with git repositories
- Git pre-commit hook to prevent committing unencrypted secrets
- **TypeScript** for enhanced type safety and developer experience

## Prerequisites

- Node.js (v14 or higher)
- Git repository (the tool requires a git repo to work)
- No additional dependencies (uses ansible-vault npm package)

## Installation

### Run directly from GitHub (no installation needed)

You can run the tool directly from GitHub using npx:

```bash
npx github:Woltvint/repo-secret-manager <command>
```

Examples:
```bash
npx github:Woltvint/repo-secret-manager add "my-secret"
npx github:Woltvint/repo-secret-manager list
npx github:Woltvint/repo-secret-manager encrypt
```

### Install locally

```bash
npm install
chmod +x cli.js
```

### Install globally

```bash
npm install -g .
```

### Install Git Hook (Recommended)

To prevent accidentally committing secrets, install the pre-commit hook:

```bash
npx . install-hook
# or if installed globally:
repo-secret-manager install-hook
```

To remove the hook:

```bash
npx . remove-hook
# or if installed globally:
repo-secret-manager remove-hook
```

This will install a git pre-commit hook that:
- Automatically reindexes git-modified files before checking (keeps index up-to-date)
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
The secrets file will be created in the root of your git repository as `repo-secret-manager.json`.

```bash
repo-secret-manager add "my-secret-password"
# or with npx from npm:
npx repo-secret-manager add "my-secret-password"
# or directly from GitHub:
npx github:Woltvint/repo-secret-manager add "my-secret-password"
```

Output:
```
Vault password: ****
Secret added with placeholder: <!secret_35f8756c-5cf3-455e-b843-b73fa87769c6!>
```

### List Secrets

List all secrets stored in the encrypted file.

```bash
repo-secret-manager list
# or with npx from npm:
npx repo-secret-manager list
# or directly from GitHub:
npx github:Woltvint/repo-secret-manager list
```

### Export Secrets to CSV

Export all secrets to a CSV file for backup or migration purposes.

```bash
repo-secret-manager export ./secrets-backup.csv
# or with npx from npm:
npx repo-secret-manager export ./secrets-backup.csv
# or directly from GitHub:
npx github:Woltvint/repo-secret-manager export ./secrets-backup.csv
```

The CSV file will contain columns: UUID, Secret, Description, Created, Placeholder

### Index Files for Faster Operations

Index files containing secrets to dramatically speed up encrypt/decrypt operations. The index stores which files contain secrets, so subsequent encrypt/decrypt commands only process those files instead of scanning the entire repository.

**Default Behavior**: By default, the index command only indexes git-modified files (staged and unstaged changes). This makes it fast and efficient for incremental updates. Use `--all` to index all files in the repository.

```bash
# Index git-modified files (default - fast incremental update)
repo-secret-manager index

# Index all files in repository
repo-secret-manager index --all

# Index only JavaScript files that are modified
repo-secret-manager index . "*.js"

# Index all JavaScript files (not just modified)
repo-secret-manager index . "*.js" --all

# Index multiple file types (git-modified only by default)
repo-secret-manager index . "(*.js|*.json|*.yml)"

# Index specific directory (all files)
repo-secret-manager index ./src --all
```

**Performance**: After indexing, encrypt/decrypt operations only process indexed files, making them significantly faster for large repositories.

**Incremental Updates**: The default git-modified behavior makes it easy to keep your index up-to-date by only re-indexing files that have changed. When using git-modified mode, the tool merges results with the existing index, preserving entries for files that haven't been modified. Use `--all` to completely rebuild the index from scratch.

### Encrypt Secrets in Files

Encrypt all secrets in files with their placeholders. You can specify a path (file or directory) within your repo, or omit it to process the entire repository.

**Note**: The encrypt command respects `.gitignore` and will skip files that are ignored by git. If an index exists, it will use the indexed files for faster operation.

```bash
# Encrypt in entire repository (uses index if available)
repo-secret-manager encrypt

# Encrypt in specific directory
repo-secret-manager encrypt ./src

# Encrypt in specific file
repo-secret-manager encrypt ./config/database.yml
```

### Decrypt Placeholders to Secrets

Restore all placeholders in files back to their original secret values. You can specify a path (file or directory) within your repo, or omit it to process the entire repository.

**Note**: The decrypt command respects `.gitignore` and will skip files that are ignored by git. If an index exists, it will use the indexed files for faster operation.

```bash
# Decrypt in entire repository (uses index if available)
repo-secret-manager decrypt

# Decrypt in specific directory
repo-secret-manager decrypt ./src

# Decrypt in specific file
repo-secret-manager decrypt ./config/database.yml
```

## How It Works

1. **Git Repository**: The tool finds the root of your git repository automatically
2. **Encryption**: Secrets are stored in `repo-secret-manager.json` at the repository root, encrypted with ansible-vault
3. **Password Prompt**: The tool prompts for the vault password when accessing secrets
4. **UUID Mapping**: Each secret is mapped to a UUID (e.g., `35f8756c-5cf3-455e-b843-b73fa87769c6`)
5. **Placeholder Format**: Secrets are encrypted with `<!secret_{uuid}!>` in files
6. **File Processing**: The tool recursively walks directories and encrypts/decrypts secrets/placeholders in all files

## Security Notes

- The secrets file remains encrypted on disk at all times
- The secrets file is stored at the repository root as `repo-secret-manager.json`
- The vault password is prompted each time the tool runs
- Add `repo-secret-manager.json` to `.gitignore` if you don't want to commit it (though it's encrypted)
- Use the pre-commit hook to prevent accidentally committing unencrypted secrets

## Example Workflow

```bash
# 1. Initialize git repo (if not already done)
git init

# 2. Add secrets to the store
repo-secret-manager add "database-password-123"
# Output: Secret added with placeholder: <!secret_abc-123!>

repo-secret-manager add "api-key-xyz"
# Output: Secret added with placeholder: <!secret_def-456!>

# 3. Index files for faster operations (optional but recommended)
repo-secret-manager index . "(*.js|*.json|*.yml)"

# 4. Encrypt secrets in your project files
repo-secret-manager encrypt

# 5. Your files now contain placeholders instead of secrets
# Example: connection_string = "postgres://user:<!secret_abc-123!>@localhost/db"

# 6. Commit the files with placeholders (safe!)
git add .
git commit -m "Use secret placeholders"

# 7. To restore secrets (e.g., before deployment):
repo-secret-manager decrypt

# 8. List all stored secrets
repo-secret-manager list

# 9. Export secrets to CSV for backup
repo-secret-manager export ./secrets-backup.csv

# 10. Work with a different repository
repo-secret-manager -r /path/to/other/repo add "another-secret"
repo-secret-manager -r /path/to/other/repo list
```

## License

MIT

## Development

This project is written in TypeScript. The source files are in the `src/` directory and compiled to JavaScript in the `dist/` directory.

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Testing

```bash
npm test
```

### Project Structure

```
src/
├── cli.ts          # Main CLI entry point
├── vault.ts        # Vault encryption/decryption functions
├── replace.ts      # File replacement operations
├── install-hook.ts # Git hook installer
└── test.ts         # Test suite
```

