# Job Application Tracker - Source Code

This directory contains the implementation of the Job Application Tracker feature.

## Components

### StorageService (`storage-service.js`)
Handles persistent storage of application data to JSON files.
- Atomic file writes with error handling
- File corruption detection and backup creation
- JSON structure validation

### ApplicationTracker (`application-tracker.js`)
Core component for managing application records.
- CRUD operations for applications
- Filtering and sorting
- Statistics calculation
- Rejection tracking

### CVVersionManager (`cv-version-manager.js`)
Manages CV versions and their associations with applications.
- CV version CRUD operations
- Active/archived status management
- Application-to-version associations

### PerformanceAnalyzer (`performance-analyzer.js`)
Analyzes CV version performance and calculates success metrics.
- Success rate calculation
- CV version comparison
- Response time analysis
- Best performing version identification

## Data Storage

All data is persisted to `applications.json` in the project root, following the existing storage pattern used by `users.json` and `stats.json`.

## Integration

These components are integrated into the main Express server (`server.js`) through API endpoints under `/api/applications` and `/api/cv-versions`.
