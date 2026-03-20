// Unit tests for PerformanceAnalyzer
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PerformanceAnalyzer } from '../../src/job-tracker/performance-analyzer.js';
import { ApplicationTracker } from '../../src/job-tracker/application-tracker.js';
import { CVVersionManager } from '../../src/job-tracker/cv-version-manager.js';
import { StorageService } from '../../src/job-tracker/storage-service.js';
import fs from 'fs';
import path from 'path';

describe('PerformanceAnalyzer', () => {
  let storageService;
  let applicationTracker;
  let cvVersionManager;
  let performanceAnalyzer;
  let testFilePath;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Create a temporary test file
    testFilePath = path.join(process.cwd(), `test-applications-${Date.now()}.json`);
    storageService = new StorageService(testFilePath);
    applicationTracker = new ApplicationTracker(storageService);
    cvVersionManager = new CVVersionManager(storageService);
    performanceAnalyzer = new PerformanceAnalyzer(applicationTracker, cvVersionManager);
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('analyzeVersion', () => {
    it('should throw error for non-existent CV version', () => {
      assert.throws(() => {
        performanceAnalyzer.analyzeVersion(testUserId, 'non-existent-id');
      }, /CV version not found/);
    });

    it('should return correct analysis for CV version with no applications', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume',
        description: 'For tech jobs'
      });

      const analysis = performanceAnalyzer.analyzeVersion(testUserId, cvVersion.id);

      assert.deepStrictEqual(analysis, {
        versionId: cvVersion.id,
        versionName: 'Tech Resume',
        totalApplications: 0,
        successRate: 0,
        rejectionRate: 0,
        averageResponseTime: 0,
        breakdown: {
          applied: 0,
          interview: 0,
          rejected: 0,
          offer: 0,
          accepted: 0
        },
        sufficientData: false
      });
    });

    it('should mark as insufficient data when fewer than 3 applications', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume'
      });

      // Create 2 applications
      applicationTracker.createApplication(testUserId, {
        companyName: 'Company A',
        positionTitle: 'Developer',
        applicationDate: '2024-01-01',
        cvVersionId: cvVersion.id
      });

      applicationTracker.createApplication(testUserId, {
        companyName: 'Company B',
        positionTitle: 'Engineer',
        applicationDate: '2024-01-02',
        cvVersionId: cvVersion.id
      });

      const analysis = performanceAnalyzer.analyzeVersion(testUserId, cvVersion.id);

      assert.strictEqual(analysis.totalApplications, 2);
      assert.strictEqual(analysis.sufficientData, false);
    });

    it('should mark as sufficient data when 3 or more applications', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume'
      });

      // Create 3 applications
      for (let i = 0; i < 3; i++) {
        applicationTracker.createApplication(testUserId, {
          companyName: `Company ${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: cvVersion.id
        });
      }

      const analysis = performanceAnalyzer.analyzeVersion(testUserId, cvVersion.id);

      assert.strictEqual(analysis.totalApplications, 3);
      assert.strictEqual(analysis.sufficientData, true);
    });

    it('should calculate success rate correctly', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume'
      });

      // Create applications with different statuses
      const app1 = applicationTracker.createApplication(testUserId, {
        companyName: 'Company A',
        positionTitle: 'Developer',
        applicationDate: '2024-01-01',
        cvVersionId: cvVersion.id
      });

      const app2 = applicationTracker.createApplication(testUserId, {
        companyName: 'Company B',
        positionTitle: 'Engineer',
        applicationDate: '2024-01-02',
        cvVersionId: cvVersion.id
      });

      const app3 = applicationTracker.createApplication(testUserId, {
        companyName: 'Company C',
        positionTitle: 'Developer',
        applicationDate: '2024-01-03',
        cvVersionId: cvVersion.id
      });

      const app4 = applicationTracker.createApplication(testUserId, {
        companyName: 'Company D',
        positionTitle: 'Engineer',
        applicationDate: '2024-01-04',
        cvVersionId: cvVersion.id
      });

      // Update statuses: 1 Interview, 1 Offer, 1 Rejected, 1 Applied
      applicationTracker.updateApplication(testUserId, app1.id, { status: 'Interview' });
      applicationTracker.updateApplication(testUserId, app2.id, { status: 'Offer' });
      applicationTracker.updateApplication(testUserId, app3.id, { status: 'Rejected' });
      // app4 stays as Applied

      const analysis = performanceAnalyzer.analyzeVersion(testUserId, cvVersion.id);

      // Success rate = (1 Interview + 1 Offer + 0 Accepted) / 4 * 100 = 50%
      assert.strictEqual(analysis.successRate, 50);
      assert.strictEqual(analysis.rejectionRate, 25); // 1 rejected / 4 total = 25%
      assert.deepStrictEqual(analysis.breakdown, {
        applied: 1,
        interview: 1,
        rejected: 1,
        offer: 1,
        accepted: 0
      });
    });

    it('should calculate rejection rate correctly', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume'
      });

      // Create 5 applications, 2 rejected
      for (let i = 0; i < 5; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company ${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: cvVersion.id
        });

        if (i < 2) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Rejected' });
        }
      }

      const analysis = performanceAnalyzer.analyzeVersion(testUserId, cvVersion.id);

      // Rejection rate = 2 / 5 * 100 = 40%
      assert.strictEqual(analysis.rejectionRate, 40);
    });

    it('should return correct breakdown by status', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume'
      });

      // Create applications with all different statuses
      const statuses = ['Applied', 'Interview', 'Rejected', 'Offer', 'Accepted'];
      const apps = [];

      for (const status of statuses) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company ${status}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: cvVersion.id
        });
        apps.push(app);

        if (status !== 'Applied') {
          applicationTracker.updateApplication(testUserId, app.id, { status });
        }
      }

      const analysis = performanceAnalyzer.analyzeVersion(testUserId, cvVersion.id);

      assert.deepStrictEqual(analysis.breakdown, {
        applied: 1,
        interview: 1,
        rejected: 1,
        offer: 1,
        accepted: 1
      });
    });
  });

  describe('calculateSuccessRate', () => {
    it('should return 0 for empty array', () => {
      const rate = performanceAnalyzer.calculateSuccessRate([]);
      assert.strictEqual(rate, 0);
    });

    it('should return 0 for null input', () => {
      const rate = performanceAnalyzer.calculateSuccessRate(null);
      assert.strictEqual(rate, 0);
    });

    it('should calculate success rate correctly', () => {
      const applications = [
        { status: 'Applied' },
        { status: 'Interview' },
        { status: 'Rejected' },
        { status: 'Offer' },
        { status: 'Accepted' }
      ];

      const rate = performanceAnalyzer.calculateSuccessRate(applications);
      // 3 successful (Interview, Offer, Accepted) / 5 total = 60%
      assert.strictEqual(rate, 60);
    });

    it('should return 0 when no successful applications', () => {
      const applications = [
        { status: 'Applied' },
        { status: 'Rejected' }
      ];

      const rate = performanceAnalyzer.calculateSuccessRate(applications);
      assert.strictEqual(rate, 0);
    });

    it('should return 100 when all applications are successful', () => {
      const applications = [
        { status: 'Interview' },
        { status: 'Offer' },
        { status: 'Accepted' }
      ];

      const rate = performanceAnalyzer.calculateSuccessRate(applications);
      assert.strictEqual(rate, 100);
    });
  });

  describe('calculateAverageResponseTime', () => {
    it('should return 0 for empty array', () => {
      const time = performanceAnalyzer.calculateAverageResponseTime([]);
      assert.strictEqual(time, 0);
    });

    it('should return 0 for null input', () => {
      const time = performanceAnalyzer.calculateAverageResponseTime(null);
      assert.strictEqual(time, 0);
    });

    it('should calculate average response time using rejection date', () => {
      const applications = [
        {
          applicationDate: '2024-01-01',
          status: 'Rejected',
          rejectionDate: '2024-01-08' // 7 days
        },
        {
          applicationDate: '2024-01-01',
          status: 'Rejected',
          rejectionDate: '2024-01-15' // 14 days
        }
      ];

      const time = performanceAnalyzer.calculateAverageResponseTime(applications);
      // Average = (7 + 14) / 2 = 10.5 days
      assert.strictEqual(time, 10.5);
    });

    it('should calculate average response time using interview date', () => {
      const applications = [
        {
          applicationDate: '2024-01-01',
          status: 'Interview',
          interviewDate: '2024-01-11' // 10 days
        }
      ];

      const time = performanceAnalyzer.calculateAverageResponseTime(applications);
      assert.strictEqual(time, 10);
    });

    it('should calculate average response time using status history', () => {
      const applications = [
        {
          applicationDate: '2024-01-01',
          status: 'Offer',
          statusHistory: [
            { status: 'Applied', timestamp: '2024-01-01T00:00:00Z' },
            { status: 'Interview', timestamp: '2024-01-06T00:00:00Z' }, // 5 days
            { status: 'Offer', timestamp: '2024-01-10T00:00:00Z' }
          ]
        }
      ];

      const time = performanceAnalyzer.calculateAverageResponseTime(applications);
      assert.strictEqual(time, 5);
    });

    it('should ignore applications without response dates', () => {
      const applications = [
        {
          applicationDate: '2024-01-01',
          status: 'Applied' // No response yet
        },
        {
          applicationDate: '2024-01-01',
          status: 'Rejected',
          rejectionDate: '2024-01-11' // 10 days
        }
      ];

      const time = performanceAnalyzer.calculateAverageResponseTime(applications);
      // Only count the one with response: 10 days
      assert.strictEqual(time, 10);
    });
  });

  describe('compareVersions', () => {
    it('should return empty array when no CV versions exist', () => {
      const comparison = performanceAnalyzer.compareVersions(testUserId);
      assert.deepStrictEqual(comparison, []);
    });

    it('should return single version with rank 1', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Tech Resume'
      });

      // Create some applications
      for (let i = 0; i < 3; i++) {
        applicationTracker.createApplication(testUserId, {
          companyName: `Company ${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: cvVersion.id
        });
      }

      const comparison = performanceAnalyzer.compareVersions(testUserId);

      assert.strictEqual(comparison.length, 1);
      assert.strictEqual(comparison[0].rank, 1);
      assert.strictEqual(comparison[0].versionId, cvVersion.id);
      assert.strictEqual(comparison[0].versionName, 'Tech Resume');
    });

    it('should rank versions by success rate in descending order', () => {
      // Create three CV versions
      const version1 = cvVersionManager.createVersion(testUserId, {
        name: 'Low Success Resume'
      });
      const version2 = cvVersionManager.createVersion(testUserId, {
        name: 'High Success Resume'
      });
      const version3 = cvVersionManager.createVersion(testUserId, {
        name: 'Medium Success Resume'
      });

      // Version 1: 1 interview out of 4 = 25% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V1-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version1.id
        });
        if (i === 0) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      // Version 2: 3 interviews out of 4 = 75% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V2-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version2.id
        });
        if (i < 3) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      // Version 3: 2 interviews out of 4 = 50% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V3-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version3.id
        });
        if (i < 2) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      const comparison = performanceAnalyzer.compareVersions(testUserId);

      assert.strictEqual(comparison.length, 3);
      
      // Check ranking order: High (75%) -> Medium (50%) -> Low (25%)
      assert.strictEqual(comparison[0].rank, 1);
      assert.strictEqual(comparison[0].versionName, 'High Success Resume');
      assert.strictEqual(comparison[0].successRate, 75);

      assert.strictEqual(comparison[1].rank, 2);
      assert.strictEqual(comparison[1].versionName, 'Medium Success Resume');
      assert.strictEqual(comparison[1].successRate, 50);

      assert.strictEqual(comparison[2].rank, 3);
      assert.strictEqual(comparison[2].versionName, 'Low Success Resume');
      assert.strictEqual(comparison[2].successRate, 25);
    });

    it('should use total applications as tiebreaker when success rates are equal', () => {
      // Create two CV versions with same success rate
      const version1 = cvVersionManager.createVersion(testUserId, {
        name: 'Resume A'
      });
      const version2 = cvVersionManager.createVersion(testUserId, {
        name: 'Resume B'
      });

      // Version 1: 2 interviews out of 4 = 50% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V1-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version1.id
        });
        if (i < 2) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      // Version 2: 3 interviews out of 6 = 50% success rate (more applications)
      for (let i = 0; i < 6; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V2-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version2.id
        });
        if (i < 3) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      const comparison = performanceAnalyzer.compareVersions(testUserId);

      assert.strictEqual(comparison.length, 2);
      
      // Version 2 should rank higher due to more applications (tiebreaker)
      assert.strictEqual(comparison[0].rank, 1);
      assert.strictEqual(comparison[0].versionName, 'Resume B');
      assert.strictEqual(comparison[0].totalApplications, 6);

      assert.strictEqual(comparison[1].rank, 2);
      assert.strictEqual(comparison[1].versionName, 'Resume A');
      assert.strictEqual(comparison[1].totalApplications, 4);
    });

    it('should include versions with no applications', () => {
      // Create two versions, one with applications and one without
      const version1 = cvVersionManager.createVersion(testUserId, {
        name: 'Used Resume'
      });
      const version2 = cvVersionManager.createVersion(testUserId, {
        name: 'Unused Resume'
      });

      // Only add applications to version1
      for (let i = 0; i < 3; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company ${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version1.id
        });
        if (i === 0) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      const comparison = performanceAnalyzer.compareVersions(testUserId);

      assert.strictEqual(comparison.length, 2);
      
      // Used resume should rank first
      assert.strictEqual(comparison[0].rank, 1);
      assert.strictEqual(comparison[0].versionName, 'Used Resume');
      assert.strictEqual(comparison[0].totalApplications, 3);

      // Unused resume should rank second with 0 applications
      assert.strictEqual(comparison[1].rank, 2);
      assert.strictEqual(comparison[1].versionName, 'Unused Resume');
      assert.strictEqual(comparison[1].totalApplications, 0);
      assert.strictEqual(comparison[1].successRate, 0);
    });

    it('should handle versions with mixed success statuses', () => {
      // Create a version with Interview, Offer, and Accepted statuses
      const version = cvVersionManager.createVersion(testUserId, {
        name: 'Mixed Success Resume'
      });

      const statuses = ['Interview', 'Offer', 'Accepted', 'Rejected', 'Applied'];
      for (const status of statuses) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company ${status}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version.id
        });
        if (status !== 'Applied') {
          applicationTracker.updateApplication(testUserId, app.id, { status });
        }
      }

      const comparison = performanceAnalyzer.compareVersions(testUserId);

      assert.strictEqual(comparison.length, 1);
      assert.strictEqual(comparison[0].rank, 1);
      // Success rate = (1 Interview + 1 Offer + 1 Accepted) / 5 = 60%
      assert.strictEqual(comparison[0].successRate, 60);
      assert.strictEqual(comparison[0].totalApplications, 5);
    });
  });

  describe('getBestPerformingVersion', () => {
    it('should return null when no CV versions exist', () => {
      const best = performanceAnalyzer.getBestPerformingVersion(testUserId);
      assert.strictEqual(best, null);
    });

    it('should return the only version when only one exists', () => {
      // Create a single CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Only Resume'
      });

      // Create some applications
      for (let i = 0; i < 3; i++) {
        applicationTracker.createApplication(testUserId, {
          companyName: `Company ${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: cvVersion.id
        });
      }

      const best = performanceAnalyzer.getBestPerformingVersion(testUserId);

      assert.strictEqual(best.versionId, cvVersion.id);
      assert.strictEqual(best.versionName, 'Only Resume');
      assert.strictEqual(best.rank, 1);
    });

    it('should return the version with highest success rate', () => {
      // Create three CV versions with different success rates
      const version1 = cvVersionManager.createVersion(testUserId, {
        name: 'Low Success Resume'
      });
      const version2 = cvVersionManager.createVersion(testUserId, {
        name: 'High Success Resume'
      });
      const version3 = cvVersionManager.createVersion(testUserId, {
        name: 'Medium Success Resume'
      });

      // Version 1: 1 interview out of 4 = 25% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V1-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version1.id
        });
        if (i === 0) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      // Version 2: 3 interviews out of 4 = 75% success rate (BEST)
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V2-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version2.id
        });
        if (i < 3) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      // Version 3: 2 interviews out of 4 = 50% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V3-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version3.id
        });
        if (i < 2) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      const best = performanceAnalyzer.getBestPerformingVersion(testUserId);

      assert.strictEqual(best.versionId, version2.id);
      assert.strictEqual(best.versionName, 'High Success Resume');
      assert.strictEqual(best.successRate, 75);
      assert.strictEqual(best.rank, 1);
    });

    it('should return version with more applications when success rates are equal', () => {
      // Create two CV versions with same success rate
      const version1 = cvVersionManager.createVersion(testUserId, {
        name: 'Resume A'
      });
      const version2 = cvVersionManager.createVersion(testUserId, {
        name: 'Resume B'
      });

      // Version 1: 2 interviews out of 4 = 50% success rate
      for (let i = 0; i < 4; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V1-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version1.id
        });
        if (i < 2) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      // Version 2: 3 interviews out of 6 = 50% success rate (more applications, should be best)
      for (let i = 0; i < 6; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company V2-${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version2.id
        });
        if (i < 3) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      const best = performanceAnalyzer.getBestPerformingVersion(testUserId);

      assert.strictEqual(best.versionId, version2.id);
      assert.strictEqual(best.versionName, 'Resume B');
      assert.strictEqual(best.successRate, 50);
      assert.strictEqual(best.totalApplications, 6);
      assert.strictEqual(best.rank, 1);
    });

    it('should return version with applications over version without applications', () => {
      // Create two versions
      const version1 = cvVersionManager.createVersion(testUserId, {
        name: 'Used Resume'
      });
      const version2 = cvVersionManager.createVersion(testUserId, {
        name: 'Unused Resume'
      });

      // Only add applications to version1
      for (let i = 0; i < 3; i++) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company ${i}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: version1.id
        });
        if (i === 0) {
          applicationTracker.updateApplication(testUserId, app.id, { status: 'Interview' });
        }
      }

      const best = performanceAnalyzer.getBestPerformingVersion(testUserId);

      assert.strictEqual(best.versionId, version1.id);
      assert.strictEqual(best.versionName, 'Used Resume');
      assert.strictEqual(best.rank, 1);
    });

    it('should include all performance metrics in the returned object', () => {
      // Create a CV version
      const cvVersion = cvVersionManager.createVersion(testUserId, {
        name: 'Complete Resume'
      });

      // Create applications with mixed statuses
      const statuses = ['Interview', 'Offer', 'Rejected', 'Applied'];
      for (const status of statuses) {
        const app = applicationTracker.createApplication(testUserId, {
          companyName: `Company ${status}`,
          positionTitle: 'Developer',
          applicationDate: '2024-01-01',
          cvVersionId: cvVersion.id
        });
        if (status !== 'Applied') {
          applicationTracker.updateApplication(testUserId, app.id, { status });
        }
      }

      const best = performanceAnalyzer.getBestPerformingVersion(testUserId);

      // Verify all expected fields are present
      assert.ok(best.versionId);
      assert.ok(best.versionName);
      assert.ok(typeof best.totalApplications === 'number');
      assert.ok(typeof best.successRate === 'number');
      assert.ok(typeof best.rejectionRate === 'number');
      assert.ok(typeof best.averageResponseTime === 'number');
      assert.ok(best.breakdown);
      assert.ok(typeof best.sufficientData === 'boolean');
      assert.ok(typeof best.rank === 'number');
    });
  });
});
