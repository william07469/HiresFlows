// PerformanceAnalyzer for Job Application Tracker
// Analyzes CV version performance and calculates success metrics

export class PerformanceAnalyzer {
  constructor(applicationTracker, cvVersionManager) {
    this.applicationTracker = applicationTracker;
    this.cvVersionManager = cvVersionManager;
  }

  // Performance analysis methods will be implemented in task 8
  /**
     * Analyze performance metrics for a specific CV version
     * @param {string} userId - User identifier
     * @param {string} versionId - CV version ID
     * @returns {Object} Performance analysis with success rate, rejection rate, response time, and breakdown
     * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
     */
    analyzeVersion(userId, versionId) {
      // Get the CV version
      const version = this.cvVersionManager.getVersion(userId, versionId);
      if (!version) {
        throw new Error('CV version not found');
      }

      // Get all applications for this CV version
      const applications = this.cvVersionManager.getApplicationsByVersion(userId, versionId);

      const totalApplications = applications.length;

      // Calculate breakdown by status
      const breakdown = {
        applied: 0,
        interview: 0,
        rejected: 0,
        offer: 0,
        accepted: 0
      };

      applications.forEach(app => {
        const status = app.status.toLowerCase();
        if (breakdown.hasOwnProperty(status)) {
          breakdown[status]++;
        }
      });

      // Calculate success rate: (Interview + Offer + Accepted) / total * 100
      const successCount = breakdown.interview + breakdown.offer + breakdown.accepted;
      const successRate = totalApplications > 0 
        ? (successCount / totalApplications) * 100 
        : 0;

      // Calculate rejection rate
      const rejectionRate = totalApplications > 0 
        ? (breakdown.rejected / totalApplications) * 100 
        : 0;

      // Calculate average response time
      const averageResponseTime = this.calculateAverageResponseTime(applications);

      // Mark as insufficient data if fewer than 3 applications
      const sufficientData = totalApplications >= 3;

      return {
        versionId: version.id,
        versionName: version.name,
        totalApplications,
        successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
        rejectionRate: Math.round(rejectionRate * 100) / 100, // Round to 2 decimal places
        averageResponseTime: Math.round(averageResponseTime * 100) / 100, // Round to 2 decimal places
        breakdown,
        sufficientData
      };
    }


  /**
     * Compare all CV versions and rank them by success rate
     * @param {string} userId - User identifier
     * @returns {Array} Array of version performance analyses ranked by success rate (descending)
     * Requirements: 6.6, 6.7
     */
    compareVersions(userId) {
      // Get all CV versions for the user
      const versions = this.cvVersionManager.getAllVersions(userId);

      if (!versions || versions.length === 0) {
        return [];
      }

      // Analyze each version
      const analyses = versions.map(version => {
        try {
          return this.analyzeVersion(userId, version.id);
        } catch (error) {
          // If analysis fails for a version, return a default analysis
          return {
            versionId: version.id,
            versionName: version.name,
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
          };
        }
      });

      // Sort by success rate (descending), then by total applications (descending) as tiebreaker
      analyses.sort((a, b) => {
        if (b.successRate !== a.successRate) {
          return b.successRate - a.successRate;
        }
        return b.totalApplications - a.totalApplications;
      });

      // Assign ranks
      const rankedAnalyses = analyses.map((analysis, index) => ({
        ...analysis,
        rank: index + 1
      }));

      return rankedAnalyses;
    }


  /**
   * Get the best performing CV version (highest success rate)
   * @param {string} userId - User identifier
   * @returns {Object|null} Best performing CV version with performance metrics, or null if no versions exist
   * Requirements: 9.4
   */
  getBestPerformingVersion(userId) {
    // Get all versions ranked by performance
    const rankedVersions = this.compareVersions(userId);

    // Return null if no versions exist
    if (!rankedVersions || rankedVersions.length === 0) {
      return null;
    }

    // Return the top-ranked version (highest success rate)
    return rankedVersions[0];
  }

  /**
   * Calculate success rate for a set of applications
   * @param {Array} applications - Array of application records
   * @returns {number} Success rate as a percentage (0-100)
   */
  calculateSuccessRate(applications) {
    if (!applications || applications.length === 0) {
      return 0;
    }

    const successCount = applications.filter(app => 
      app.status === 'Interview' || 
      app.status === 'Offer' || 
      app.status === 'Accepted'
    ).length;

    return (successCount / applications.length) * 100;
  }

  /**
   * Calculate average response time for a set of applications
   * @param {Array} applications - Array of application records
   * @returns {number} Average response time in days
   */
  calculateAverageResponseTime(applications) {
    if (!applications || applications.length === 0) {
      return 0;
    }

    let totalResponseTime = 0;
    let applicationsWithResponse = 0;

    applications.forEach(app => {
      const applicationDate = new Date(app.applicationDate);
      let responseDate = null;

      // Determine response date based on status
      if (app.status === 'Rejected' && app.rejectionDate) {
        responseDate = new Date(app.rejectionDate);
      } else if (app.status === 'Interview' && app.interviewDate) {
        responseDate = new Date(app.interviewDate);
      } else if (app.statusHistory && app.statusHistory.length > 1) {
        // Find first status change after "Applied"
        const firstResponse = app.statusHistory.find(
          (entry, index) => index > 0 && entry.status !== 'Applied'
        );
        if (firstResponse) {
          responseDate = new Date(firstResponse.timestamp);
        }
      }

      if (responseDate) {
        const diffTime = responseDate - applicationDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24); // Convert milliseconds to days
        totalResponseTime += diffDays;
        applicationsWithResponse++;
      }
    });

    return applicationsWithResponse > 0 
      ? totalResponseTime / applicationsWithResponse 
      : 0;
  }
}
