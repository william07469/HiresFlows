import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { StorageService } from '../../src/job-tracker/storage-service.js';
import fs from 'fs';
import path from 'path';

describe('StorageService', () => {
  const testFilePath = path.join(process.cwd(), 'test-storage.json');
  let storageService;

  beforeEach(() => {
    storageService = new StorageService(testFilePath);
    // Clean up any existing test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    // Clean up backup files
    const dir = path.dirname(testFilePath);
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file.startsWith('test-storage.json.backup-')) {
        fs.unlinkSync(path.join(dir, file));
      }
    });
  });

  describe('validate', () => {
    it('should return true for valid data structure', () => {
      const validData = {
        version: "1.0",
        users: {
          "user1": {
            applications: [],
            cvVersions: []
          }
        }
      };
      assert.strictEqual(storageService.validate(validData), true);
    });

    it('should return false for missing version', () => {
      const invalidData = {
        users: {}
      };
      assert.strictEqual(storageService.validate(invalidData), false);
    });

    it('should return false for missing users', () => {
      const invalidData = {
        version: "1.0"
      };
      assert.strictEqual(storageService.validate(invalidData), false);
    });

    it('should return false for invalid user data structure', () => {
      const invalidData = {
        version: "1.0",
        users: {
          "user1": {
            applications: "not an array"
          }
        }
      };
      assert.strictEqual(storageService.validate(invalidData), false);
    });

    it('should return false for null or non-object data', () => {
      assert.strictEqual(storageService.validate(null), false);
      assert.strictEqual(storageService.validate("string"), false);
      assert.strictEqual(storageService.validate(123), false);
    });
  });

  describe('load', () => {
    it('should initialize empty storage if file does not exist', () => {
      const data = storageService.load();
      assert.deepStrictEqual(data, {
        version: "1.0",
        users: {}
      });
      assert.strictEqual(fs.existsSync(testFilePath), true);
    });

    it('should load existing valid file', () => {
      const testData = {
        version: "1.0",
        users: {
          "user1": {
            applications: [{ id: "app1" }],
            cvVersions: [{ id: "cv1" }]
          }
        }
      };
      fs.writeFileSync(testFilePath, JSON.stringify(testData), 'utf8');

      const loaded = storageService.load();
      assert.deepStrictEqual(loaded, testData);
    });

    it('should handle corrupted JSON file by creating backup and initializing empty storage', () => {
      fs.writeFileSync(testFilePath, '{ invalid json }', 'utf8');

      const data = storageService.load();
      assert.deepStrictEqual(data, {
        version: "1.0",
        users: {}
      });

      // Check that backup was created
      const dir = path.dirname(testFilePath);
      const files = fs.readdirSync(dir);
      const backupExists = files.some(file => file.startsWith('test-storage.json.backup-'));
      assert.strictEqual(backupExists, true);
    });

    it('should handle invalid structure by creating backup and initializing empty storage', () => {
      const invalidData = { version: "1.0" }; // Missing users
      fs.writeFileSync(testFilePath, JSON.stringify(invalidData), 'utf8');

      const data = storageService.load();
      assert.deepStrictEqual(data, {
        version: "1.0",
        users: {}
      });
    });
  });

  describe('save', () => {
    it('should save valid data to file', () => {
      const testData = {
        version: "1.0",
        users: {
          "user1": {
            applications: [],
            cvVersions: []
          }
        }
      };

      storageService.save(testData);
      assert.strictEqual(fs.existsSync(testFilePath), true);

      const saved = JSON.parse(fs.readFileSync(testFilePath, 'utf8'));
      assert.deepStrictEqual(saved, testData);
    });

    it('should throw error for invalid data structure', () => {
      const invalidData = { version: "1.0" }; // Missing users

      assert.throws(() => storageService.save(invalidData), /Invalid data structure/);
    });

    it('should use atomic write with temporary file', () => {
      const testData = {
        version: "1.0",
        users: {}
      };

      storageService.save(testData);
      
      // Temporary file should not exist after save
      assert.strictEqual(fs.existsSync(testFilePath + '.tmp'), false);
      // Main file should exist
      assert.strictEqual(fs.existsSync(testFilePath), true);
    });
  });

  describe('backup', () => {
    it('should create backup of existing file', () => {
      const testData = {
        version: "1.0",
        users: {}
      };
      fs.writeFileSync(testFilePath, JSON.stringify(testData), 'utf8');

      storageService.backup();

      const dir = path.dirname(testFilePath);
      const files = fs.readdirSync(dir);
      const backupExists = files.some(file => file.startsWith('test-storage.json.backup-'));
      assert.strictEqual(backupExists, true);
    });

    it('should not throw error if file does not exist', () => {
      assert.doesNotThrow(() => storageService.backup());
    });
  });

  describe('round-trip', () => {
    it('should save and load data correctly', () => {
      const testData = {
        version: "1.0",
        users: {
          "user1": {
            applications: [
              { id: "app1", companyName: "Company A" }
            ],
            cvVersions: [
              { id: "cv1", name: "Tech Resume" }
            ]
          }
        }
      };

      storageService.save(testData);
      const loaded = storageService.load();
      assert.deepStrictEqual(loaded, testData);
    });
  });
});
