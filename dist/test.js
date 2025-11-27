#!/usr/bin/env node
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
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// Test configuration
const TEST_REPO_DIR = '/tmp/repo-secret-manager-test-repo';
const TEST_DATA_SOURCE = path.join(__dirname, '..', 'test-data');
const CLI_PATH = path.join(__dirname, 'cli.js');
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
        return (0, child_process_1.execSync)(command, {
            encoding: 'utf8',
            cwd,
            stdio: ['pipe', 'pipe', 'pipe']
        });
    }
    catch (err) {
        return (err.stdout || '') + (err.stderr || '');
    }
}
function execCommandWithPassword(command, password = TEST_PASSWORD, cwd = TEST_REPO_DIR) {
    const passwordFile = path.join(cwd, '.test-password');
    fs.writeFileSync(passwordFile, password);
    try {
        const result = (0, child_process_1.execSync)(`${command} -f ${passwordFile}`, {
            encoding: 'utf8',
            cwd,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        fs.unlinkSync(passwordFile);
        return result;
    }
    catch (err) {
        if (fs.existsSync(passwordFile)) {
            fs.unlinkSync(passwordFile);
        }
        return [err.stdout || '', err.stderr || '', err.message || ''].join('\n');
    }
}
function setupTestRepo() {
    if (fs.existsSync(TEST_REPO_DIR)) {
        fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_REPO_DIR, { recursive: true });
    (0, child_process_1.execSync)('git init', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
    (0, child_process_1.execSync)('git config user.email "test@example.com"', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
    (0, child_process_1.execSync)('git config user.name "Test User"', { cwd: TEST_REPO_DIR, stdio: 'ignore' });
    copyTestData(TEST_DATA_SOURCE, TEST_REPO_DIR);
    console.log(`Test repository created at: ${TEST_REPO_DIR}`);
}
function copyTestData(src, dest) {
    const items = fs.readdirSync(src, { withFileTypes: true });
    for (const item of items) {
        const srcPath = path.join(src, item.name);
        const destPath = path.join(dest, item.name);
        if (item.name === 'backup' || item.name === '.gitignore' || item.name === 'README.md') {
            continue;
        }
        if (item.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyTestData(srcPath, destPath);
        }
        else {
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
        }
        else if (item.isFile() && !item.name.includes('repo-secret-manager')) {
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
(0, node_test_1.describe)('repo-secret-manager', () => {
    (0, node_test_1.before)(() => {
        setupTestRepo();
    });
    (0, node_test_1.after)(() => {
        cleanup();
    });
    (0, node_test_1.describe)('Secret Management', () => {
        (0, node_test_1.test)('should add secrets via stdin password', () => {
            const secret = 'test_stdin_secret';
            const output = (0, child_process_1.execSync)(`echo "${TEST_PASSWORD}" | node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`, {
                encoding: 'utf8',
                cwd: TEST_REPO_DIR,
                shell: '/bin/bash',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            assert.ok(output.includes('Secret added'), 'Should add secret via stdin');
        });
        (0, node_test_1.test)('should add secrets via password file', () => {
            const secret = 'test_file_secret';
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`);
            assert.ok(output.includes('Secret added'), 'Should add secret via password file');
        });
        (0, node_test_1.test)('should add secrets to the store', () => {
            for (const secret of secrets) {
                const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}"`);
                assert.ok(!output.includes('Error'), 'Should not have errors');
            }
            const secretsFile = path.join(TEST_REPO_DIR, 'repo-secret-manager.json');
            assert.ok(fs.existsSync(secretsFile), 'Secrets file should exist');
        });
        (0, node_test_1.test)('should list all secrets', () => {
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} list`);
            for (const secret of secrets) {
                assert.ok(output.includes(secret), `Should list secret: ${secret}`);
            }
        });
        (0, node_test_1.test)('should add secret with description', () => {
            const secret = 'secret_with_description';
            const description = 'This is a test description';
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${secret}" "${description}"`);
            assert.ok(output.includes('Secret added'), 'Should add secret');
            assert.ok(output.includes(description), 'Should show description in output');
        });
        (0, node_test_1.test)('should prevent duplicate secrets', () => {
            const duplicate = secrets[0];
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} add "${duplicate}"`);
            assert.ok(output.toLowerCase().includes('error') || output.toLowerCase().includes('already exists'), 'Should prevent adding duplicate secret');
        });
        (0, node_test_1.test)('should export secrets to CSV', () => {
            const csvPath = path.join(TEST_REPO_DIR, 'secrets-export.csv');
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} export "${csvPath}"`);
            assert.ok(output.includes('Exported'), 'Should confirm export');
            assert.ok(fs.existsSync(csvPath), 'CSV file should exist');
            const csvContent = fs.readFileSync(csvPath, 'utf8');
            const lines = csvContent.split('\n');
            assert.ok(lines[0].includes('UUID,Secret,Description,Created,Placeholder'), 'Should have CSV header');
            assert.ok(lines.length > 1, 'Should have data rows');
            // Verify secrets are in CSV
            for (const secret of secrets) {
                assert.ok(csvContent.includes(secret), `CSV should contain secret: ${secret}`);
            }
        });
    });
    (0, node_test_1.describe)('Encrypt and Decrypt Operations', () => {
        let backupDir;
        (0, node_test_1.before)(() => {
            backupDir = path.join(TEST_REPO_DIR, 'backup');
            copyDir(TEST_REPO_DIR, backupDir);
        });
        (0, node_test_1.test)('should encrypt secrets with placeholders', () => {
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} encrypt`);
            if (output.includes('Error')) {
                console.error('Encrypt command output:', output);
            }
            assert.ok(!output.includes('Error'), 'Should not have errors');
        });
        (0, node_test_1.test)('should have placeholders in files', () => {
            let foundPlaceholders = false;
            const checkDir = (dir) => {
                if (!fs.existsSync(dir))
                    return;
                const files = fs.readdirSync(dir, { withFileTypes: true });
                for (const file of files) {
                    const fullPath = path.join(dir, file.name);
                    if (file.isDirectory() && file.name !== 'backup' && !file.name.startsWith('.')) {
                        checkDir(fullPath);
                    }
                    else if (file.isFile() && !file.name.includes('README') && !file.name.includes('repo-secret-manager')) {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        if (content.includes('<!secret_')) {
                            foundPlaceholders = true;
                        }
                    }
                }
            };
            checkDir(TEST_REPO_DIR);
            assert.ok(foundPlaceholders, 'Should find placeholders in files');
        });
        (0, node_test_1.test)('should decrypt placeholders back to secrets', () => {
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} decrypt`);
            if (output.includes('Error')) {
                console.error('Decrypt command output:', output);
            }
            assert.ok(!output.includes('Error'), 'Should not have errors');
        });
        (0, node_test_1.test)('should respect .gitignore', () => {
            // Create a .gitignore file
            const gitignorePath = path.join(TEST_REPO_DIR, '.gitignore');
            fs.writeFileSync(gitignorePath, 'ignored-file.txt\nignored-dir/\n');
            // Create an ignored file with a secret
            const ignoredFile = path.join(TEST_REPO_DIR, 'ignored-file.txt');
            const testSecret = secrets[0];
            fs.writeFileSync(ignoredFile, `This file has a secret: ${testSecret}`);
            // Create an ignored directory with a file containing a secret
            const ignoredDir = path.join(TEST_REPO_DIR, 'ignored-dir');
            fs.mkdirSync(ignoredDir);
            const ignoredDirFile = path.join(ignoredDir, 'file.txt');
            fs.writeFileSync(ignoredDirFile, `Another secret: ${testSecret}`);
            // Run encrypt command
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} encrypt`);
            assert.ok(!output.includes('Error'), 'Should not have errors');
            // Verify ignored files still contain the actual secret (not encrypted)
            const ignoredContent = fs.readFileSync(ignoredFile, 'utf8');
            const ignoredDirContent = fs.readFileSync(ignoredDirFile, 'utf8');
            assert.ok(ignoredContent.includes(testSecret), 'Ignored file should still have actual secret');
            assert.ok(!ignoredContent.includes('<!secret_'), 'Ignored file should not have placeholder');
            assert.ok(ignoredDirContent.includes(testSecret), 'Ignored dir file should still have actual secret');
            assert.ok(!ignoredDirContent.includes('<!secret_'), 'Ignored dir file should not have placeholder');
            // Cleanup
            fs.unlinkSync(ignoredFile);
            fs.rmSync(ignoredDir, { recursive: true });
            fs.unlinkSync(gitignorePath);
        });
    });
    (0, node_test_1.describe)('Index Command', () => {
        (0, node_test_1.test)('should index git-modified files by default', () => {
            // Commit all current files
            execCommand('git add .', TEST_REPO_DIR);
            execCommand('git commit -m "Initial commit" || true', TEST_REPO_DIR);
            // Create a new modified file
            const modifiedFile = path.join(TEST_REPO_DIR, 'modified.txt');
            const testSecret = secrets[0];
            fs.writeFileSync(modifiedFile, `Modified: ${testSecret}`);
            execCommand(`git add ${modifiedFile}`, TEST_REPO_DIR);
            fs.appendFileSync(modifiedFile, '\n// Changed');
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index`);
            assert.ok(output.includes('Mode: Git modified files only'), 'Should default to git-modified mode');
            assert.ok(output.includes('Indexed'), 'Should show indexed count');
            // Cleanup
            if (fs.existsSync(modifiedFile)) {
                fs.unlinkSync(modifiedFile);
            }
        });
        (0, node_test_1.test)('should index all files with --all flag', () => {
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index --all`);
            assert.ok(output.includes('Mode: Indexing all files'), 'Should show all files mode');
            assert.ok(output.includes('Indexed'), 'Should show indexed count');
            assert.ok(!output.includes('Error'), 'Should not have errors');
        });
        (0, node_test_1.test)('should index files with pattern', () => {
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index . "*.json" --all`);
            assert.ok(output.includes('Pattern: *.json'), 'Should show pattern');
            assert.ok(output.includes('Indexed'), 'Should show indexed count');
        });
        (0, node_test_1.test)('should index only git-modified files by default', () => {
            // First, commit all current files
            execCommand('git add .', TEST_REPO_DIR);
            execCommand('git commit -m "Initial commit"', TEST_REPO_DIR);
            // Create a new file with a secret (unstaged)
            const newFile = path.join(TEST_REPO_DIR, 'new-file.txt');
            const testSecret = secrets[0];
            fs.writeFileSync(newFile, `New file with secret: ${testSecret}`);
            // Modify an existing file (staged change)
            const existingFile = path.join(TEST_REPO_DIR, 'sample-config.json');
            if (fs.existsSync(existingFile)) {
                const content = fs.readFileSync(existingFile, 'utf8');
                fs.writeFileSync(existingFile, content + `\n// Modified with ${testSecret}`);
                execCommand(`git add ${existingFile}`, TEST_REPO_DIR);
            }
            // Index without flags (should default to git-modified)
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index`);
            assert.ok(output.includes('Mode: Git modified files only'), 'Should default to git-modified mode');
            assert.ok(output.includes('Indexed'), 'Should index files');
            // Verify it only indexed the modified file, not untracked
            if (fs.existsSync(existingFile)) {
                assert.ok(output.includes('sample-config.json') || output.includes('1 files'), 'Should index the staged modified file');
            }
            // Cleanup
            if (fs.existsSync(newFile)) {
                fs.unlinkSync(newFile);
            }
        });
        (0, node_test_1.test)('should combine default git-modified with pattern', () => {
            // Create a JSON file and a TXT file, both modified
            const jsonFile = path.join(TEST_REPO_DIR, 'test-modified.json');
            const txtFile = path.join(TEST_REPO_DIR, 'test-modified.txt');
            const testSecret = secrets[1];
            fs.writeFileSync(jsonFile, `{"secret": "${testSecret}"}`);
            fs.writeFileSync(txtFile, `Secret: ${testSecret}`);
            execCommand('git add .', TEST_REPO_DIR);
            // Modify both files
            fs.appendFileSync(jsonFile, '\n// Modified');
            fs.appendFileSync(txtFile, '\n// Modified');
            // Index only JSON files (git-modified by default)
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index . "*.json"`);
            assert.ok(output.includes('Pattern: *.json'), 'Should show pattern');
            assert.ok(output.includes('Mode: Git modified files only'), 'Should show git-modified mode');
            // Cleanup
            if (fs.existsSync(jsonFile)) {
                fs.unlinkSync(jsonFile);
            }
            if (fs.existsSync(txtFile)) {
                fs.unlinkSync(txtFile);
            }
        });
        (0, node_test_1.test)('should handle no git-modified files', () => {
            // Commit everything
            execCommand('git add .', TEST_REPO_DIR);
            execCommand('git commit -m "Commit all" || true', TEST_REPO_DIR);
            // Try to index when nothing is modified (default behavior)
            const output = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index`);
            assert.ok(output.includes('No git-modified files found') || output.includes('Indexed 0 files'), 'Should handle no modified files gracefully');
        });
        (0, node_test_1.test)('should preserve existing index entries when indexing git-modified', () => {
            // First, index all files
            execCommand('git add .', TEST_REPO_DIR);
            execCommand('git commit -m "Initial" || true', TEST_REPO_DIR);
            const file1 = path.join(TEST_REPO_DIR, 'file1.txt');
            const file2 = path.join(TEST_REPO_DIR, 'file2.txt');
            const testSecret = secrets[0];
            fs.writeFileSync(file1, `Secret: ${testSecret}`);
            fs.writeFileSync(file2, `Secret: ${testSecret}`);
            execCommand('git add .', TEST_REPO_DIR);
            execCommand('git commit -m "Add files"', TEST_REPO_DIR);
            // Index all files
            const output1 = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index --all`);
            assert.ok(output1.includes('file1.txt') && output1.includes('file2.txt'), 'Should index both files initially');
            // Now modify only file1
            fs.appendFileSync(file1, '\n// Modified');
            // Index with git-modified (default)
            const output2 = execCommandWithPassword(`node ${CLI_PATH} -r ${TEST_REPO_DIR} index`);
            // Verify file2 is still in the index
            assert.ok(output2.includes('file1.txt'), 'Should include modified file1');
            assert.ok(output2.includes('file2.txt'), 'Should preserve unmodified file2 in index');
            // Cleanup
            if (fs.existsSync(file1))
                fs.unlinkSync(file1);
            if (fs.existsSync(file2))
                fs.unlinkSync(file2);
        });
    });
    (0, node_test_1.describe)('Git Hook', () => {
        (0, node_test_1.test)('should install git hook', () => {
            const output = execCommand(`node ${CLI_PATH} -r ${TEST_REPO_DIR} install-hook`);
            const hookPath = path.join(TEST_REPO_DIR, '.git', 'hooks', 'pre-commit');
            assert.ok(fs.existsSync(hookPath), 'Hook file should exist');
            const stats = fs.statSync(hookPath);
            assert.ok(stats.mode & 0o111, 'Hook should be executable');
        });
        (0, node_test_1.test)('should remove git hook', () => {
            const output = execCommand(`node ${CLI_PATH} -r ${TEST_REPO_DIR} remove-hook`);
            const hookPath = path.join(TEST_REPO_DIR, '.git', 'hooks', 'pre-commit');
            assert.ok(!fs.existsSync(hookPath), 'Hook file should be removed');
        });
    });
});
//# sourceMappingURL=test.js.map