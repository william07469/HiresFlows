// StorageService for Job Application Tracker
// Handles persistent storage of application data to JSON files

import fs from 'fs';
import path from 'path';

export class StorageService {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * Load data from JSON file
   * @returns {Object} Parsed JSON data or empty structure if file doesn't exist
   */
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        
        // Validate structure
        if (!this.validate(data)) {
          throw new Error('Invalid JSON structure');
        }
        
        return data;
      }
      
      // Initialize empty storage if file doesn't exist
      const emptyData = {
        version: "1.0",
        users: {}
      };
      this.save(emptyData);
      return emptyData;
    } catch (error) {
      // Handle file corruption
      if (error instanceof SyntaxError || error.message === 'Invalid JSON structure') {
        console.error(`Storage file corrupted: ${this.filePath}`, error);
        this.backup();
        
        // Initialize empty storage after backup
        const emptyData = {
          version: "1.0",
          users: {}
        };
        this.save(emptyData);
        return emptyData;
      }
      throw error;
    }
  }

  /**
   * Save data to JSON file with atomic write
   * @param {Object} data - Data to save
   */
  save(data) {
    try {
      // Validate before writing
      if (!this.validate(data)) {
        throw new Error('Invalid data structure - cannot save');
      }
      
      // Atomic write using temporary file
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.error(`Failed to save storage file: ${this.filePath}`, error);
      throw error;
    }
  }

  /**
   * Create backup of current storage file
   */
  backup() {
    try {
      if (fs.existsSync(this.filePath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${this.filePath}.backup-${timestamp}`;
        fs.copyFileSync(this.filePath, backupPath);
        console.log(`Backup created: ${backupPath}`);
      }
    } catch (error) {
      console.error(`Failed to create backup: ${this.filePath}`, error);
      // Don't throw - backup failure shouldn't stop the operation
    }
  }

  /**
   * Validate JSON structure
   * @param {Object} data - Data to validate
   * @returns {boolean} True if valid, false otherwise
   */
  validate(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    // Check required top-level fields
    if (!data.version || typeof data.version !== 'string') {
      return false;
    }
    
    if (!data.users || typeof data.users !== 'object') {
      return false;
    }
    
    // Validate each user's data structure
    for (const userId in data.users) {
      const userData = data.users[userId];
      
      if (!userData || typeof userData !== 'object') {
        return false;
      }
      
      // Check for required arrays
      if (!Array.isArray(userData.applications)) {
        return false;
      }
      
      if (!Array.isArray(userData.cvVersions)) {
        return false;
      }
    }
    
    return true;
  }
}
