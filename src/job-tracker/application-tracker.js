// ApplicationTracker for Job Application Tracker
// Core component for managing application records

import crypto from 'crypto';

export class ApplicationTracker {
  constructor(storageService) {
    if (!storageService) {
      throw new Error('StorageService is required');
    }
    this.storageService = storageService;
    this.validStatuses = ['Applied', 'Interview', 'Rejected', 'Offer', 'Accepted'];
  }

  // Validation helpers
  
  /**
   * Validate company name
   * @param {string} companyName - Company name to validate
   * @throws {Error} If validation fails
   */
  validateCompanyName(companyName) {
    if (typeof companyName !== 'string') {
      throw new Error('Company name is required');
    }
    
    const trimmed = companyName.trim();
    if (trimmed.length === 0) {
      throw new Error('Company name cannot be empty');
    }
    
    if (trimmed.length > 200) {
      throw new Error('Company name must be 200 characters or less');
    }
  }

  /**
   * Validate position title
   * @param {string} positionTitle - Position title to validate
   * @throws {Error} If validation fails
   */
  validatePositionTitle(positionTitle) {
    if (typeof positionTitle !== 'string') {
      throw new Error('Position title is required');
    }
    
    const trimmed = positionTitle.trim();
    if (trimmed.length === 0) {
      throw new Error('Position title cannot be empty');
    }
    
    if (trimmed.length > 200) {
      throw new Error('Position title must be 200 characters or less');
    }
  }

  /**
   * Validate job description
   * @param {string} jobDescription - Job description to validate
   * @throws {Error} If validation fails
   */
  validateJobDescription(jobDescription) {
    if (jobDescription === null || jobDescription === undefined) {
      return; // Optional field
    }
    
    if (typeof jobDescription !== 'string') {
      throw new Error('Job description must be a string');
    }
    
    if (jobDescription.length > 10000) {
      throw new Error('Job description must be 10000 characters or less');
    }
  }

  /**
   * Validate application status
   * @param {string} status - Status to validate
   * @throws {Error} If validation fails
   */
  validateStatus(status) {
    if (!status || typeof status !== 'string') {
      throw new Error('Status is required');
    }
    
    if (!this.validStatuses.includes(status)) {
      throw new Error(`Status must be one of: ${this.validStatuses.join(', ')}`);
    }
  }

  /**
   * Validate application date
   * @param {string|Date} applicationDate - Application date to validate
   * @throws {Error} If validation fails
   */
  validateApplicationDate(applicationDate) {
    if (!applicationDate) {
      throw new Error('Application date is required');
    }
    
    const date = new Date(applicationDate);
    if (isNaN(date.getTime())) {
      throw new Error('Application date must be a valid date');
    }
    
    const now = new Date();
    if (date > now) {
      throw new Error('Application date cannot be in the future');
    }
  }

  /**
   * Validate interview date against application date
   * @param {string|Date} interviewDate - Interview date to validate
   * @param {string|Date} applicationDate - Application date for comparison
   * @throws {Error} If validation fails
   */
  validateInterviewDate(interviewDate, applicationDate) {
    if (!interviewDate) {
      return; // Optional field
    }
    
    const interview = new Date(interviewDate);
    if (isNaN(interview.getTime())) {
      throw new Error('Interview date must be a valid date');
    }
    
    const application = new Date(applicationDate);
    if (interview < application) {
      throw new Error('Interview date cannot be before application date');
    }
  }

  // CRUD operations will be implemented in task 3
  
  /**
   * Create a new application record
   * @param {string} userId - User identifier
   * @param {Object} applicationData - Application data
   * @param {string} applicationData.companyName - Company name (1-200 chars)
   * @param {string} applicationData.positionTitle - Position title (1-200 chars)
   * @param {string|Date} applicationData.applicationDate - Application date
   * @param {string} [applicationData.cvVersionId] - CV version ID (optional)
   * @param {string} [applicationData.jobDescription] - Job description (0-10000 chars, optional)
   * @param {string|Date} [applicationData.interviewDate] - Interview date (optional)
   * @param {string} [applicationData.interviewNotes] - Interview notes (optional)
   * @param {function} [sanitizeTextFn] - Text sanitization function (optional, for testing)
   * @returns {Object} Created application record
   * @throws {Error} If validation fails
   */
  createApplication(userId, applicationData, sanitizeTextFn = null) {
    // Validate required fields
    this.validateCompanyName(applicationData.companyName);
    this.validatePositionTitle(applicationData.positionTitle);
    this.validateApplicationDate(applicationData.applicationDate);
    
    // Validate optional fields
    if (applicationData.jobDescription !== undefined && applicationData.jobDescription !== null) {
      this.validateJobDescription(applicationData.jobDescription);
    }
    
    if (applicationData.interviewDate) {
      this.validateInterviewDate(applicationData.interviewDate, applicationData.applicationDate);
    }
    
    // Sanitize text inputs
    const sanitize = sanitizeTextFn || ((text, maxLen) => {
      if (typeof text !== 'string') return '';
      return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
    });
    
    const companyName = sanitize(applicationData.companyName, 200);
    const positionTitle = sanitize(applicationData.positionTitle, 200);
    const jobDescription = applicationData.jobDescription 
      ? sanitize(applicationData.jobDescription, 10000) 
      : '';
    const interviewNotes = applicationData.interviewNotes 
      ? sanitize(applicationData.interviewNotes, 5000) 
      : null;
    
    // Generate unique UUID for application ID
    const applicationId = crypto.randomUUID();
    
    // Assign default CV version if not provided
    const cvVersionId = applicationData.cvVersionId || 'default-cv-v1';
    
    // Record creation timestamp
    const now = new Date().toISOString();
    
    // Create application record
    const application = {
      id: applicationId,
      userId,
      companyName,
      positionTitle,
      applicationDate: new Date(applicationData.applicationDate).toISOString(),
      status: 'Applied', // Default status
      cvVersionId,
      jobDescription,
      interviewDate: applicationData.interviewDate 
        ? new Date(applicationData.interviewDate).toISOString() 
        : null,
      interviewNotes,
      rejectionDate: null,
      statusHistory: [
        {
          status: 'Applied',
          timestamp: now,
          notes: null
        }
      ],
      createdAt: now,
      lastModified: now
    };
    
    // Load current data
    const data = this.storageService.load();
    
    // Initialize user data if not exists
    if (!data.users[userId]) {
      data.users[userId] = {
        applications: [],
        cvVersions: []
      };
    }
    
    // Add application to user's applications
    data.users[userId].applications.push(application);
    
    // Save to storage
    this.storageService.save(data);
    
    return application;
  }

  /**
   * Get a single application by ID
   * @param {string} userId - User identifier
   * @param {string} applicationId - Application ID
   * @returns {Object|null} Application record or null if not found
   */
  getApplication(userId, applicationId) {
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      return null;
    }
    
    // Find application by ID
    const application = data.users[userId].applications.find(
      app => app.id === applicationId
    );
    
    return application || null;
  }

  /**
   * Get all applications for a user
   * @param {string} userId - User identifier
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.status] - Filter by application status
   * @param {string} [filters.startDate] - Filter by start date (ISO 8601)
   * @param {string} [filters.endDate] - Filter by end date (ISO 8601)
   * @param {string} [filters.cvVersionId] - Filter by CV version ID
   * @returns {Array} Array of application records
   */
  getAllApplications(userId, filters = {}) {
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      return [];
    }
    
    let applications = data.users[userId].applications || [];
    
    // Apply status filter
    if (filters.status) {
      applications = applications.filter(app => app.status === filters.status);
    }
    
    // Apply date range filter (start date)
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      applications = applications.filter(app => {
        const appDate = new Date(app.applicationDate);
        return appDate >= startDate;
      });
    }
    
    // Apply date range filter (end date)
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      applications = applications.filter(app => {
        const appDate = new Date(app.applicationDate);
        return appDate <= endDate;
      });
    }
    
    // Apply CV version filter
    if (filters.cvVersionId) {
      applications = applications.filter(app => app.cvVersionId === filters.cvVersionId);
    }
    
    // Sort by application date (descending - newest first)
    applications.sort((a, b) => {
      const dateA = new Date(a.applicationDate);
      const dateB = new Date(b.applicationDate);
      return dateB - dateA; // Descending order
    });
    
    return applications;
  }

  /**
   * Update an existing application record
   * @param {string} userId - User identifier
   * @param {string} applicationId - Application ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.companyName] - Company name (1-200 chars)
   * @param {string} [updates.positionTitle] - Position title (1-200 chars)
   * @param {string} [updates.status] - Application status
   * @param {string} [updates.jobDescription] - Job description (0-10000 chars)
   * @param {string|Date} [updates.interviewDate] - Interview date
   * @param {string} [updates.interviewNotes] - Interview notes
   * @param {string} [updates.statusNotes] - Notes for status change
   * @param {function} [sanitizeTextFn] - Text sanitization function (optional, for testing)
   * @returns {Object} Updated application record
   * @throws {Error} If validation fails or application not found
   */
  updateApplication(userId, applicationId, updates, sanitizeTextFn = null) {
    // Load current data
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      throw new Error('Application not found');
    }
    
    // Find application by ID
    const applicationIndex = data.users[userId].applications.findIndex(
      app => app.id === applicationId
    );
    
    if (applicationIndex === -1) {
      throw new Error('Application not found');
    }
    
    const application = data.users[userId].applications[applicationIndex];
    
    // Validate updates
    if (updates.companyName !== undefined) {
      this.validateCompanyName(updates.companyName);
    }
    
    if (updates.positionTitle !== undefined) {
      this.validatePositionTitle(updates.positionTitle);
    }
    
    if (updates.status !== undefined) {
      this.validateStatus(updates.status);
    }
    
    if (updates.jobDescription !== undefined) {
      this.validateJobDescription(updates.jobDescription);
    }
    
    if (updates.interviewDate !== undefined && updates.interviewDate !== null) {
      this.validateInterviewDate(updates.interviewDate, application.applicationDate);
    }
    
    // Sanitize text inputs
    const sanitize = sanitizeTextFn || ((text, maxLen) => {
      if (typeof text !== 'string') return '';
      return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
    });
    
    // Track if status changed
    const statusChanged = updates.status !== undefined && updates.status !== application.status;
    
    // Apply updates
    if (updates.companyName !== undefined) {
      application.companyName = sanitize(updates.companyName, 200);
    }
    
    if (updates.positionTitle !== undefined) {
      application.positionTitle = sanitize(updates.positionTitle, 200);
    }
    
    if (updates.jobDescription !== undefined) {
      application.jobDescription = updates.jobDescription 
        ? sanitize(updates.jobDescription, 10000) 
        : '';
    }
    
    if (updates.interviewDate !== undefined) {
      application.interviewDate = updates.interviewDate 
        ? new Date(updates.interviewDate).toISOString() 
        : null;
    }
    
    if (updates.interviewNotes !== undefined) {
      application.interviewNotes = updates.interviewNotes 
        ? sanitize(updates.interviewNotes, 5000) 
        : null;
    }
    
    // Handle status change
    if (statusChanged) {
      application.status = updates.status;
      
      // Record rejection date when status changes to "Rejected"
      if (updates.status === 'Rejected') {
        application.rejectionDate = new Date().toISOString();
      }
      
      // Append to status history
      const statusHistoryEntry = {
        status: updates.status,
        timestamp: new Date().toISOString(),
        notes: updates.statusNotes || null
      };
      
      application.statusHistory.push(statusHistoryEntry);
    }
    
    // Update lastModified timestamp
    application.lastModified = new Date().toISOString();
    
    // Save updated data
    data.users[userId].applications[applicationIndex] = application;
    this.storageService.save(data);
    
    return application;
  }

  /**
   * Delete an application record
   * @param {string} userId - User identifier
   * @param {string} applicationId - Application ID
   * @returns {boolean} True if deleted successfully, false if not found
   */
  deleteApplication(userId, applicationId) {
    // Load current data
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      return false;
    }
    
    // Find application index
    const applicationIndex = data.users[userId].applications.findIndex(
      app => app.id === applicationId
    );
    
    // Return false if application not found
    if (applicationIndex === -1) {
      return false;
    }
    
    // Remove application from array
    data.users[userId].applications.splice(applicationIndex, 1);
    
    // Save updated data
    this.storageService.save(data);
    
    return true;
  }

  // Statistics methods will be implemented in task 6
  
  /**
   * Get statistics for a user's applications
   * @param {string} userId - User identifier
   * @param {Object} [dateRange] - Optional date range filter
   * @param {string} [dateRange.startDate] - Start date (ISO 8601)
   * @param {string} [dateRange.endDate] - End date (ISO 8601)
   * @returns {Object} Statistics object
   */
  getStatistics(userId, dateRange = {}) {
    // Get applications with optional date range filter
    const filters = {};
    if (dateRange.startDate) {
      filters.startDate = dateRange.startDate;
    }
    if (dateRange.endDate) {
      filters.endDate = dateRange.endDate;
    }
    
    const applications = this.getAllApplications(userId, filters);
    
    // Calculate total applications count
    const totalApplications = applications.length;
    
    // Calculate counts by status
    const byStatus = {
      applied: 0,
      interview: 0,
      rejected: 0,
      offer: 0,
      accepted: 0
    };
    
    applications.forEach(app => {
      const status = app.status.toLowerCase();
      if (byStatus.hasOwnProperty(status)) {
        byStatus[status]++;
      }
    });
    
    // Calculate rejection count and rate
    const rejectionCount = byStatus.rejected;
    const rejectionRate = totalApplications > 0 
      ? (rejectionCount / totalApplications) * 100 
      : 0;
    
    // Calculate overall success rate
    // Success = Interview + Offer + Accepted
    const successCount = byStatus.interview + byStatus.offer + byStatus.accepted;
    const successRate = totalApplications > 0 
      ? (successCount / totalApplications) * 100 
      : 0;
    
    // Calculate average response time
    // Response time = time from application date to first status change (or rejection date)
    let totalResponseTime = 0;
    let responsesCount = 0;
    
    applications.forEach(app => {
      // Skip if still in "Applied" status (no response yet)
      if (app.status === 'Applied') {
        return;
      }
      
      const applicationDate = new Date(app.applicationDate);
      let responseDate = null;
      
      // Use rejection date if rejected
      if (app.status === 'Rejected' && app.rejectionDate) {
        responseDate = new Date(app.rejectionDate);
      } 
      // Otherwise use the first status change timestamp (after initial "Applied")
      else if (app.statusHistory && app.statusHistory.length > 1) {
        responseDate = new Date(app.statusHistory[1].timestamp);
      }
      
      if (responseDate) {
        const responseTime = (responseDate - applicationDate) / (1000 * 60 * 60 * 24); // Convert to days
        totalResponseTime += responseTime;
        responsesCount++;
      }
    });
    
    const averageResponseTime = responsesCount > 0 
      ? totalResponseTime / responsesCount 
      : 0;
    
    return {
      totalApplications,
      byStatus,
      successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
      rejectionCount,
      rejectionRate: Math.round(rejectionRate * 100) / 100, // Round to 2 decimal places
      averageResponseTime: Math.round(averageResponseTime * 100) / 100 // Round to 2 decimal places
    };
  }

  /**
   * Get rejection statistics for a user's applications
   * @param {string} userId - User identifier
   * @param {Object} [dateRange] - Optional date range filter
   * @param {string} [dateRange.startDate] - Start date (ISO 8601)
   * @param {string} [dateRange.endDate] - End date (ISO 8601)
   * @returns {Object} Rejection statistics object
   */
  getRejectionStats(userId, dateRange = {}) {
    // Get applications with optional date range filter
    const filters = {};
    if (dateRange.startDate) {
      filters.startDate = dateRange.startDate;
    }
    if (dateRange.endDate) {
      filters.endDate = dateRange.endDate;
    }
    
    const applications = this.getAllApplications(userId, filters);
    
    // Filter for rejected applications only
    const rejectedApplications = applications.filter(app => app.status === 'Rejected');
    
    // Calculate rejection count
    const rejectionCount = rejectedApplications.length;
    
    // Calculate rejection rate
    const totalApplications = applications.length;
    const rejectionRate = totalApplications > 0 
      ? (rejectionCount / totalApplications) * 100 
      : 0;
    
    // Calculate average time to rejection
    let totalTimeToRejection = 0;
    let validRejectionCount = 0;
    
    rejectedApplications.forEach(app => {
      if (app.rejectionDate) {
        const applicationDate = new Date(app.applicationDate);
        const rejectionDate = new Date(app.rejectionDate);
        const timeToRejection = (rejectionDate - applicationDate) / (1000 * 60 * 60 * 24); // Convert to days
        totalTimeToRejection += timeToRejection;
        validRejectionCount++;
      }
    });
    
    const averageTimeToRejection = validRejectionCount > 0 
      ? totalTimeToRejection / validRejectionCount 
      : 0;
    
    // Group rejections by CV version
    const rejectionsByCVVersion = {};
    
    rejectedApplications.forEach(app => {
      const cvVersionId = app.cvVersionId;
      
      if (!rejectionsByCVVersion[cvVersionId]) {
        rejectionsByCVVersion[cvVersionId] = {
          cvVersionId,
          rejectionCount: 0,
          totalApplications: 0,
          rejectionRate: 0
        };
      }
      
      rejectionsByCVVersion[cvVersionId].rejectionCount++;
    });
    
    // Calculate total applications per CV version and rejection rate
    applications.forEach(app => {
      const cvVersionId = app.cvVersionId;
      
      if (!rejectionsByCVVersion[cvVersionId]) {
        rejectionsByCVVersion[cvVersionId] = {
          cvVersionId,
          rejectionCount: 0,
          totalApplications: 0,
          rejectionRate: 0
        };
      }
      
      rejectionsByCVVersion[cvVersionId].totalApplications++;
    });
    
    // Calculate rejection rate for each CV version
    Object.keys(rejectionsByCVVersion).forEach(cvVersionId => {
      const versionStats = rejectionsByCVVersion[cvVersionId];
      versionStats.rejectionRate = versionStats.totalApplications > 0 
        ? (versionStats.rejectionCount / versionStats.totalApplications) * 100 
        : 0;
      // Round to 2 decimal places
      versionStats.rejectionRate = Math.round(versionStats.rejectionRate * 100) / 100;
    });
    
    return {
      rejectionCount,
      rejectionRate: Math.round(rejectionRate * 100) / 100, // Round to 2 decimal places
      averageTimeToRejection: Math.round(averageTimeToRejection * 100) / 100, // Round to 2 decimal places
      byCVVersion: Object.values(rejectionsByCVVersion)
    };
  }
}
