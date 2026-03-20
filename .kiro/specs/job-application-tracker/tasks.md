# Implementation Plan: Job Application Tracker

## Overview

This implementation plan builds the Job Application Tracker feature for the existing Node.js/Express application. The system will provide RESTful API endpoints for tracking job applications, managing CV versions, and analyzing application performance. All data will be persisted to a JSON file following the existing storage patterns in the application.

The implementation follows a bottom-up approach: starting with the storage layer, building up through business logic components, and finishing with API endpoint integration into server.js.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Create directory structure for the feature modules
  - Install fast-check for property-based testing
  - Create test directory structure (unit/, integration/, property/)
  - _Requirements: 8.1, 8.2_

- [x] 2. Implement StorageService for JSON file persistence
  - [x] 2.1 Create StorageService class with load, save, backup, and validate methods
    - Implement atomic file writes with error handling
    - Handle file corruption with automatic backup creation
    - Validate JSON structure before writing
    - Initialize empty storage if file doesn't exist
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [ ]* 2.2 Write property test for StorageService
    - **Property 22: Storage Round-Trip**
    - **Validates: Requirements 8.3**
  
  - [ ]* 2.3 Write property test for JSON validation
    - **Property 23: JSON Structure Validation**
    - **Validates: Requirements 8.6**
  
  - [ ]* 2.4 Write unit tests for StorageService
    - Test file creation, corruption handling, backup creation
    - Test edge cases: empty file, invalid JSON, write failures
    - _Requirements: 8.4, 8.5_

- [x] 3. Implement ApplicationTracker core CRUD operations
  - [x] 3.1 Create ApplicationTracker class with constructor and data validation helpers
    - Implement input validation for company name, position title, dates
    - Implement status enum validation
    - Implement string length validation (1-200 chars for names, 0-10000 for description)
    - _Requirements: 1.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.8_
  
  - [x] 3.2 Implement createApplication method
    - Generate unique UUID for application ID
    - Set default status to "Applied"
    - Assign default CV version if not provided
    - Record creation timestamp and initialize status history
    - Sanitize all text inputs
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 12.6_
  
  - [ ]* 3.3 Write property tests for application creation
    - **Property 1: Application Data Round-Trip**
    - **Property 2: Unique Application Identifiers**
    - **Property 3: Default Status Assignment**
    - **Property 4: Default CV Version Assignment**
    - **Property 5: Required Field Validation**
    - **Property 30: String Length Validation**
    - **Property 31: Date Logic Validation**
    - **Property 32: Input Sanitization**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 12.1, 12.2, 12.3, 12.5, 12.6, 12.8**
  
  - [x] 3.4 Implement getApplication and getAllApplications methods
    - Retrieve single application by ID
    - Retrieve all applications for a user
    - Return null for non-existent IDs
    - _Requirements: 4.1, 7.1, 10.4_
  
  - [x] 3.5 Implement updateApplication method
    - Update application fields with validation
    - Update lastModified timestamp on changes
    - Append to status history when status changes
    - Record rejection date when status changes to "Rejected"
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 7.6_
  
  - [ ]* 3.6 Write property tests for application updates
    - **Property 6: Status Update Persistence**
    - **Property 7: Status Enum Validation**
    - **Property 8: Rejection Date Recording**
    - **Property 9: Status History Completeness**
    - **Property 10: Last Modified Timestamp Update**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6**
  
  - [x] 3.7 Implement deleteApplication method
    - Remove application from storage
    - Return boolean indicating success
    - _Requirements: 10.1, 10.4_
  
  - [ ]* 3.8 Write property test for application deletion
    - **Property 26: Application Deletion**
    - **Validates: Requirements 10.1, 10.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement filtering and sorting for ApplicationTracker
  - [x] 5.1 Implement filtering by status, date range, and CV version
    - Add filter logic to getAllApplications method
    - Support multiple simultaneous filters
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [x] 5.2 Implement sorting by application date (descending)
    - Sort results by application date, newest first
    - _Requirements: 4.1, 4.6_
  
  - [ ]* 5.3 Write property tests for filtering and sorting
    - **Property 14: Application List Sorting**
    - **Property 15: Application Filtering**
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
  
  - [ ]* 5.4 Write unit tests for filtering edge cases
    - Test empty results, single result, all matching, none matching
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 6. Implement statistics calculation in ApplicationTracker
  - [x] 6.1 Implement getStatistics method
    - Calculate total applications count
    - Calculate counts by status (Applied, Interview, Rejected, Offer, Accepted)
    - Calculate overall success rate
    - Calculate rejection count and rate
    - Calculate average response time
    - Support date range filtering
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 9.1, 9.2, 9.3, 9.5, 9.6_
  
  - [x] 6.2 Implement getRejectionStats method
    - Calculate rejection count and rate
    - Calculate average time to rejection
    - Support date range filtering
    - Group rejections by CV version
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 6.3 Write property tests for statistics
    - **Property 16: Rejection Statistics Calculation**
    - **Property 17: Date-Filtered Statistics**
    - **Property 18: Average Time to Rejection**
    - **Property 24: Dashboard Statistics Accuracy**
    - **Property 27: Statistics Update After Deletion**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 9.1, 9.2, 9.3, 9.5, 10.3**
  
  - [ ]* 6.4 Write unit tests for statistics edge cases
    - Test with zero applications, single application, all same status
    - Test date range with no matching applications
    - _Requirements: 5.1, 5.2, 9.1, 9.2_

- [x] 7. Implement CVVersionManager
  - [x] 7.1 Create CVVersionManager class with CRUD operations
    - Implement createVersion, getVersion, getAllVersions, updateVersion methods
    - Generate unique UUID for CV version ID
    - Store CV content or file reference
    - Support active/archived status
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 12.7_
  
  - [x] 7.2 Implement getApplicationsByVersion method
    - Return all applications using a specific CV version
    - _Requirements: 3.2, 6.4_
  
  - [ ]* 7.3 Write property tests for CV version management
    - **Property 11: CV Version Creation and Retrieval**
    - **Property 12: CV Version Reusability**
    - **Property 13: CV Version List Completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  
  - [ ]* 7.4 Write unit tests for CV version operations
    - Test version creation, retrieval, update, listing
    - Test active/archived status changes
    - _Requirements: 3.1, 3.3, 3.4, 3.6_

- [x] 8. Implement PerformanceAnalyzer
  - [x] 8.1 Create PerformanceAnalyzer class with constructor
    - Accept ApplicationTracker and CVVersionManager as dependencies
    - _Requirements: 6.1_
  
  - [x] 8.2 Implement analyzeVersion method
    - Calculate success rate: (Interview + Offer + Accepted) / total * 100
    - Calculate rejection rate
    - Calculate average response time
    - Mark as insufficient data if fewer than 3 applications
    - Return breakdown by status
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 8.3 Implement compareVersions method
    - Analyze all CV versions
    - Rank versions by success rate (descending)
    - Calculate comparison metrics between best and worst
    - _Requirements: 6.6, 6.7_
  
  - [x] 8.4 Implement getBestPerformingVersion method
    - Identify CV version with highest success rate
    - Return null if no versions exist
    - _Requirements: 9.4_
  
  - [ ]* 8.5 Write property tests for performance analysis
    - **Property 19: Success Rate Calculation**
    - **Property 20: Insufficient Data Marking**
    - **Property 21: CV Version Ranking**
    - **Property 25: Best Performing CV Identification**
    - **Validates: Requirements 6.1, 6.2, 6.5, 6.6, 9.4**
  
  - [ ]* 8.6 Write unit tests for performance analyzer
    - Test with 0, 1, 2, 3+ applications per version
    - Test with all rejected, all successful, mixed results
    - Test ranking with equal success rates
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Integrate API endpoints into server.js
  - [x] 10.1 Initialize StorageService, ApplicationTracker, CVVersionManager, and PerformanceAnalyzer at server startup
    - Create instances after existing initialization code
    - Use "applications.json" as storage file path
    - _Requirements: 8.2_
  
  - [ ] 10.2 Implement POST /api/applications endpoint
    - Extract userId using getUserId(req)
    - Validate request body
    - Sanitize text inputs using sanitizeText
    - Call applicationTracker.createApplication
    - Return HTTP 201 with created application
    - Return HTTP 400 for validation errors
    - Apply rate limiting
    - _Requirements: 11.1, 11.8, 11.10, 12.6_
  
  - [x] 10.3 Implement GET /api/applications endpoint
    - Extract userId using getUserId(req)
    - Parse query parameters for filters (status, dateRange, cvVersionId)
    - Call applicationTracker.getAllApplications with filters
    - Return HTTP 200 with application list
    - Apply rate limiting
    - _Requirements: 11.2, 11.10_
  
  - [x] 10.4 Implement GET /api/applications/:id endpoint
    - Extract userId using getUserId(req)
    - Extract application ID from URL params
    - Call applicationTracker.getApplication
    - Return HTTP 200 with application or HTTP 404 if not found
    - Apply rate limiting
    - _Requirements: 11.3, 11.9, 11.10_
  
  - [x] 10.5 Implement PUT /api/applications/:id endpoint
    - Extract userId using getUserId(req)
    - Extract application ID from URL params
    - Validate request body
    - Sanitize text inputs using sanitizeText
    - Call applicationTracker.updateApplication
    - Return HTTP 200 with updated application
    - Return HTTP 404 if application not found
    - Return HTTP 400 for validation errors
    - Apply rate limiting
    - _Requirements: 11.4, 11.8, 11.9, 11.10, 12.6_
  
  - [x] 10.6 Implement DELETE /api/applications/:id endpoint
    - Extract userId using getUserId(req)
    - Extract application ID from URL params
    - Call applicationTracker.deleteApplication
    - Return HTTP 204 on success
    - Return HTTP 404 if application not found
    - Apply rate limiting
    - _Requirements: 11.5, 11.9, 11.10_
  
  - [x] 10.7 Implement GET /api/applications/stats endpoint
    - Extract userId using getUserId(req)
    - Parse query parameters for date range filter
    - Call applicationTracker.getStatistics
    - Call performanceAnalyzer.getBestPerformingVersion
    - Combine results into dashboard statistics response
    - Return HTTP 200 with statistics
    - Apply rate limiting
    - _Requirements: 11.6, 11.10_
  
  - [x] 10.8 Implement GET /api/cv-versions endpoint
    - Extract userId using getUserId(req)
    - Call cvVersionManager.getAllVersions
    - Return HTTP 200 with CV version list
    - Apply rate limiting
    - _Requirements: 11.10_
  
  - [x] 10.9 Implement POST /api/cv-versions endpoint
    - Extract userId using getUserId(req)
    - Validate request body
    - Sanitize text inputs using sanitizeText
    - Call cvVersionManager.createVersion
    - Return HTTP 201 with created CV version
    - Return HTTP 400 for validation errors
    - Apply rate limiting
    - _Requirements: 11.8, 11.10, 12.6_
  
  - [x] 10.10 Implement GET /api/cv-versions/performance endpoint
    - Extract userId using getUserId(req)
    - Call performanceAnalyzer.compareVersions
    - Return HTTP 200 with performance analysis
    - Apply rate limiting
    - _Requirements: 11.7, 11.10_
  
  - [ ]* 10.11 Write integration tests for all API endpoints
    - Test successful requests with valid data
    - Test validation errors (HTTP 400)
    - Test not found errors (HTTP 404)
    - Test rate limiting (HTTP 429)
    - Test user isolation (users can't access each other's data)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_
  
  - [ ]* 10.12 Write property test for API validation
    - **Property 28: API Validation Error Response**
    - **Property 29: API Not Found Response**
    - **Validates: Requirements 11.8, 11.9**

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The implementation uses JavaScript/Node.js with Express.js framework
- Property-based tests use fast-check library with minimum 100 iterations
- All text inputs are sanitized using the existing sanitizeText function
- Rate limiting uses the existing rateLimit middleware
- User identification uses the existing getUserId function
- Storage follows the existing JSON file pattern (users.json, stats.json)
- All API endpoints return consistent error response format
