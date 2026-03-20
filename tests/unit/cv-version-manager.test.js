import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CVVersionManager } from '../../src/job-tracker/cv-version-manager.js';

describe('CVVersionManager', () => {
  let manager;
  let mockStorageService;
  let mockData;

  beforeEach(() => {
    // Create mock data structure
    mockData = {
      version: "1.0",
      users: {
        'user1': {
          applications: [],
          cvVersions: []
        }
      }
    };

    // Create a mock storage service
    mockStorageService = {
      load: () => mockData,
      save: (data) => { mockData = data; },
      validate: () => true
    };
    
    manager = new CVVersionManager(mockStorageService);
  });

  describe('constructor', () => {
    it('should throw error if storageService is not provided', () => {
      assert.throws(() => new CVVersionManager(), /StorageService is required/);
    });

    it('should initialize with valid statuses', () => {
      assert.deepStrictEqual(manager.validStatuses, ['active', 'archived']);
    });
  });

  describe('validateName', () => {
    it('should accept valid CV version name', () => {
      assert.doesNotThrow(() => manager.validateName('Tech-focused CV'));
    });

    it('should reject empty string', () => {
      assert.throws(() => manager.validateName(''), /CV version name cannot be empty/);
    });

    it('should reject whitespace-only string', () => {
      assert.throws(() => manager.validateName('   '), /CV version name cannot be empty/);
    });

    it('should reject null or undefined', () => {
      assert.throws(() => manager.validateName(null), /CV version name is required/);
      assert.throws(() => manager.validateName(undefined), /CV version name is required/);
    });

    it('should reject non-string values', () => {
      assert.throws(() => manager.validateName(123), /CV version name is required/);
    });

    it('should reject name longer than 200 characters', () => {
      const longName = 'A'.repeat(201);
      assert.throws(() => manager.validateName(longName), /must be 200 characters or less/);
    });

    it('should accept name with exactly 200 characters', () => {
      const maxName = 'A'.repeat(200);
      assert.doesNotThrow(() => manager.validateName(maxName));
    });
  });

  describe('validateStatus', () => {
    it('should accept "active" status', () => {
      assert.doesNotThrow(() => manager.validateStatus('active'));
    });

    it('should accept "archived" status', () => {
      assert.doesNotThrow(() => manager.validateStatus('archived'));
    });

    it('should reject invalid status', () => {
      assert.throws(() => manager.validateStatus('invalid'), /must be one of: active, archived/);
    });

    it('should reject null or undefined', () => {
      assert.throws(() => manager.validateStatus(null), /CV version status is required/);
      assert.throws(() => manager.validateStatus(undefined), /CV version status is required/);
    });
  });

  describe('validateAtsScore', () => {
    it('should accept valid ATS score', () => {
      assert.doesNotThrow(() => manager.validateAtsScore(85));
    });

    it('should accept null or undefined (optional field)', () => {
      assert.doesNotThrow(() => manager.validateAtsScore(null));
      assert.doesNotThrow(() => manager.validateAtsScore(undefined));
    });

    it('should reject non-number values', () => {
      assert.throws(() => manager.validateAtsScore('85'), /ATS score must be a number/);
    });

    it('should reject score below 0', () => {
      assert.throws(() => manager.validateAtsScore(-1), /must be between 0 and 100/);
    });

    it('should reject score above 100', () => {
      assert.throws(() => manager.validateAtsScore(101), /must be between 0 and 100/);
    });

    it('should accept boundary values 0 and 100', () => {
      assert.doesNotThrow(() => manager.validateAtsScore(0));
      assert.doesNotThrow(() => manager.validateAtsScore(100));
    });
  });

  describe('createVersion', () => {
    it('should create a CV version with required fields', () => {
      const versionData = {
        name: 'Tech-focused CV'
      };

      const result = manager.createVersion('user1', versionData);

      assert.ok(result.id, 'Should have an ID');
      assert.strictEqual(result.userId, 'user1');
      assert.strictEqual(result.name, 'Tech-focused CV');
      assert.strictEqual(result.status, 'active'); // Default status
      assert.ok(result.createdAt);
      assert.ok(result.lastModified);
    });

    it('should create a CV version with all fields', () => {
      const versionData = {
        name: 'Marketing CV',
        description: 'CV tailored for marketing positions',
        atsScore: 92,
        content: 'Full CV content here...',
        status: 'active'
      };

      const result = manager.createVersion('user1', versionData);

      assert.strictEqual(result.name, 'Marketing CV');
      assert.strictEqual(result.description, 'CV tailored for marketing positions');
      assert.strictEqual(result.atsScore, 92);
      assert.strictEqual(result.content, 'Full CV content here...');
      assert.strictEqual(result.status, 'active');
    });

    it('should generate unique UUID for each version', () => {
      const versionData = { name: 'CV Version' };
      
      const version1 = manager.createVersion('user1', versionData);
      const version2 = manager.createVersion('user1', versionData);

      assert.notStrictEqual(version1.id, version2.id);
    });

    it('should default status to "active" if not provided', () => {
      const versionData = { name: 'Test CV' };
      const result = manager.createVersion('user1', versionData);

      assert.strictEqual(result.status, 'active');
    });

    it('should initialize user data if not exists', () => {
      const versionData = { name: 'New User CV' };
      const result = manager.createVersion('newUser', versionData);

      assert.strictEqual(result.userId, 'newUser');
      assert.ok(mockData.users['newUser']);
      assert.ok(Array.isArray(mockData.users['newUser'].cvVersions));
    });

    it('should throw error for invalid name', () => {
      assert.throws(
        () => manager.createVersion('user1', { name: '' }),
        /CV version name cannot be empty/
      );
    });

    it('should throw error for invalid status', () => {
      assert.throws(
        () => manager.createVersion('user1', { name: 'Test', status: 'invalid' }),
        /must be one of: active, archived/
      );
    });

    it('should throw error for invalid ATS score', () => {
      assert.throws(
        () => manager.createVersion('user1', { name: 'Test', atsScore: 150 }),
        /must be between 0 and 100/
      );
    });
  });

  describe('getVersion', () => {
    it('should retrieve an existing CV version by ID', () => {
      const created = manager.createVersion('user1', { name: 'Test CV' });
      const retrieved = manager.getVersion('user1', created.id);

      assert.deepStrictEqual(retrieved, created);
    });

    it('should return null for non-existent version ID', () => {
      const result = manager.getVersion('user1', 'non-existent-id');
      assert.strictEqual(result, null);
    });

    it('should return null for non-existent user', () => {
      const result = manager.getVersion('nonExistentUser', 'some-id');
      assert.strictEqual(result, null);
    });
  });

  describe('getAllVersions', () => {
    it('should return empty array for user with no versions', () => {
      const result = manager.getAllVersions('user1');
      assert.deepStrictEqual(result, []);
    });

    it('should return all CV versions for a user', () => {
      manager.createVersion('user1', { name: 'CV 1' });
      manager.createVersion('user1', { name: 'CV 2' });
      manager.createVersion('user1', { name: 'CV 3' });

      const result = manager.getAllVersions('user1');
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].name, 'CV 1');
      assert.strictEqual(result[1].name, 'CV 2');
      assert.strictEqual(result[2].name, 'CV 3');
    });

    it('should return empty array for non-existent user', () => {
      const result = manager.getAllVersions('nonExistentUser');
      assert.deepStrictEqual(result, []);
    });
  });

  describe('updateVersion', () => {
    it('should update CV version name', () => {
      const created = manager.createVersion('user1', { name: 'Old Name' });
      const updated = manager.updateVersion('user1', created.id, { name: 'New Name' });

      assert.strictEqual(updated.name, 'New Name');
      assert.strictEqual(updated.id, created.id);
    });

    it('should update CV version status', () => {
      const created = manager.createVersion('user1', { name: 'Test CV', status: 'active' });
      const updated = manager.updateVersion('user1', created.id, { status: 'archived' });

      assert.strictEqual(updated.status, 'archived');
    });

    it('should update ATS score', () => {
      const created = manager.createVersion('user1', { name: 'Test CV' });
      const updated = manager.updateVersion('user1', created.id, { atsScore: 88 });

      assert.strictEqual(updated.atsScore, 88);
    });

    it('should update lastModified timestamp', () => {
      const created = manager.createVersion('user1', { name: 'Test CV' });
      const originalModified = created.lastModified;
      
      // Update the version
      const updated = manager.updateVersion('user1', created.id, { name: 'Updated CV' });

      // Check that lastModified is a valid ISO timestamp and exists
      assert.ok(updated.lastModified);
      assert.ok(new Date(updated.lastModified).getTime() >= new Date(originalModified).getTime());
    });

    it('should throw error for non-existent version', () => {
      assert.throws(
        () => manager.updateVersion('user1', 'non-existent-id', { name: 'Test' }),
        /CV version not found/
      );
    });

    it('should throw error for non-existent user', () => {
      assert.throws(
        () => manager.updateVersion('nonExistentUser', 'some-id', { name: 'Test' }),
        /CV version not found/
      );
    });

    it('should throw error for invalid name', () => {
      const created = manager.createVersion('user1', { name: 'Test CV' });
      assert.throws(
        () => manager.updateVersion('user1', created.id, { name: '' }),
        /CV version name cannot be empty/
      );
    });

    it('should throw error for invalid status', () => {
      const created = manager.createVersion('user1', { name: 'Test CV' });
      assert.throws(
        () => manager.updateVersion('user1', created.id, { status: 'invalid' }),
        /must be one of: active, archived/
      );
    });
  });

  describe('getApplicationsByVersion', () => {
    beforeEach(() => {
      // Add some test applications to mock data
      mockData.users['user1'].applications = [
        { id: 'app1', cvVersionId: 'cv-version-1', companyName: 'Company A' },
        { id: 'app2', cvVersionId: 'cv-version-2', companyName: 'Company B' },
        { id: 'app3', cvVersionId: 'cv-version-1', companyName: 'Company C' },
        { id: 'app4', cvVersionId: 'cv-version-3', companyName: 'Company D' }
      ];
    });

    it('should return applications using specific CV version', () => {
      const result = manager.getApplicationsByVersion('user1', 'cv-version-1');

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, 'app1');
      assert.strictEqual(result[1].id, 'app3');
    });

    it('should return empty array for CV version with no applications', () => {
      const result = manager.getApplicationsByVersion('user1', 'cv-version-999');
      assert.deepStrictEqual(result, []);
    });

    it('should return empty array for non-existent user', () => {
      const result = manager.getApplicationsByVersion('nonExistentUser', 'cv-version-1');
      assert.deepStrictEqual(result, []);
    });
  });
});
