// CVVersionManager for Job Application Tracker
// Manages CV versions and their associations with applications

import crypto from 'crypto';

export class CVVersionManager {
  constructor(storageService) {
    if (!storageService) {
      throw new Error('StorageService is required');
    }
    this.storageService = storageService;
    this.validStatuses = ['active', 'archived'];
  }

  /**
   * Validate CV version name
   * @param {string} name - CV version name to validate
   * @throws {Error} If validation fails
   */
  validateName(name) {
    if (typeof name !== 'string') {
      throw new Error('CV version name is required');
    }
    
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error('CV version name cannot be empty');
    }
    
    if (trimmed.length > 200) {
      throw new Error('CV version name must be 200 characters or less');
    }
  }

  /**
   * Validate CV version status
   * @param {string} status - Status to validate
   * @throws {Error} If validation fails
   */
  validateStatus(status) {
    if (!status || typeof status !== 'string') {
      throw new Error('CV version status is required');
    }
    
    if (!this.validStatuses.includes(status)) {
      throw new Error(`CV version status must be one of: ${this.validStatuses.join(', ')}`);
    }
  }

  /**
   * Validate ATS score
   * @param {number} atsScore - ATS score to validate
   * @throws {Error} If validation fails
   */
  validateAtsScore(atsScore) {
    if (atsScore === null || atsScore === undefined) {
      return; // Optional field
    }
    
    if (typeof atsScore !== 'number') {
      throw new Error('ATS score must be a number');
    }
    
    if (atsScore < 0 || atsScore > 100) {
      throw new Error('ATS score must be between 0 and 100');
    }
  }

  /**
   * Create a new CV version
   * @param {string} userId - User identifier
   * @param {Object} versionData - CV version data
   * @param {string} versionData.name - CV version name (1-200 chars)
   * @param {string} [versionData.description] - CV version description (optional)
   * @param {number} [versionData.atsScore] - ATS score 0-100 (optional)
   * @param {string} [versionData.content] - CV content or file reference (optional)
   * @param {string} [versionData.status] - CV version status (active|archived, defaults to active)
   * @param {function} [sanitizeTextFn] - Text sanitization function (optional, for testing)
   * @returns {Object} Created CV version record
   * @throws {Error} If validation fails
   */
  createVersion(userId, versionData, sanitizeTextFn = null) {
    // Validate required fields
    this.validateName(versionData.name);
    
    // Validate optional fields
    if (versionData.status !== undefined) {
      this.validateStatus(versionData.status);
    }
    
    if (versionData.atsScore !== undefined && versionData.atsScore !== null) {
      this.validateAtsScore(versionData.atsScore);
    }
    
    // Sanitize text inputs
    const sanitize = sanitizeTextFn || ((text, maxLen) => {
      if (typeof text !== 'string') return '';
      return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
    });
    
    const name = sanitize(versionData.name, 200);
    const description = versionData.description 
      ? sanitize(versionData.description, 1000) 
      : null;
    const content = versionData.content 
      ? sanitize(versionData.content, 50000) 
      : null;
    
    // Generate unique UUID for CV version ID
    const versionId = crypto.randomUUID();
    
    // Record creation timestamp
    const now = new Date().toISOString();
    
    // Create CV version record
    const cvVersion = {
      id: versionId,
      userId,
      name,
      description,
      atsScore: versionData.atsScore !== undefined ? versionData.atsScore : null,
      content,
      status: versionData.status || 'active', // Default to active
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
    
    // Add CV version to user's cvVersions
    data.users[userId].cvVersions.push(cvVersion);
    
    // Save to storage
    this.storageService.save(data);
    
    return cvVersion;
  }

  /**
   * Get a single CV version by ID
   * @param {string} userId - User identifier
   * @param {string} versionId - CV version ID
   * @returns {Object|null} CV version record or null if not found
   */
  getVersion(userId, versionId) {
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      return null;
    }
    
    // Find CV version by ID
    const cvVersion = data.users[userId].cvVersions.find(
      version => version.id === versionId
    );
    
    return cvVersion || null;
  }

  /**
   * Get all CV versions for a user
   * @param {string} userId - User identifier
   * @returns {Array} Array of CV version records
   */
  getAllVersions(userId) {
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      return [];
    }
    
    return data.users[userId].cvVersions || [];
  }

  /**
   * Update an existing CV version
   * @param {string} userId - User identifier
   * @param {string} versionId - CV version ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.name] - CV version name (1-200 chars)
   * @param {string} [updates.description] - CV version description
   * @param {number} [updates.atsScore] - ATS score 0-100
   * @param {string} [updates.content] - CV content or file reference
   * @param {string} [updates.status] - CV version status (active|archived)
   * @param {function} [sanitizeTextFn] - Text sanitization function (optional, for testing)
   * @returns {Object} Updated CV version record
   * @throws {Error} If validation fails or CV version not found
   */
  updateVersion(userId, versionId, updates, sanitizeTextFn = null) {
    // Load current data
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      throw new Error('CV version not found');
    }
    
    // Find CV version by ID
    const versionIndex = data.users[userId].cvVersions.findIndex(
      version => version.id === versionId
    );
    
    if (versionIndex === -1) {
      throw new Error('CV version not found');
    }
    
    const cvVersion = data.users[userId].cvVersions[versionIndex];
    
    // Validate updates
    if (updates.name !== undefined) {
      this.validateName(updates.name);
    }
    
    if (updates.status !== undefined) {
      this.validateStatus(updates.status);
    }
    
    if (updates.atsScore !== undefined && updates.atsScore !== null) {
      this.validateAtsScore(updates.atsScore);
    }
    
    // Sanitize text inputs
    const sanitize = sanitizeTextFn || ((text, maxLen) => {
      if (typeof text !== 'string') return '';
      return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, maxLen);
    });
    
    // Apply updates
    if (updates.name !== undefined) {
      cvVersion.name = sanitize(updates.name, 200);
    }
    
    if (updates.description !== undefined) {
      cvVersion.description = updates.description 
        ? sanitize(updates.description, 1000) 
        : null;
    }
    
    if (updates.atsScore !== undefined) {
      cvVersion.atsScore = updates.atsScore;
    }
    
    if (updates.content !== undefined) {
      cvVersion.content = updates.content 
        ? sanitize(updates.content, 50000) 
        : null;
    }
    
    if (updates.status !== undefined) {
      cvVersion.status = updates.status;
    }
    
    // Update lastModified timestamp
    cvVersion.lastModified = new Date().toISOString();
    
    // Save updated data
    data.users[userId].cvVersions[versionIndex] = cvVersion;
    this.storageService.save(data);
    
    return cvVersion;
  }

  /**
   * Get all applications that use a specific CV version
   * @param {string} userId - User identifier
   * @param {string} versionId - CV version ID
   * @returns {Array} Array of application records using this CV version
   */
  getApplicationsByVersion(userId, versionId) {
    const data = this.storageService.load();
    
    // Check if user exists
    if (!data.users[userId]) {
      return [];
    }
    
    // Filter applications by CV version ID
    const applications = data.users[userId].applications || [];
    return applications.filter(app => app.cvVersionId === versionId);
  }
}
