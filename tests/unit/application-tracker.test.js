import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ApplicationTracker } from '../../src/job-tracker/application-tracker.js';
import { StorageService } from '../../src/job-tracker/storage-service.js';

describe('ApplicationTracker', () => {
  let tracker;
  let mockStorageService;

  beforeEach(() => {
    // Create a mock storage service
    mockStorageService = {
      load: () => ({ version: "1.0", users: {} }),
      save: () => {},
      validate: () => true
    };
    tracker = new ApplicationTracker(mockStorageService);
  });

  describe('constructor', () => {
    it('should throw error if storageService is not provided', () => {
      assert.throws(() => new ApplicationTracker(), /StorageService is required/);
    });

    it('should initialize with valid statuses', () => {
      assert.deepStrictEqual(tracker.validStatuses, ['Applied', 'Interview', 'Rejected', 'Offer', 'Accepted']);
    });
  });

  describe('validateCompanyName', () => {
    it('should accept valid company name', () => {
      assert.doesNotThrow(() => tracker.validateCompanyName('Acme Corp'));
    });

    it('should reject empty string', () => {
      assert.throws(() => tracker.validateCompanyName(''), /Company name cannot be empty/);
    });

    it('should reject whitespace-only string', () => {
      assert.throws(() => tracker.validateCompanyName('   '), /Company name cannot be empty/);
    });

    it('should reject null or undefined', () => {
      assert.throws(() => tracker.validateCompanyName(null), /Company name is required/);
      assert.throws(() => tracker.validateCompanyName(undefined), /Company name is required/);
    });

    it('should reject non-string values', () => {
      assert.throws(() => tracker.validateCompanyName(123), /Company name is required/);
    });

    it('should reject company name longer than 200 characters', () => {
      const longName = 'A'.repeat(201);
      assert.throws(() => tracker.validateCompanyName(longName), /must be 200 characters or less/);
    });

    it('should accept company name with exactly 200 characters', () => {
      const maxName = 'A'.repeat(200);
      assert.doesNotThrow(() => tracker.validateCompanyName(maxName));
    });
  });

  describe('validatePositionTitle', () => {
    it('should accept valid position title', () => {
      assert.doesNotThrow(() => tracker.validatePositionTitle('Software Engineer'));
    });

    it('should reject empty string', () => {
      assert.throws(() => tracker.validatePositionTitle(''), /Position title cannot be empty/);
    });

    it('should reject whitespace-only string', () => {
      assert.throws(() => tracker.validatePositionTitle('   '), /Position title cannot be empty/);
    });

    it('should reject null or undefined', () => {
      assert.throws(() => tracker.validatePositionTitle(null), /Position title is required/);
      assert.throws(() => tracker.validatePositionTitle(undefined), /Position title is required/);
    });

    it('should reject non-string values', () => {
      assert.throws(() => tracker.validatePositionTitle(123), /Position title is required/);
    });

    it('should reject position title longer than 200 characters', () => {
      const longTitle = 'A'.repeat(201);
      assert.throws(() => tracker.validatePositionTitle(longTitle), /must be 200 characters or less/);
    });

    it('should accept position title with exactly 200 characters', () => {
      const maxTitle = 'A'.repeat(200);
      assert.doesNotThrow(() => tracker.validatePositionTitle(maxTitle));
    });
  });

  describe('validateJobDescription', () => {
    it('should accept valid job description', () => {
      assert.doesNotThrow(() => tracker.validateJobDescription('Looking for a talented developer...'));
    });

    it('should accept empty string', () => {
      assert.doesNotThrow(() => tracker.validateJobDescription(''));
    });

    it('should accept null or undefined (optional field)', () => {
      assert.doesNotThrow(() => tracker.validateJobDescription(null));
      assert.doesNotThrow(() => tracker.validateJobDescription(undefined));
    });

    it('should reject non-string values', () => {
      assert.throws(() => tracker.validateJobDescription(123), /Job description must be a string/);
    });

    it('should reject job description longer than 10000 characters', () => {
      const longDesc = 'A'.repeat(10001);
      assert.throws(() => tracker.validateJobDescription(longDesc), /must be 10000 characters or less/);
    });

    it('should accept job description with exactly 10000 characters', () => {
      const maxDesc = 'A'.repeat(10000);
      assert.doesNotThrow(() => tracker.validateJobDescription(maxDesc));
    });
  });

  describe('validateStatus', () => {
    it('should accept valid status values', () => {
      assert.doesNotThrow(() => tracker.validateStatus('Applied'));
      assert.doesNotThrow(() => tracker.validateStatus('Interview'));
      assert.doesNotThrow(() => tracker.validateStatus('Rejected'));
      assert.doesNotThrow(() => tracker.validateStatus('Offer'));
      assert.doesNotThrow(() => tracker.validateStatus('Accepted'));
    });

    it('should reject invalid status values', () => {
      assert.throws(() => tracker.validateStatus('Pending'), /Status must be one of/);
      assert.throws(() => tracker.validateStatus('InProgress'), /Status must be one of/);
    });

    it('should reject empty string', () => {
      assert.throws(() => tracker.validateStatus(''), /Status is required/);
    });

    it('should reject null or undefined', () => {
      assert.throws(() => tracker.validateStatus(null), /Status is required/);
      assert.throws(() => tracker.validateStatus(undefined), /Status is required/);
    });

    it('should reject non-string values', () => {
      assert.throws(() => tracker.validateStatus(123), /Status is required/);
    });
  });

  describe('validateApplicationDate', () => {
    it('should accept valid past date', () => {
      const pastDate = new Date('2024-01-01');
      assert.doesNotThrow(() => tracker.validateApplicationDate(pastDate));
    });

    it('should accept today\'s date', () => {
      const today = new Date();
      assert.doesNotThrow(() => tracker.validateApplicationDate(today));
    });

    it('should reject future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      assert.throws(() => tracker.validateApplicationDate(futureDate), /cannot be in the future/);
    });

    it('should reject invalid date', () => {
      assert.throws(() => tracker.validateApplicationDate('invalid-date'), /must be a valid date/);
    });

    it('should reject null or undefined', () => {
      assert.throws(() => tracker.validateApplicationDate(null), /Application date is required/);
      assert.throws(() => tracker.validateApplicationDate(undefined), /Application date is required/);
    });

    it('should accept ISO date string', () => {
      assert.doesNotThrow(() => tracker.validateApplicationDate('2024-01-01'));
    });
  });

  describe('validateInterviewDate', () => {
    const applicationDate = new Date('2024-01-01');

    it('should accept interview date after application date', () => {
      const interviewDate = new Date('2024-01-15');
      assert.doesNotThrow(() => tracker.validateInterviewDate(interviewDate, applicationDate));
    });

    it('should accept interview date same as application date', () => {
      const interviewDate = new Date('2024-01-01');
      assert.doesNotThrow(() => tracker.validateInterviewDate(interviewDate, applicationDate));
    });

    it('should reject interview date before application date', () => {
      const interviewDate = new Date('2023-12-15');
      assert.throws(() => tracker.validateInterviewDate(interviewDate, applicationDate), /cannot be before application date/);
    });

    it('should accept null or undefined (optional field)', () => {
      assert.doesNotThrow(() => tracker.validateInterviewDate(null, applicationDate));
      assert.doesNotThrow(() => tracker.validateInterviewDate(undefined, applicationDate));
    });

    it('should reject invalid date', () => {
      assert.throws(() => tracker.validateInterviewDate('invalid-date', applicationDate), /must be a valid date/);
    });
  });

  describe('createApplication', () => {
    let savedData;

    beforeEach(() => {
      savedData = null;
      mockStorageService = {
        load: () => ({ version: "1.0", users: {} }),
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should create application with all required fields', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.strictEqual(result.userId, 'user123');
      assert.strictEqual(result.companyName, 'Acme Corp');
      assert.strictEqual(result.positionTitle, 'Software Engineer');
      assert.strictEqual(result.status, 'Applied');
      assert.ok(result.id); // UUID should be generated
      assert.ok(result.createdAt);
      assert.ok(result.lastModified);
    });

    it('should generate unique UUID for application ID', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      const result1 = tracker.createApplication('user123', applicationData);
      const result2 = tracker.createApplication('user123', applicationData);

      assert.notStrictEqual(result1.id, result2.id);
    });

    it('should set default status to Applied', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.strictEqual(result.status, 'Applied');
    });

    it('should assign default CV version if not provided', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.strictEqual(result.cvVersionId, 'default-cv-v1');
    });

    it('should use provided CV version if given', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15',
        cvVersionId: 'custom-cv-123'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.strictEqual(result.cvVersionId, 'custom-cv-123');
    });

    it('should initialize status history with Applied status', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.strictEqual(result.statusHistory.length, 1);
      assert.strictEqual(result.statusHistory[0].status, 'Applied');
      assert.ok(result.statusHistory[0].timestamp);
      assert.strictEqual(result.statusHistory[0].notes, null);
    });

    it('should sanitize text inputs', () => {
      const mockSanitize = (text, maxLen) => {
        // Remove control characters (matching the actual sanitizeText function)
        return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
      };

      const applicationData = {
        companyName: 'Acme\x00Corp\x01Test',
        positionTitle: 'Software\x02Engineer',
        applicationDate: '2024-01-15',
        jobDescription: 'Great\x03job'
      };

      const result = tracker.createApplication('user123', applicationData, mockSanitize);

      // Control characters should be removed
      assert.strictEqual(result.companyName, 'AcmeCorpTest');
      assert.strictEqual(result.positionTitle, 'SoftwareEngineer');
      assert.strictEqual(result.jobDescription, 'Greatjob');
    });

    it('should save application to storage', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      tracker.createApplication('user123', applicationData);

      assert.ok(savedData);
      assert.ok(savedData.users.user123);
      assert.strictEqual(savedData.users.user123.applications.length, 1);
      assert.strictEqual(savedData.users.user123.applications[0].companyName, 'Acme Corp');
    });

    it('should handle optional job description', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15',
        jobDescription: 'Looking for a talented developer'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.strictEqual(result.jobDescription, 'Looking for a talented developer');
    });

    it('should handle optional interview date and notes', () => {
      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15',
        interviewDate: '2024-01-20',
        interviewNotes: 'Technical interview scheduled'
      };

      const result = tracker.createApplication('user123', applicationData);

      assert.ok(result.interviewDate);
      assert.strictEqual(result.interviewNotes, 'Technical interview scheduled');
    });

    it('should validate required fields', () => {
      const invalidData = {
        companyName: '',
        positionTitle: 'Software Engineer',
        applicationDate: '2024-01-15'
      };

      assert.throws(() => tracker.createApplication('user123', invalidData), /Company name cannot be empty/);
    });

    it('should validate application date is not in future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const applicationData = {
        companyName: 'Acme Corp',
        positionTitle: 'Software Engineer',
        applicationDate: futureDate
      };

      assert.throws(() => tracker.createApplication('user123', applicationData), /cannot be in the future/);
    });
  });

  describe('getApplication', () => {
    let savedData;

    beforeEach(() => {
      savedData = {
        version: "1.0",
        users: {
          user123: {
            applications: [
              {
                id: 'app-001',
                userId: 'user123',
                companyName: 'Acme Corp',
                positionTitle: 'Software Engineer',
                applicationDate: '2024-01-15T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-15T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              },
              {
                id: 'app-002',
                userId: 'user123',
                companyName: 'Tech Inc',
                positionTitle: 'Senior Developer',
                applicationDate: '2024-01-20T00:00:00.000Z',
                status: 'Interview',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-20T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-20T00:00:00.000Z',
                lastModified: '2024-01-20T00:00:00.000Z'
              }
            ],
            cvVersions: []
          }
        }
      };

      mockStorageService = {
        load: () => savedData,
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should retrieve application by ID', () => {
      const result = tracker.getApplication('user123', 'app-001');

      assert.ok(result);
      assert.strictEqual(result.id, 'app-001');
      assert.strictEqual(result.companyName, 'Acme Corp');
      assert.strictEqual(result.positionTitle, 'Software Engineer');
    });

    it('should return null for non-existent application ID', () => {
      const result = tracker.getApplication('user123', 'non-existent-id');

      assert.strictEqual(result, null);
    });

    it('should return null for non-existent user', () => {
      const result = tracker.getApplication('non-existent-user', 'app-001');

      assert.strictEqual(result, null);
    });

    it('should retrieve correct application when multiple exist', () => {
      const result = tracker.getApplication('user123', 'app-002');

      assert.ok(result);
      assert.strictEqual(result.id, 'app-002');
      assert.strictEqual(result.companyName, 'Tech Inc');
      assert.strictEqual(result.positionTitle, 'Senior Developer');
    });
  });

  describe('getAllApplications', () => {
    let savedData;

    beforeEach(() => {
      savedData = {
        version: "1.0",
        users: {
          user123: {
            applications: [
              {
                id: 'app-001',
                userId: 'user123',
                companyName: 'Acme Corp',
                positionTitle: 'Software Engineer',
                applicationDate: '2024-01-15T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-15T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              },
              {
                id: 'app-002',
                userId: 'user123',
                companyName: 'Tech Inc',
                positionTitle: 'Senior Developer',
                applicationDate: '2024-01-20T00:00:00.000Z',
                status: 'Interview',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-20T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-20T00:00:00.000Z',
                lastModified: '2024-01-20T00:00:00.000Z'
              }
            ],
            cvVersions: []
          },
          user456: {
            applications: [
              {
                id: 'app-003',
                userId: 'user456',
                companyName: 'Other Company',
                positionTitle: 'Developer',
                applicationDate: '2024-01-10T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-10T00:00:00.000Z',
                lastModified: '2024-01-10T00:00:00.000Z'
              }
            ],
            cvVersions: []
          }
        }
      };

      mockStorageService = {
        load: () => savedData,
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should retrieve all applications for a user', () => {
      const result = tracker.getAllApplications('user123');

      assert.strictEqual(result.length, 2);
      // Applications should be sorted by date descending (newest first)
      assert.strictEqual(result[0].id, 'app-002'); // 2024-01-20
      assert.strictEqual(result[1].id, 'app-001'); // 2024-01-15
    });

    it('should return empty array for user with no applications', () => {
      savedData.users.emptyUser = { applications: [], cvVersions: [] };
      const result = tracker.getAllApplications('emptyUser');

      assert.strictEqual(result.length, 0);
      assert.ok(Array.isArray(result));
    });

    it('should return empty array for non-existent user', () => {
      const result = tracker.getAllApplications('non-existent-user');

      assert.strictEqual(result.length, 0);
      assert.ok(Array.isArray(result));
    });

    it('should only return applications for the specified user', () => {
      const result = tracker.getAllApplications('user456');

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'app-003');
      assert.strictEqual(result[0].userId, 'user456');
    });

    it('should return all application fields', () => {
      const result = tracker.getAllApplications('user123');

      assert.ok(result[0].id);
      assert.ok(result[0].userId);
      assert.ok(result[0].companyName);
      assert.ok(result[0].positionTitle);
      assert.ok(result[0].applicationDate);
      assert.ok(result[0].status);
      assert.ok(result[0].cvVersionId);
      assert.ok(result[0].statusHistory);
      assert.ok(result[0].createdAt);
      assert.ok(result[0].lastModified);
    });

    it('should filter applications by status', () => {
      const result = tracker.getAllApplications('user123', { status: 'Interview' });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'app-002');
      assert.strictEqual(result[0].status, 'Interview');
    });

    it('should filter applications by CV version', () => {
      // Add an application with a different CV version
      savedData.users.user123.applications.push({
        id: 'app-003',
        userId: 'user123',
        companyName: 'Another Corp',
        positionTitle: 'Developer',
        applicationDate: '2024-01-25T00:00:00.000Z',
        status: 'Applied',
        cvVersionId: 'custom-cv-v2',
        jobDescription: '',
        interviewDate: null,
        interviewNotes: null,
        rejectionDate: null,
        statusHistory: [{ status: 'Applied', timestamp: '2024-01-25T00:00:00.000Z', notes: null }],
        createdAt: '2024-01-25T00:00:00.000Z',
        lastModified: '2024-01-25T00:00:00.000Z'
      });

      const result = tracker.getAllApplications('user123', { cvVersionId: 'custom-cv-v2' });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'app-003');
      assert.strictEqual(result[0].cvVersionId, 'custom-cv-v2');
    });

    it('should filter applications by start date', () => {
      const result = tracker.getAllApplications('user123', { startDate: '2024-01-18' });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'app-002');
    });

    it('should filter applications by end date', () => {
      const result = tracker.getAllApplications('user123', { endDate: '2024-01-18' });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'app-001');
    });

    it('should filter applications by date range', () => {
      // Add more applications to test date range
      savedData.users.user123.applications.push({
        id: 'app-003',
        userId: 'user123',
        companyName: 'Another Corp',
        positionTitle: 'Developer',
        applicationDate: '2024-01-10T00:00:00.000Z',
        status: 'Applied',
        cvVersionId: 'default-cv-v1',
        jobDescription: '',
        interviewDate: null,
        interviewNotes: null,
        rejectionDate: null,
        statusHistory: [{ status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null }],
        createdAt: '2024-01-10T00:00:00.000Z',
        lastModified: '2024-01-10T00:00:00.000Z'
      });

      const result = tracker.getAllApplications('user123', { 
        startDate: '2024-01-12', 
        endDate: '2024-01-22' 
      });

      assert.strictEqual(result.length, 2);
      // Applications should be sorted by date descending (newest first)
      assert.strictEqual(result[0].id, 'app-002'); // 2024-01-20
      assert.strictEqual(result[1].id, 'app-001'); // 2024-01-15
    });

    it('should apply multiple filters simultaneously', () => {
      // Add more applications with different statuses and CV versions
      savedData.users.user123.applications.push({
        id: 'app-003',
        userId: 'user123',
        companyName: 'Another Corp',
        positionTitle: 'Developer',
        applicationDate: '2024-01-18T00:00:00.000Z',
        status: 'Applied',
        cvVersionId: 'custom-cv-v2',
        jobDescription: '',
        interviewDate: null,
        interviewNotes: null,
        rejectionDate: null,
        statusHistory: [{ status: 'Applied', timestamp: '2024-01-18T00:00:00.000Z', notes: null }],
        createdAt: '2024-01-18T00:00:00.000Z',
        lastModified: '2024-01-18T00:00:00.000Z'
      });

      const result = tracker.getAllApplications('user123', { 
        status: 'Applied',
        startDate: '2024-01-16',
        cvVersionId: 'custom-cv-v2'
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'app-003');
    });

    it('should return empty array when no applications match filters', () => {
      const result = tracker.getAllApplications('user123', { status: 'Rejected' });

      assert.strictEqual(result.length, 0);
      assert.ok(Array.isArray(result));
    });

    it('should return all applications when no filters provided', () => {
      const result = tracker.getAllApplications('user123', {});

      assert.strictEqual(result.length, 2);
    });

    it('should sort applications by date descending (newest first)', () => {
      // Add more applications with different dates
      savedData.users.user123.applications.push(
        {
          id: 'app-003',
          userId: 'user123',
          companyName: 'Oldest Corp',
          positionTitle: 'Developer',
          applicationDate: '2024-01-01T00:00:00.000Z',
          status: 'Applied',
          cvVersionId: 'default-cv-v1',
          jobDescription: '',
          interviewDate: null,
          interviewNotes: null,
          rejectionDate: null,
          statusHistory: [{ status: 'Applied', timestamp: '2024-01-01T00:00:00.000Z', notes: null }],
          createdAt: '2024-01-01T00:00:00.000Z',
          lastModified: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'app-004',
          userId: 'user123',
          companyName: 'Newest Corp',
          positionTitle: 'Developer',
          applicationDate: '2024-01-25T00:00:00.000Z',
          status: 'Applied',
          cvVersionId: 'default-cv-v1',
          jobDescription: '',
          interviewDate: null,
          interviewNotes: null,
          rejectionDate: null,
          statusHistory: [{ status: 'Applied', timestamp: '2024-01-25T00:00:00.000Z', notes: null }],
          createdAt: '2024-01-25T00:00:00.000Z',
          lastModified: '2024-01-25T00:00:00.000Z'
        }
      );

      const result = tracker.getAllApplications('user123');

      assert.strictEqual(result.length, 4);
      // Verify descending order by date (newest first)
      assert.strictEqual(result[0].id, 'app-004'); // 2024-01-25
      assert.strictEqual(result[1].id, 'app-002'); // 2024-01-20
      assert.strictEqual(result[2].id, 'app-001'); // 2024-01-15
      assert.strictEqual(result[3].id, 'app-003'); // 2024-01-01
    });
  });

  describe('updateApplication', () => {
    let savedData;

    beforeEach(() => {
      savedData = {
        version: "1.0",
        users: {
          user123: {
            applications: [
              {
                id: 'app-001',
                userId: 'user123',
                companyName: 'Acme Corp',
                positionTitle: 'Software Engineer',
                applicationDate: '2024-01-15T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'default-cv-v1',
                jobDescription: 'Looking for a developer',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-15T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              }
            ],
            cvVersions: []
          }
        }
      };

      mockStorageService = {
        load: () => savedData,
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should update company name', () => {
      const updates = { companyName: 'New Company Name' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.companyName, 'New Company Name');
    });

    it('should update position title', () => {
      const updates = { positionTitle: 'Senior Software Engineer' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.positionTitle, 'Senior Software Engineer');
    });

    it('should update job description', () => {
      const updates = { jobDescription: 'Updated job description' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.jobDescription, 'Updated job description');
    });

    it('should update interview date and notes', () => {
      const updates = {
        interviewDate: '2024-01-20',
        interviewNotes: 'Technical interview scheduled'
      };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.ok(result.interviewDate);
      assert.strictEqual(result.interviewNotes, 'Technical interview scheduled');
    });

    it('should update lastModified timestamp', () => {
      const originalLastModified = savedData.users.user123.applications[0].lastModified;
      
      // Wait a tiny bit to ensure timestamp changes
      const updates = { companyName: 'Updated Company' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.notStrictEqual(result.lastModified, originalLastModified);
      assert.ok(new Date(result.lastModified) >= new Date(originalLastModified));
    });

    it('should update status and append to status history', () => {
      const updates = { status: 'Interview' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.status, 'Interview');
      assert.strictEqual(result.statusHistory.length, 2);
      assert.strictEqual(result.statusHistory[1].status, 'Interview');
      assert.ok(result.statusHistory[1].timestamp);
    });

    it('should record rejection date when status changes to Rejected', () => {
      const updates = { status: 'Rejected' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.status, 'Rejected');
      assert.ok(result.rejectionDate);
      assert.ok(new Date(result.rejectionDate).getTime() > 0);
    });

    it('should include status notes in status history', () => {
      const updates = { 
        status: 'Interview',
        statusNotes: 'Scheduled for next week'
      };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.statusHistory.length, 2);
      assert.strictEqual(result.statusHistory[1].notes, 'Scheduled for next week');
    });

    it('should not add to status history if status unchanged', () => {
      const updates = { companyName: 'Updated Company' };
      const result = tracker.updateApplication('user123', 'app-001', updates);

      // Should still have only the original status history entry
      assert.strictEqual(result.statusHistory.length, 1);
    });

    it('should validate company name on update', () => {
      const updates = { companyName: '' };
      
      assert.throws(
        () => tracker.updateApplication('user123', 'app-001', updates),
        /Company name cannot be empty/
      );
    });

    it('should validate position title on update', () => {
      const updates = { positionTitle: '' };
      
      assert.throws(
        () => tracker.updateApplication('user123', 'app-001', updates),
        /Position title cannot be empty/
      );
    });

    it('should validate status on update', () => {
      const updates = { status: 'InvalidStatus' };
      
      assert.throws(
        () => tracker.updateApplication('user123', 'app-001', updates),
        /Status must be one of/
      );
    });

    it('should validate interview date is not before application date', () => {
      const updates = { interviewDate: '2024-01-01' }; // Before application date
      
      assert.throws(
        () => tracker.updateApplication('user123', 'app-001', updates),
        /cannot be before application date/
      );
    });

    it('should throw error for non-existent application', () => {
      const updates = { companyName: 'Updated Company' };
      
      assert.throws(
        () => tracker.updateApplication('user123', 'non-existent-id', updates),
        /Application not found/
      );
    });

    it('should throw error for non-existent user', () => {
      const updates = { companyName: 'Updated Company' };
      
      assert.throws(
        () => tracker.updateApplication('non-existent-user', 'app-001', updates),
        /Application not found/
      );
    });

    it('should sanitize text inputs on update', () => {
      const mockSanitize = (text, maxLen) => {
        return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
      };

      const updates = {
        companyName: 'Updated\x00Company\x01Name',
        positionTitle: 'Senior\x02Engineer'
      };

      const result = tracker.updateApplication('user123', 'app-001', updates, mockSanitize);

      assert.strictEqual(result.companyName, 'UpdatedCompanyName');
      assert.strictEqual(result.positionTitle, 'SeniorEngineer');
    });

    it('should handle multiple field updates at once', () => {
      const updates = {
        companyName: 'New Company',
        positionTitle: 'New Position',
        status: 'Interview',
        jobDescription: 'New description',
        interviewDate: '2024-01-25',
        interviewNotes: 'Interview notes'
      };

      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.companyName, 'New Company');
      assert.strictEqual(result.positionTitle, 'New Position');
      assert.strictEqual(result.status, 'Interview');
      assert.strictEqual(result.jobDescription, 'New description');
      assert.ok(result.interviewDate);
      assert.strictEqual(result.interviewNotes, 'Interview notes');
      assert.strictEqual(result.statusHistory.length, 2);
    });

    it('should save updated application to storage', () => {
      const updates = { companyName: 'Updated Company' };
      tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(savedData.users.user123.applications[0].companyName, 'Updated Company');
    });

    it('should handle clearing optional fields', () => {
      const updates = {
        jobDescription: '',
        interviewDate: null,
        interviewNotes: null
      };

      const result = tracker.updateApplication('user123', 'app-001', updates);

      assert.strictEqual(result.jobDescription, '');
      assert.strictEqual(result.interviewDate, null);
      assert.strictEqual(result.interviewNotes, null);
    });
  });

  describe('getStatistics', () => {
    let savedData;

    beforeEach(() => {
      savedData = {
        version: "1.0",
        users: {
          user123: {
            applications: [
              {
                id: 'app-001',
                userId: 'user123',
                companyName: 'Acme Corp',
                positionTitle: 'Software Engineer',
                applicationDate: '2024-01-15T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-15T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              },
              {
                id: 'app-002',
                userId: 'user123',
                companyName: 'Tech Inc',
                positionTitle: 'Senior Developer',
                applicationDate: '2024-01-20T00:00:00.000Z',
                status: 'Interview',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-20T00:00:00.000Z', notes: null },
                  { status: 'Interview', timestamp: '2024-01-25T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-20T00:00:00.000Z',
                lastModified: '2024-01-25T00:00:00.000Z'
              },
              {
                id: 'app-003',
                userId: 'user123',
                companyName: 'StartupCo',
                positionTitle: 'Developer',
                applicationDate: '2024-01-10T00:00:00.000Z',
                status: 'Rejected',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: '2024-01-15T00:00:00.000Z',
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null },
                  { status: 'Rejected', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-10T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              },
              {
                id: 'app-004',
                userId: 'user123',
                companyName: 'BigCorp',
                positionTitle: 'Senior Engineer',
                applicationDate: '2024-01-05T00:00:00.000Z',
                status: 'Offer',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-05T00:00:00.000Z', notes: null },
                  { status: 'Interview', timestamp: '2024-01-10T00:00:00.000Z', notes: null },
                  { status: 'Offer', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-05T00:00:00.000Z',
                lastModified: '2024-01-20T00:00:00.000Z'
              },
              {
                id: 'app-005',
                userId: 'user123',
                companyName: 'MegaCorp',
                positionTitle: 'Lead Developer',
                applicationDate: '2024-01-01T00:00:00.000Z',
                status: 'Accepted',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-01T00:00:00.000Z', notes: null },
                  { status: 'Interview', timestamp: '2024-01-08T00:00:00.000Z', notes: null },
                  { status: 'Offer', timestamp: '2024-01-15T00:00:00.000Z', notes: null },
                  { status: 'Accepted', timestamp: '2024-01-18T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-01T00:00:00.000Z',
                lastModified: '2024-01-18T00:00:00.000Z'
              }
            ],
            cvVersions: []
          }
        }
      };

      mockStorageService = {
        load: () => savedData,
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should calculate total applications count', () => {
      const stats = tracker.getStatistics('user123');

      assert.strictEqual(stats.totalApplications, 5);
    });

    it('should calculate counts by status', () => {
      const stats = tracker.getStatistics('user123');

      assert.strictEqual(stats.byStatus.applied, 1);
      assert.strictEqual(stats.byStatus.interview, 1);
      assert.strictEqual(stats.byStatus.rejected, 1);
      assert.strictEqual(stats.byStatus.offer, 1);
      assert.strictEqual(stats.byStatus.accepted, 1);
    });

    it('should calculate overall success rate', () => {
      const stats = tracker.getStatistics('user123');

      // Success = Interview + Offer + Accepted = 1 + 1 + 1 = 3
      // Success rate = (3 / 5) * 100 = 60%
      assert.strictEqual(stats.successRate, 60);
    });

    it('should calculate rejection count and rate', () => {
      const stats = tracker.getStatistics('user123');

      assert.strictEqual(stats.rejectionCount, 1);
      // Rejection rate = (1 / 5) * 100 = 20%
      assert.strictEqual(stats.rejectionRate, 20);
    });

    it('should calculate average response time', () => {
      const stats = tracker.getStatistics('user123');

      // app-002: 2024-01-20 to 2024-01-25 = 5 days
      // app-003: 2024-01-10 to 2024-01-15 = 5 days
      // app-004: 2024-01-05 to 2024-01-10 = 5 days
      // app-005: 2024-01-01 to 2024-01-08 = 7 days
      // Average = (5 + 5 + 5 + 7) / 4 = 5.5 days
      assert.strictEqual(stats.averageResponseTime, 5.5);
    });

    it('should return zero statistics for user with no applications', () => {
      savedData.users.emptyUser = { applications: [], cvVersions: [] };
      const stats = tracker.getStatistics('emptyUser');

      assert.strictEqual(stats.totalApplications, 0);
      assert.strictEqual(stats.byStatus.applied, 0);
      assert.strictEqual(stats.byStatus.interview, 0);
      assert.strictEqual(stats.byStatus.rejected, 0);
      assert.strictEqual(stats.byStatus.offer, 0);
      assert.strictEqual(stats.byStatus.accepted, 0);
      assert.strictEqual(stats.successRate, 0);
      assert.strictEqual(stats.rejectionCount, 0);
      assert.strictEqual(stats.rejectionRate, 0);
      assert.strictEqual(stats.averageResponseTime, 0);
    });

    it('should return zero statistics for non-existent user', () => {
      const stats = tracker.getStatistics('non-existent-user');

      assert.strictEqual(stats.totalApplications, 0);
      assert.strictEqual(stats.successRate, 0);
      assert.strictEqual(stats.rejectionRate, 0);
      assert.strictEqual(stats.averageResponseTime, 0);
    });

    it('should filter statistics by date range', () => {
      // Filter to only include applications from 2024-01-10 onwards
      const stats = tracker.getStatistics('user123', {
        startDate: '2024-01-10',
        endDate: '2024-01-20'
      });

      // Should include: app-003 (2024-01-10), app-001 (2024-01-15), app-002 (2024-01-20)
      assert.strictEqual(stats.totalApplications, 3);
      assert.strictEqual(stats.byStatus.applied, 1);
      assert.strictEqual(stats.byStatus.interview, 1);
      assert.strictEqual(stats.byStatus.rejected, 1);
    });

    it('should exclude applications still in Applied status from response time calculation', () => {
      // Create a user with only Applied status applications
      savedData.users.user456 = {
        applications: [
          {
            id: 'app-006',
            userId: 'user456',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Applied',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-15T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getStatistics('user456');

      // No responses yet, so average should be 0
      assert.strictEqual(stats.averageResponseTime, 0);
    });

    it('should handle all applications with same status', () => {
      savedData.users.user789 = {
        applications: [
          {
            id: 'app-007',
            userId: 'user789',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Rejected',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: '2024-01-20T00:00:00.000Z',
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null },
              { status: 'Rejected', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-20T00:00:00.000Z'
          },
          {
            id: 'app-008',
            userId: 'user789',
            companyName: 'Company B',
            positionTitle: 'Engineer',
            applicationDate: '2024-01-10T00:00:00.000Z',
            status: 'Rejected',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: '2024-01-18T00:00:00.000Z',
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null },
              { status: 'Rejected', timestamp: '2024-01-18T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-10T00:00:00.000Z',
            lastModified: '2024-01-18T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getStatistics('user789');

      assert.strictEqual(stats.totalApplications, 2);
      assert.strictEqual(stats.byStatus.rejected, 2);
      assert.strictEqual(stats.rejectionCount, 2);
      assert.strictEqual(stats.rejectionRate, 100);
      assert.strictEqual(stats.successRate, 0);
    });

    it('should round percentages to 2 decimal places', () => {
      // Create a scenario that produces non-round percentages
      savedData.users.userRound = {
        applications: [
          {
            id: 'app-009',
            userId: 'userRound',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Interview',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null },
              { status: 'Interview', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-20T00:00:00.000Z'
          },
          {
            id: 'app-010',
            userId: 'userRound',
            companyName: 'Company B',
            positionTitle: 'Engineer',
            applicationDate: '2024-01-10T00:00:00.000Z',
            status: 'Applied',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-10T00:00:00.000Z',
            lastModified: '2024-01-10T00:00:00.000Z'
          },
          {
            id: 'app-011',
            userId: 'userRound',
            companyName: 'Company C',
            positionTitle: 'Developer',
            applicationDate: '2024-01-05T00:00:00.000Z',
            status: 'Applied',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-05T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-05T00:00:00.000Z',
            lastModified: '2024-01-05T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getStatistics('userRound');

      // Success rate = (1 / 3) * 100 = 33.333...%
      assert.strictEqual(stats.successRate, 33.33);
      // Rejection rate = (0 / 3) * 100 = 0%
      assert.strictEqual(stats.rejectionRate, 0);
    });

    it('should use rejection date for rejected applications in response time', () => {
      savedData.users.userReject = {
        applications: [
          {
            id: 'app-012',
            userId: 'userReject',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-01T00:00:00.000Z',
            status: 'Rejected',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: '2024-01-11T00:00:00.000Z',
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-01T00:00:00.000Z', notes: null },
              { status: 'Rejected', timestamp: '2024-01-11T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-01T00:00:00.000Z',
            lastModified: '2024-01-11T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getStatistics('userReject');

      // Response time = 2024-01-11 - 2024-01-01 = 10 days
      assert.strictEqual(stats.averageResponseTime, 10);
    });
  });

  describe('getRejectionStats', () => {
    let savedData;

    beforeEach(() => {
      savedData = {
        version: "1.0",
        users: {
          user123: {
            applications: [
              {
                id: 'app-001',
                userId: 'user123',
                companyName: 'Acme Corp',
                positionTitle: 'Software Engineer',
                applicationDate: '2024-01-15T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-15T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              },
              {
                id: 'app-002',
                userId: 'user123',
                companyName: 'Tech Inc',
                positionTitle: 'Senior Developer',
                applicationDate: '2024-01-20T00:00:00.000Z',
                status: 'Rejected',
                cvVersionId: 'cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: '2024-01-25T00:00:00.000Z',
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-20T00:00:00.000Z', notes: null },
                  { status: 'Rejected', timestamp: '2024-01-25T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-20T00:00:00.000Z',
                lastModified: '2024-01-25T00:00:00.000Z'
              },
              {
                id: 'app-003',
                userId: 'user123',
                companyName: 'StartupCo',
                positionTitle: 'Developer',
                applicationDate: '2024-01-10T00:00:00.000Z',
                status: 'Rejected',
                cvVersionId: 'cv-v2',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: '2024-01-20T00:00:00.000Z',
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null },
                  { status: 'Rejected', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-10T00:00:00.000Z',
                lastModified: '2024-01-20T00:00:00.000Z'
              },
              {
                id: 'app-004',
                userId: 'user123',
                companyName: 'BigCorp',
                positionTitle: 'Senior Engineer',
                applicationDate: '2024-01-05T00:00:00.000Z',
                status: 'Interview',
                cvVersionId: 'cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-05T00:00:00.000Z', notes: null },
                  { status: 'Interview', timestamp: '2024-01-10T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-05T00:00:00.000Z',
                lastModified: '2024-01-10T00:00:00.000Z'
              },
              {
                id: 'app-005',
                userId: 'user123',
                companyName: 'MegaCorp',
                positionTitle: 'Lead Developer',
                applicationDate: '2024-01-01T00:00:00.000Z',
                status: 'Rejected',
                cvVersionId: 'cv-v2',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: '2024-01-08T00:00:00.000Z',
                statusHistory: [
                  { status: 'Applied', timestamp: '2024-01-01T00:00:00.000Z', notes: null },
                  { status: 'Rejected', timestamp: '2024-01-08T00:00:00.000Z', notes: null }
                ],
                createdAt: '2024-01-01T00:00:00.000Z',
                lastModified: '2024-01-08T00:00:00.000Z'
              }
            ],
            cvVersions: []
          }
        }
      };

      mockStorageService = {
        load: () => savedData,
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should calculate rejection count', () => {
      const stats = tracker.getRejectionStats('user123');

      assert.strictEqual(stats.rejectionCount, 3);
    });

    it('should calculate rejection rate', () => {
      const stats = tracker.getRejectionStats('user123');

      // Rejection rate = (3 / 5) * 100 = 60%
      assert.strictEqual(stats.rejectionRate, 60);
    });

    it('should calculate average time to rejection', () => {
      const stats = tracker.getRejectionStats('user123');

      // app-002: 2024-01-20 to 2024-01-25 = 5 days
      // app-003: 2024-01-10 to 2024-01-20 = 10 days
      // app-005: 2024-01-01 to 2024-01-08 = 7 days
      // Average = (5 + 10 + 7) / 3 = 7.33 days
      assert.strictEqual(stats.averageTimeToRejection, 7.33);
    });

    it('should group rejections by CV version', () => {
      const stats = tracker.getRejectionStats('user123');

      assert.strictEqual(stats.byCVVersion.length, 2);
      
      // Find cv-v1 stats
      const cvV1Stats = stats.byCVVersion.find(v => v.cvVersionId === 'cv-v1');
      assert.ok(cvV1Stats);
      assert.strictEqual(cvV1Stats.rejectionCount, 1);
      assert.strictEqual(cvV1Stats.totalApplications, 3); // app-001, app-002, app-004
      assert.strictEqual(cvV1Stats.rejectionRate, 33.33); // (1 / 3) * 100
      
      // Find cv-v2 stats
      const cvV2Stats = stats.byCVVersion.find(v => v.cvVersionId === 'cv-v2');
      assert.ok(cvV2Stats);
      assert.strictEqual(cvV2Stats.rejectionCount, 2);
      assert.strictEqual(cvV2Stats.totalApplications, 2); // app-003, app-005
      assert.strictEqual(cvV2Stats.rejectionRate, 100); // (2 / 2) * 100
    });

    it('should filter rejections by date range', () => {
      const stats = tracker.getRejectionStats('user123', {
        startDate: '2024-01-10',
        endDate: '2024-01-20'
      });

      // Should include: app-002 (2024-01-20), app-003 (2024-01-10), app-001 (2024-01-15)
      // Only app-002 and app-003 are rejected
      assert.strictEqual(stats.rejectionCount, 2);
      assert.strictEqual(stats.rejectionRate, 66.67); // (2 / 3) * 100
    });

    it('should return zero statistics for user with no rejections', () => {
      savedData.users.user456 = {
        applications: [
          {
            id: 'app-006',
            userId: 'user456',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Applied',
            cvVersionId: 'cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-15T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getRejectionStats('user456');

      assert.strictEqual(stats.rejectionCount, 0);
      assert.strictEqual(stats.rejectionRate, 0);
      assert.strictEqual(stats.averageTimeToRejection, 0);
      assert.strictEqual(stats.byCVVersion.length, 1);
      assert.strictEqual(stats.byCVVersion[0].rejectionCount, 0);
    });

    it('should return zero statistics for non-existent user', () => {
      const stats = tracker.getRejectionStats('non-existent-user');

      assert.strictEqual(stats.rejectionCount, 0);
      assert.strictEqual(stats.rejectionRate, 0);
      assert.strictEqual(stats.averageTimeToRejection, 0);
      assert.strictEqual(stats.byCVVersion.length, 0);
    });

    it('should handle rejections without rejection date', () => {
      savedData.users.user789 = {
        applications: [
          {
            id: 'app-007',
            userId: 'user789',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Rejected',
            cvVersionId: 'cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null, // Missing rejection date
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null },
              { status: 'Rejected', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-20T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getRejectionStats('user789');

      assert.strictEqual(stats.rejectionCount, 1);
      assert.strictEqual(stats.averageTimeToRejection, 0); // No valid rejection dates
    });

    it('should round percentages to 2 decimal places', () => {
      savedData.users.userRound = {
        applications: [
          {
            id: 'app-008',
            userId: 'userRound',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Rejected',
            cvVersionId: 'cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: '2024-01-20T00:00:00.000Z',
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null },
              { status: 'Rejected', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-20T00:00:00.000Z'
          },
          {
            id: 'app-009',
            userId: 'userRound',
            companyName: 'Company B',
            positionTitle: 'Engineer',
            applicationDate: '2024-01-10T00:00:00.000Z',
            status: 'Applied',
            cvVersionId: 'cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-10T00:00:00.000Z',
            lastModified: '2024-01-10T00:00:00.000Z'
          },
          {
            id: 'app-010',
            userId: 'userRound',
            companyName: 'Company C',
            positionTitle: 'Developer',
            applicationDate: '2024-01-05T00:00:00.000Z',
            status: 'Interview',
            cvVersionId: 'cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-05T00:00:00.000Z', notes: null },
              { status: 'Interview', timestamp: '2024-01-10T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-05T00:00:00.000Z',
            lastModified: '2024-01-10T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getRejectionStats('userRound');

      // Rejection rate = (1 / 3) * 100 = 33.333...%
      assert.strictEqual(stats.rejectionRate, 33.33);
    });

    it('should include CV versions with no rejections in byCVVersion', () => {
      savedData.users.userMixed = {
        applications: [
          {
            id: 'app-011',
            userId: 'userMixed',
            companyName: 'Company A',
            positionTitle: 'Developer',
            applicationDate: '2024-01-15T00:00:00.000Z',
            status: 'Interview',
            cvVersionId: 'cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null },
              { status: 'Interview', timestamp: '2024-01-20T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-15T00:00:00.000Z',
            lastModified: '2024-01-20T00:00:00.000Z'
          },
          {
            id: 'app-012',
            userId: 'userMixed',
            companyName: 'Company B',
            positionTitle: 'Engineer',
            applicationDate: '2024-01-10T00:00:00.000Z',
            status: 'Rejected',
            cvVersionId: 'cv-v2',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: '2024-01-15T00:00:00.000Z',
            statusHistory: [
              { status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null },
              { status: 'Rejected', timestamp: '2024-01-15T00:00:00.000Z', notes: null }
            ],
            createdAt: '2024-01-10T00:00:00.000Z',
            lastModified: '2024-01-15T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      const stats = tracker.getRejectionStats('userMixed');

      assert.strictEqual(stats.byCVVersion.length, 2);
      
      // cv-v1 should have 0 rejections
      const cvV1Stats = stats.byCVVersion.find(v => v.cvVersionId === 'cv-v1');
      assert.ok(cvV1Stats);
      assert.strictEqual(cvV1Stats.rejectionCount, 0);
      assert.strictEqual(cvV1Stats.totalApplications, 1);
      assert.strictEqual(cvV1Stats.rejectionRate, 0);
      
      // cv-v2 should have 1 rejection
      const cvV2Stats = stats.byCVVersion.find(v => v.cvVersionId === 'cv-v2');
      assert.ok(cvV2Stats);
      assert.strictEqual(cvV2Stats.rejectionCount, 1);
      assert.strictEqual(cvV2Stats.totalApplications, 1);
      assert.strictEqual(cvV2Stats.rejectionRate, 100);
    });
  });

  describe('deleteApplication', () => {
    let savedData;

    beforeEach(() => {
      savedData = {
        version: "1.0",
        users: {
          user123: {
            applications: [
              {
                id: 'app-001',
                userId: 'user123',
                companyName: 'Acme Corp',
                positionTitle: 'Software Engineer',
                applicationDate: '2024-01-15T00:00:00.000Z',
                status: 'Applied',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-15T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-15T00:00:00.000Z',
                lastModified: '2024-01-15T00:00:00.000Z'
              },
              {
                id: 'app-002',
                userId: 'user123',
                companyName: 'Tech Inc',
                positionTitle: 'Senior Developer',
                applicationDate: '2024-01-20T00:00:00.000Z',
                status: 'Interview',
                cvVersionId: 'default-cv-v1',
                jobDescription: '',
                interviewDate: null,
                interviewNotes: null,
                rejectionDate: null,
                statusHistory: [{ status: 'Applied', timestamp: '2024-01-20T00:00:00.000Z', notes: null }],
                createdAt: '2024-01-20T00:00:00.000Z',
                lastModified: '2024-01-20T00:00:00.000Z'
              }
            ],
            cvVersions: []
          }
        }
      };

      mockStorageService = {
        load: () => savedData,
        save: (data) => { savedData = data; },
        validate: () => true
      };
      tracker = new ApplicationTracker(mockStorageService);
    });

    it('should delete application and return true', () => {
      const result = tracker.deleteApplication('user123', 'app-001');

      assert.strictEqual(result, true);
      assert.strictEqual(savedData.users.user123.applications.length, 1);
      assert.strictEqual(savedData.users.user123.applications[0].id, 'app-002');
    });

    it('should return false for non-existent application ID', () => {
      const result = tracker.deleteApplication('user123', 'non-existent-id');

      assert.strictEqual(result, false);
      assert.strictEqual(savedData.users.user123.applications.length, 2);
    });

    it('should return false for non-existent user', () => {
      const result = tracker.deleteApplication('non-existent-user', 'app-001');

      assert.strictEqual(result, false);
    });

    it('should save updated data after deletion', () => {
      tracker.deleteApplication('user123', 'app-001');

      // Verify the application is removed from storage
      assert.strictEqual(savedData.users.user123.applications.length, 1);
      assert.strictEqual(savedData.users.user123.applications[0].id, 'app-002');
    });

    it('should handle deleting the last application', () => {
      // Delete first application
      tracker.deleteApplication('user123', 'app-001');
      assert.strictEqual(savedData.users.user123.applications.length, 1);

      // Delete second application
      const result = tracker.deleteApplication('user123', 'app-002');
      assert.strictEqual(result, true);
      assert.strictEqual(savedData.users.user123.applications.length, 0);
    });

    it('should not affect other users applications', () => {
      // Add another user with applications
      savedData.users.user456 = {
        applications: [
          {
            id: 'app-003',
            userId: 'user456',
            companyName: 'Other Company',
            positionTitle: 'Developer',
            applicationDate: '2024-01-10T00:00:00.000Z',
            status: 'Applied',
            cvVersionId: 'default-cv-v1',
            jobDescription: '',
            interviewDate: null,
            interviewNotes: null,
            rejectionDate: null,
            statusHistory: [{ status: 'Applied', timestamp: '2024-01-10T00:00:00.000Z', notes: null }],
            createdAt: '2024-01-10T00:00:00.000Z',
            lastModified: '2024-01-10T00:00:00.000Z'
          }
        ],
        cvVersions: []
      };

      // Delete from user123
      tracker.deleteApplication('user123', 'app-001');

      // Verify user456's applications are unchanged
      assert.strictEqual(savedData.users.user456.applications.length, 1);
      assert.strictEqual(savedData.users.user456.applications[0].id, 'app-003');
    });

    it('should verify application is not retrievable after deletion', () => {
      tracker.deleteApplication('user123', 'app-001');

      const result = tracker.getApplication('user123', 'app-001');
      assert.strictEqual(result, null);
    });
  });
});
