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
exports.isGitIgnored = isGitIgnored;
exports.walkDir = walkDir;
exports.replaceSecretsInFile = replaceSecretsInFile;
exports.reverseSecretsInFile = reverseSecretsInFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/**
 * Checks if a file is ignored by git
 * @param filePath - Path to the file to check
 * @param gitRoot - Root directory of the git repository
 * @returns true if the file is ignored by git, false otherwise
 */
function isGitIgnored(filePath, gitRoot) {
    try {
        // Use git check-ignore to check if file is ignored
        (0, child_process_1.execSync)(`git check-ignore "${filePath}"`, {
            cwd: gitRoot,
            stdio: 'pipe'
        });
        // If command succeeds, file is ignored
        return true;
    }
    catch {
        // If command fails (exit code 1), file is not ignored
        return false;
    }
}
/**
 * Recursively walks a directory and calls callback for each file
 * @param dir - Directory path to walk
 * @param callback - Function to call for each file found
 * @param gitRoot - Optional git root to respect .gitignore
 */
function walkDir(dir, callback, gitRoot) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const fullPath = path.join(dir, entry.name);
        // Skip if ignored by git
        if (gitRoot && isGitIgnored(fullPath, gitRoot)) {
            return;
        }
        if (entry.isDirectory()) {
            walkDir(fullPath, callback, gitRoot);
        }
        else if (entry.isFile()) {
            callback(fullPath);
        }
    });
}
/**
 * Replaces actual secrets in a file with UUID-based placeholders
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any replacements were made, false otherwise
 */
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
/**
 * Reverses UUID-based placeholders back to actual secrets in a file
 * @param filePath - Path to the file to process
 * @param secrets - Map of UUIDs to secret data
 * @returns true if any replacements were made, false otherwise
 */
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
//# sourceMappingURL=replace.js.map