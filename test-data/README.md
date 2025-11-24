# Test Data

This folder contains sample files with secrets for testing the `uu-secret-manager` tool.

## Test Files

- `sample-config.json` - JSON configuration with database and API credentials
- `sample-env.txt` - Environment variables file with various secrets
- `sample-script.sh` - Bash script with embedded secrets
- `subdir/nested-config.yml` - YAML configuration in a subdirectory

## Secrets Used in Test Files

The following secrets appear in the test files:
- `super_secret_password_123` - Database password
- `sk-1234567890abcdefghijklmnop` - API key
- `my_api_secret_key_xyz` - API secret
- `jwt_token_secret_12345` - JWT secret token
- `sk_test_stripe_key_abc123` - Stripe test key

## Testing Workflow

### 1. Add secrets to the store

```bash
# Add each secret
npx . add "super_secret_password_123"
npx . add "sk-1234567890abcdefghijklmnop"
npx . add "my_api_secret_key_xyz"
npx . add "jwt_token_secret_12345"
npx . add "sk_test_stripe_key_abc123"
```

### 2. List stored secrets

```bash
npx . list
```

### 3. Replace secrets in test files

```bash
# Replace all secrets in the test directory
npx . replace ./test
```

### 4. Verify replacement

Check that the test files now contain placeholders like `<!secret_{uuid}!>` instead of the actual secrets.

### 5. Reverse placeholders back to secrets

```bash
# Restore all secrets
npx . reverse ./test
```

### 6. Verify restoration

Check that the test files now contain the original secrets again.

## Expected Behavior

After running `replace`:
- All occurrences of the secrets should be replaced with `<!secret_{uuid}!>`
- Files should remain in the same format (JSON, YAML, shell script, etc.)
- The tool should work recursively in subdirectories

After running `reverse`:
- All placeholders should be replaced back with the original secrets
- Files should be identical to the original state
