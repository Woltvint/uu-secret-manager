#!/usr/bin/env node

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test configuration
const TEST_REPO_DIR = '/tmp/uu-secret-manager-test-repo';
const TEST_DATA_SOURCE = path.join(__dirname, 'test-data');
const CLI_PATH = path.join(__dirname, 'cli.js');
const INSTALL_HOOK_PATH = path.join(__dirname, 'install-hook.js');
const TEST_PASSWORD = 'testpassword';

// Test secrets - these match the secrets in test-data files
const secrets = [
  'super_secret_password_123',
  'sk-1234567890abcdefghijklmnop',
  'my_api_secret_key_xyz',
  'jwt_token_secret_12345',
  'sk_test_stripe_key_abc123'
];

// Helper functions
function execCommand(command, cwd = TEST_REPO_DIR) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    return err.stdout + err.stderr;
  }
}

function execCommandWithPassword(command, password = TEST_PASSWORD, cwd = TEST_REPO_DIR) {
  // Write password to temporary file for testing
  const passwordFile = path.join(cwd, '.test-password');
  fs.writeFileSync(passwordFile, password);
  
  try {
    // Use -f option to read password from file
    const result = execSync(`${command} -f ${passwordFile}`, {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    fs.unlinkSync(passwordFile);
    return result;
  } catch (err) {
    if (fs.existsSync(passwordFile)) {
      fs.unlinkSync(passwordFile);
    }
    // Combine all possible output sources
    const output = [
      err.stdout || '',
      err.stderr || '',
      err.message || ''
    ].join('\\n');
    return output;
  }
}

function setupTestRepo() {
  // Clean up if exists
  if (fs.existsSync(TEST_REPO_DIR)) {
    fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true });
  }
  
  // Create fresh test repo
  fs.mkdirSync(TEST_REPO_DIR, { recursive: true });
  execSync('git init', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
  
  // Copy test data
  copyTestData(TEST_DATA_SOURCE, TEST_REPO_DIR);
  
  console.log(`Test repository created at: ${TEST_REPO_DIR}`);
}

function copyTestData(src, dest) {
  const items = fs.readdirSync(src, { withFileTypes: true });
  
  for (const item of items) {
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);
    
    // Skip backup directories and gitignore
    if (item.name === 'backup' || item.name === '.gitignore' || item.name === 'README.md') {
      continue;
    }
    
    if (item.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTestData(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src, { withFileTypes: true });
  for (const item of items) {
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);
    
    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'backup') {
      copyDir(srcPath, destPath);
    } else if (item.isFile() && !item.name.includes('uu-secret-manager')) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanup() {
  if (fs.existsSync(TEST_REPO_DIR)) {
    fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true });
    console.log('Cleaned up test repository');
  }
}

// Main test suite
describe('uu-secret-manager', () => {
  before(() => {
    setupTestRepo();
  });

  after(() => {
    cleanup();
  });

  describe('Secret Management', () => {
    test('should add secrets via stdin password', () => {
      // Test stdin password method
      const secret = 'test_stdin_secret';
      const output = execSync(`echo "${TEST_PASSWORD}" | node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`, {
        encoding: 'utf8',
        cwd: TEST_REPO_DIR,
        shell: '/bin/bash',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.ok(output.includes('Secret added'), 'Should add secret via stdin');
    });

    test('should add secrets via password file', () => {
      // Test password file method (this is what all other tests use)
      const secret = 'test_file_secret';
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`);
      assert.ok(output.includes('Secret added'), 'Should add secret via password file');
    });

    test('should add secrets via password parameter', () => {
      // Test password parameter method
      const secret = 'test_param_secret';
      const output = execSync(`node ${CLI_PATH} -r ${TEST_REPO_DIR} -p ${TEST_PASSWORD} add "${secret}"`, {
        encoding: 'utf8',
        cwd: TEST_REPO_DIR,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.ok(output.includes('Secret added'), 'Should add secret via password parameter');
    });

    test('should add secrets to the store', () => {
      for (const secret of secrets) {
        const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`);
        assert.ok(!output.includes('Error'), 'Should not have errors');
      }
      
      // Verify secrets file exists
      const secretsFile = path.join(TEST_REPO_DIR, 'uu-secret-manager.json');
      assert.ok(fs.existsSync(secretsFile), 'Secrets file should exist');
    });

    test('should list all secrets', () => {
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} list`);
      
      for (const secret of secrets) {
        assert.ok(output.includes(secret), `Should list secret: ${secret}`);
      }
    });

    test('should handle duplicate secrets with different UUIDs', () => {
      const firstSecret = secrets[0];
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${firstSecret}"`);
      
      // Should fail because duplicate
      assert.ok(output.toLowerCase().includes('error') || output.toLowerCase().includes('already exists'), 
        'Should prevent duplicate secrets');
    });

    test('should reject wrong password', () => {
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} list`, 'wrongpassword');
      // Check for error indicators - ansible-vault returns various error messages
      const hasError = output.toLowerCase().includes('error') || 
                      output.toLowerCase().includes('decrypt') || 
                      output.toLowerCase().includes('integrity') ||
                      output.toLowerCase().includes('fail');
      assert.ok(hasError, `Should reject wrong password. Got output: ${output}`);
    });

    test('should add secret with description', () => {
      const secret = 'secret_with_description';
      const description = 'This is a test description';
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}" "${description}"`);
      
      assert.ok(output.includes('Secret added'), 'Should add secret');
      assert.ok(output.includes(description), 'Should show description in output');
      
      // Verify description is stored
      const listOutput = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} list`);
      assert.ok(listOutput.includes(description), 'Description should appear in list');
    });

    test('should prevent duplicate secrets', () => {
      const duplicate = secrets[0];
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${duplicate}"`);
      
      assert.ok(output.toLowerCase().includes('error') || output.toLowerCase().includes('already exists'), 
        'Should prevent adding duplicate secret');
    });
  });

  describe('Replace and Reverse Operations', () => {
    let backupDir;

    before(() => {
      backupDir = path.join(TEST_REPO_DIR, 'backup');
      copyDir(TEST_REPO_DIR, backupDir);
    });

    test('should replace secrets with placeholders', () => {
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} replace`);
      assert.ok(!output.includes('Error'), 'Should not have errors');
    });

    test('should have placeholders in files', () => {
      let foundPlaceholders = false;
      let checkedFiles = [];
      
      const checkDir = (dir) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory() && file.name !== 'backup' && !file.name.startsWith('.')) {
            checkDir(fullPath);
          } else if (file.isFile() && !file.name.includes('README') && !file.name.includes('uu-secret-manager')) {
            checkedFiles.push(fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('<!secret_')) {
              foundPlaceholders = true;
            }
          }
        }
      };
      
      checkDir(TEST_REPO_DIR);
      assert.ok(foundPlaceholders, `Should find placeholders in files. Checked: ${checkedFiles.join(', ')}`);
    });

    test('should not have original secrets in files', () => {
      let foundSecrets = false;
      
      const checkDir = (dir) => {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory() && file.name !== 'backup' && !file.name.startsWith('.')) {
            checkDir(fullPath);
          } else if (file.isFile() && !file.name.includes('README') && !file.name.includes('uu-secret-manager')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (secrets.some(s => content.includes(s))) {
              foundSecrets = true;
            }
          }
        }
      };
      
      checkDir(TEST_REPO_DIR);
      assert.ok(!foundSecrets, 'Should not find original secrets in files');
    });

    test('should reverse placeholders back to secrets', () => {
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} reverse`);
      assert.ok(!output.includes('Error'), 'Should not have errors');
    });

    test('should restore original content after reverse', () => {
      const verifyRestore = (dir, backupDir) => {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          const backupPath = path.join(backupDir, file.name);
          
          if (file.isDirectory() && file.name !== 'backup' && !file.name.startsWith('.')) {
            verifyRestore(fullPath, backupPath);
          } else if (file.isFile() && !file.name.includes('README') && !file.name.includes('uu-secret-manager')) {
            if (fs.existsSync(backupPath)) {
              const content = fs.readFileSync(fullPath, 'utf8');
              const backupContent = fs.readFileSync(backupPath, 'utf8');
              assert.strictEqual(content, backupContent, `File ${file.name} should match backup`);
            }
          }
        }
      };
      
      verifyRestore(TEST_REPO_DIR, backupDir);
    });

    test('should handle multiple occurrences in single file', () => {
      const multiFile = path.join(TEST_REPO_DIR, 'multi-secret.txt');
      const testSecret = secrets[0];
      fs.writeFileSync(multiFile, `${testSecret}\n${testSecret}\n${testSecret}\n`);
      
      execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} replace ${multiFile}`);
      
      const content = fs.readFileSync(multiFile, 'utf8');
      const placeholderCount = (content.match(/<!secret_/g) || []).length;
      
      assert.strictEqual(placeholderCount, 3, 'Should replace all 3 occurrences');
      assert.ok(!content.includes(testSecret), 'Should not contain original secret');
      
      fs.unlinkSync(multiFile);
    });

    test('should handle file with no placeholders on reverse', () => {
      const noPHFile = path.join(TEST_REPO_DIR, 'no-placeholders.txt');
      fs.writeFileSync(noPHFile, 'just regular text');
      
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} reverse ${noPHFile}`);
      assert.ok(output.includes('No placeholders reversed'), 'Should indicate no placeholders');
      
      fs.unlinkSync(noPHFile);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty directory', () => {
      const emptyDir = path.join(TEST_REPO_DIR, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      
      const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} replace ${emptyDir}`);
      assert.ok(output.includes('No secrets replaced'), 'Should handle empty directory');
      
      fs.rmdirSync(emptyDir);
    });

    test('should handle non-existent repository', () => {
      const output = execCommand(`node ${CLI_PATH} -r /tmp/nonexistent-repo-xyz list 2>&1`);
      assert.ok(output.includes('Error') && (output.includes('Not in a git repository') || output.includes('ENOENT')), 
        'Should error on non-existent repository');
    });

    test('should work with different repository', () => {
      const newRepoDir = '/tmp/uu-secret-manager-test-repo-2';
      
      try {
        if (fs.existsSync(newRepoDir)) {
          fs.rmSync(newRepoDir, { recursive: true });
        }
        
        fs.mkdirSync(newRepoDir, { recursive: true });
        execSync('git init', { cwd: newRepoDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: newRepoDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: newRepoDir, stdio: 'ignore' });
        
        execCommandWithPassword(`node ${CLI_PATH} -r ${newRepoDir} add "new_secret_123"`, TEST_PASSWORD, newRepoDir);
        
        const newSecretsFile = path.join(newRepoDir, 'uu-secret-manager.json');
        assert.ok(fs.existsSync(newSecretsFile), 'Should create secrets file in new repo');
        
        const content = execCommandWithPassword(`node ${CLI_PATH} -r ${newRepoDir} list`, TEST_PASSWORD, newRepoDir);
        assert.ok(content.includes('new_secret_123'), 'Should list secret in new repo');
      } finally {
        if (fs.existsSync(newRepoDir)) {
          fs.rmSync(newRepoDir, { recursive: true });
        }
      }
    });
  });

  describe('Git Hook', () => {
    test('should install git hook', () => {
      const output = execCommand(`node ${CLI_PATH} -r ${TEST_REPO_DIR} install-hook`);
      
      const hookPath = path.join(TEST_REPO_DIR, '.git', 'hooks', 'pre-commit');
      assert.ok(fs.existsSync(hookPath), 'Hook file should exist');
      
      // Check if it's executable
      const stats = fs.statSync(hookPath);
      assert.ok(stats.mode & 0o111, 'Hook should be executable');
    });

    test('should detect secrets in staged files', () => {
      // Create a file with a secret pattern that matches the hook patterns
      const secretFile = path.join(TEST_REPO_DIR, 'test-secret.txt');
      fs.writeFileSync(secretFile, 'password="mysecretpassword123"\nAPI_KEY="sk-1234567890abcdef"');
      
      // Stage the file
      execSync('git add test-secret.txt', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
      
      // Try to commit (should fail)
      let commitFailed = false;
      let errorOutput = '';
      try {
        execSync('git commit -m "test commit"', { 
          cwd: TEST_REPO_DIR, 
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf8'
        });
      } catch (err) {
        commitFailed = true;
        errorOutput = (err.stderr || '') + (err.stdout || '') + (err.message || '');
      }
      
      assert.ok(commitFailed, `Commit should have been blocked by pre-commit hook. Error: ${errorOutput}`);
      // The hook blocks the commit, which is what we want to test
      // Error output varies by system, so just check that commit failed
      
      // Clean up
      try {
        execSync('git reset HEAD test-secret.txt', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
      } catch (e) {
        // Ignore error if already reset
      }
      if (fs.existsSync(secretFile)) {
        fs.unlinkSync(secretFile);
      }
    });

    test('should allow commit without secrets', () => {
      // Create a file without secrets
      const safeFile = path.join(TEST_REPO_DIR, 'safe-file.txt');
      fs.writeFileSync(safeFile, 'This is a safe file with no secrets\nJust some regular text');
      
      // Stage and commit
      execSync('git add safe-file.txt', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
      
      try {
        execSync('git commit -m "safe commit"', { 
          cwd: TEST_REPO_DIR, 
          stdio: 'pipe'
        });
        assert.ok(true, 'Commit should succeed');
      } catch (err) {
        assert.fail(`Commit should not have been blocked: ${err.stderr}`);
      }
    });

    test('should allow commit with placeholders', () => {
      // Add secrets first
      for (const secret of secrets.slice(0, 2)) {
        execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`);
      }
      
      // Create a file and replace secrets
      const testFile = path.join(TEST_REPO_DIR, 'with-placeholders.txt');
      fs.writeFileSync(testFile, `password=${secrets[0]}\nkey=${secrets[1]}`);
      
      execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} replace ${testFile}`);
      
      // Stage and commit (should succeed because only placeholders, not secrets)
      execSync('git add with-placeholders.txt', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
      
      try {
        execSync('git commit -m "commit with placeholders"', { 
          cwd: TEST_REPO_DIR, 
          stdio: 'pipe'
        });
        assert.ok(true, 'Commit with placeholders should succeed');
      } catch (err) {
        assert.fail(`Commit with placeholders should not have been blocked: ${err.stderr}`);
      }
    });

    test('should remove git hook', () => {
      const output = execCommand(`node ${CLI_PATH} -r ${TEST_REPO_DIR} remove-hook`);
      
      const hookPath = path.join(TEST_REPO_DIR, '.git', 'hooks', 'pre-commit');
      assert.ok(!fs.existsSync(hookPath), 'Hook file should be removed');
    });

    test('should allow commit after hook removal', () => {
      // Create a file with secrets
      const secretFile = path.join(TEST_REPO_DIR, 'another-secret.txt');
      fs.writeFileSync(secretFile, 'password=shouldnotbechecked');
      
      // Stage and commit (should succeed because hook is removed)
      execSync('git add another-secret.txt', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
      
      try {
        execSync('git commit -m "commit after hook removal"', { 
          cwd: TEST_REPO_DIR, 
          stdio: 'pipe'
        });
        assert.ok(true, 'Commit should succeed after hook removal');
      } catch (err) {
        assert.fail(`Commit should not be blocked after hook removal: ${err.stderr}`);
      }
    });
  });
});
