# Design Document: Job Application Tracker

## Overview

The Job Application Tracker is a comprehensive feature that integrates into the existing CV builder and ATS analyzer application. It enables users to systematically track job applications, manage multiple CV versions, analyze which CV performs best, and make data-driven decisions about their job search strategy.

The system provides RESTful API endpoints for creating, updating, and querying application records, along with analytics capabilities to calculate success rates, rejection statistics, and CV version performance metrics. All data is persisted to disk using JSON file storage, following the existing application's storage patterns.

Key capabilities include:
- Recording job applications with company, position, CV version, and job description
- Tracking application status through the hiring pipeline (Applied → Interview → Rejected/Offer → Accepted)
- Managing multiple CV versions with performance tracking
- Analyzing which CV versions yield better results (interviews, offers)
- Dashboard statistics showing overall job search progress
- Rejection tracking and trend analysis

## Architecture

### System Components

The Job Application Tracker follows a modular architecture that integrates seamlessly with the existing Express.js backend:

```
┌─────────────────────────────────────────────────────────┐
│                    Express Server                        │
│                     (server.js)                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ├─── Existing Features
                          │    ├─── CV Fixer
                          │    ├─── ATS Analyzer
                          │    └─── Cover Letter Generator
                          │
                          └─── New: Job Application Tracker
                               │
                               ├─── API Routes Layer
                               │    ├─── /api/applications (CRUD)
                               │    ├─── /api/applications/stats
                               │    ├─── /api/cv-versions
                               │    └─── /api/cv-versions/performance
                               │
                               ├─── Business Logic Layer
                               │    ├─── ApplicationTracker
                               │    ├─── CVVersionManager
                               │    └─── PerformanceAnalyzer
                               │
                               └─── Data Layer
                                    └─── StorageService
                                         └─── applications.json
```

### Integration Points

1. **Existing Middleware**: Reuses `rateLimit`, `sanitizeText`, and security headers
2. **User Management**: Integrates with existing `getUserId()` function for user identification
3. **File Storage Pattern**: Follows the same JSON file persistence pattern as `users.json` and `stats.json`
4. **Error Handling**: Uses consistent error response format with HTTP status codes

### Data Flow

```
User Request → Rate Limiting → Input Validation → Business Logic → Storage Service → JSON File
                                                         ↓
User Response ← JSON Response ← Data Transformation ← Data Retrieval ← JSON File
```

## Components and Interfaces

### 1. ApplicationTracker

Core component responsible for managing application records.

**Responsibilities:**
- Create, read, update, delete application records
- Validate application data
- Filter and sort applications
- Calculate statistics

**Interface:**
```javascript
class ApplicationTracker {
  constructor(storageService)
  
  // CRUD operations
  createApplication(userId, applicationData) → { id, ...applicationData }
  getApplication(userId, applicationId) → Application | null
  getAllApplications(userId, filters) → Application[]
  updateApplication(userId, applicationId, updates) → Application
  deleteApplication(userId, applicationId) → boolean
  
  // Statistics
  getStatistics(userId, dateRange) → Statistics
  getRejectionStats(userId, dateRange) → RejectionStats
}
```

### 2. CVVersionManager

Manages CV versions and their associations with applications.

**Responsibilities:**
- Store CV version metadata
- Track which applications use which CV versions
- Manage active/archived status

**Interface:**
```javascript
class CVVersionManager {
  constructor(storageService)
  
  createVersion(userId, versionData) → CVVersion
  getVersion(userId, versionId) → CVVersion | null
  getAllVersions(userId) → CVVersion[]
  updateVersion(userId, versionId, updates) → CVVersion
  getApplicationsByVersion(userId, versionId) → Application[]
}
```

### 3. PerformanceAnalyzer

Analyzes CV version performance and calculates success metrics.

**Responsibilities:**
- Calculate success rates per CV version
- Compare CV version performance
- Identify best/worst performing versions
- Calculate response time metrics

**Interface:**
```javascript
class PerformanceAnalyzer {
  constructor(applicationTracker, cvVersionManager)
  
  analyzeVersion(userId, versionId) → VersionPerformance
  compareVersions(userId) → VersionComparison[]
  getBestPerformingVersion(userId) → CVVersion | null
  calculateSuccessRate(applications) → number
  calculateAverageResponseTime(applications) → number
}
```

### 4. StorageService

Handles persistent storage of application data to JSON files.

**Responsibilities:**
- Read/write JSON files atomically
- Handle file corruption and recovery
- Validate JSON structure
- Create backups on corruption

**Interface:**
```javascript
class StorageService {
  constructor(filePath)
  
  load() → Object
  save(data) → void
  backup() → void
  validate(data) → boolean
}
```

## Data Models

### Application Record

```javascript
{
  id: string,                    // UUID v4
  userId: string,                // From getUserId()
  companyName: string,           // 1-200 chars
  positionTitle: string,         // 1-200 chars
  applicationDate: string,       // ISO 8601 date
  status: string,                // Applied|Interview|Rejected|Offer|Accepted
  cvVersionId: string,           // Reference to CV version
  jobDescription: string,        // 0-10000 chars, optional
  interviewDate: string | null,  // ISO 8601 date, optional
  interviewNotes: string | null, // Optional
  rejectionDate: string | null,  // ISO 8601 date, set when status → Rejected
  statusHistory: [               // Audit trail
    {
      status: string,
      timestamp: string,         // ISO 8601
      notes: string | null
    }
  ],
  createdAt: string,             // ISO 8601, immutable
  lastModified: string           // ISO 8601, updated on changes
}
```

### CV Version

```javascript
{
  id: string,                    // UUID v4
  userId: string,                // From getUserId()
  name: string,                  // Descriptive name (e.g., "Tech-focused", "Marketing")
  description: string | null,    // Optional description
  atsScore: number | null,       // 0-100, optional
  content: string | null,        // CV text or reference to file
  status: string,                // active|archived
  createdAt: string,             // ISO 8601
  lastModified: string           // ISO 8601
}
```

### Statistics Response

```javascript
{
  totalApplications: number,
  byStatus: {
    applied: number,
    interview: number,
    rejected: number,
    offer: number,
    accepted: number
  },
  successRate: number,           // Percentage (0-100)
  bestPerformingCV: {
    id: string,
    name: string,
    successRate: number
  } | null,
  rejectionCount: number,
  averageResponseTime: number,   // Days
  trend: string | null           // "increasing"|"decreasing"|null
}
```

### Version Performance

```javascript
{
  versionId: string,
  versionName: string,
  totalApplications: number,
  successRate: number,           // Percentage (0-100)
  rejectionRate: number,         // Percentage (0-100)
  averageResponseTime: number,   // Days
  breakdown: {
    applied: number,
    interview: number,
    rejected: number,
    offer: number,
    accepted: number
  },
  sufficientData: boolean,       // true if >= 3 applications
  rank: number | null            // Ranking among all versions
}
```

### Storage File Structure (applications.json)

```javascript
{
  version: "1.0",
  users: {
    "userId1": {
      applications: [Application],
      cvVersions: [CVVersion]
    },
    "userId2": {
      applications: [Application],
      cvVersions: [CVVersion]
    }
  }
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas where properties can be consolidated:

- Properties 1.1 and 1.3 both test data persistence and can be combined into a comprehensive round-trip property
- Properties 5.1, 5.2, and 9.5 all test rejection counting and can be unified
- Properties 9.1, 9.2, and 9.3 all test dashboard statistics calculation and can be combined
- Properties 12.1, 12.2, and 12.5 all test string length validation and can be consolidated
- Properties 4.3, 4.4, and 4.5 all test filtering and can be combined into a general filtering property
- Properties 6.2 and 6.3 both test rate calculations and can be unified

The following properties represent the unique, non-redundant validation requirements:

### Property 1: Application Data Round-Trip

*For any* valid application data (company name, position title, application date, CV version, job description), creating an application and then retrieving it should return all the same field values.

**Validates: Requirements 1.1, 1.3, 7.1**

### Property 2: Unique Application Identifiers

*For any* set of applications created by a user, all application IDs should be unique (no duplicates).

**Validates: Requirements 1.2**

### Property 3: Default Status Assignment

*For any* newly created application, the initial status should be "Applied".

**Validates: Requirements 1.4**

### Property 4: Default CV Version Assignment

*For any* application created without a CV version identifier, a default CV version identifier should be assigned.

**Validates: Requirements 1.5**

### Property 5: Required Field Validation

*For any* application submission where company name or position title is empty (or whitespace-only), the system should reject the submission with a validation error.

**Validates: Requirements 1.6**

### Property 6: Status Update Persistence

*For any* application and any valid status value, updating the status should result in the application having that new status when retrieved.

**Validates: Requirements 2.1**

### Property 7: Status Enum Validation

*For any* status value not in the set {Applied, Interview, Rejected, Offer, Accepted}, attempting to set that status should be rejected with a validation error.

**Validates: Requirements 2.2**

### Property 8: Rejection Date Recording

*For any* application, when its status changes to "Rejected", the application should have a rejectionDate field set to a valid date.

**Validates: Requirements 2.3**

### Property 9: Status History Completeness

*For any* application that undergoes multiple status changes, the statusHistory array should contain an entry for each status change with correct timestamps in chronological order.

**Validates: Requirements 2.5**

### Property 10: Last Modified Timestamp Update

*For any* application, when any field is updated, the lastModified timestamp should be greater than its previous value.

**Validates: Requirements 2.6**

### Property 11: CV Version Creation and Retrieval

*For any* CV version data (name, description, content), creating a CV version and then retrieving it should return the same data with a unique identifier.

**Validates: Requirements 3.1, 3.4**

### Property 12: CV Version Reusability

*For any* CV version, it should be possible to create multiple applications that reference the same CV version ID.

**Validates: Requirements 3.2**

### Property 13: CV Version List Completeness

*For any* user who creates N CV versions, requesting the CV version list should return exactly N versions with all their identifiers and names.

**Validates: Requirements 3.3**

### Property 14: Application List Sorting

*For any* set of applications, requesting the application list should return them sorted by application date in descending order (newest first).

**Validates: Requirements 4.1**

### Property 15: Application Filtering

*For any* filter criteria (status, date range, or CV version), the returned applications should only include records that match all specified filter criteria.

**Validates: Requirements 4.3, 4.4, 4.5**

### Property 16: Rejection Statistics Calculation

*For any* set of applications, the rejection count should equal the number of applications with status "Rejected", and the rejection rate should equal (rejection count / total applications) × 100.

**Validates: Requirements 5.1, 5.2, 5.4, 9.5**

### Property 17: Date-Filtered Statistics

*For any* date range filter, calculated statistics should only include applications where the application date falls within that range.

**Validates: Requirements 5.3**

### Property 18: Average Time to Rejection

*For any* set of rejected applications, the average time to rejection should equal the mean of (rejectionDate - applicationDate) across all rejected applications.

**Validates: Requirements 5.5**

### Property 19: Success Rate Calculation

*For any* CV version, the success rate should equal (count of applications with status Interview, Offer, or Accepted) / (total applications with that CV version) × 100.

**Validates: Requirements 6.1, 6.2**

### Property 20: Insufficient Data Marking

*For any* CV version with fewer than 3 applications, the performance analysis should mark it as having insufficient data (sufficientData: false).

**Validates: Requirements 6.5**

### Property 21: CV Version Ranking

*For any* set of CV versions, they should be ranked by success rate in descending order, with the highest success rate receiving rank 1.

**Validates: Requirements 6.6**

### Property 22: Storage Round-Trip

*For any* valid application data, saving it to storage and then loading from storage should produce equivalent data.

**Validates: Requirements 8.3**

### Property 23: JSON Structure Validation

*For any* data being written to storage, if the data structure is invalid (not valid JSON schema), the write operation should be rejected.

**Validates: Requirements 8.6**

### Property 24: Dashboard Statistics Accuracy

*For any* user's applications, the dashboard statistics should show: total count matching actual count, counts by status matching actual distribution, and overall success rate calculated correctly.

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 25: Best Performing CV Identification

*For any* user with multiple CV versions, the dashboard should identify the CV version with the highest success rate as the best performing version.

**Validates: Requirements 9.4**

### Property 26: Application Deletion

*For any* application, after deletion, attempting to retrieve that application by its ID should return null or 404.

**Validates: Requirements 10.1, 10.4**

### Property 27: Statistics Update After Deletion

*For any* application, deleting it should result in statistics (total count, rejection count) being recalculated to exclude that application.

**Validates: Requirements 10.3**

### Property 28: API Validation Error Response

*For any* API request with invalid data (empty required fields, invalid dates, invalid status values), the response should be HTTP 400 with a descriptive error message.

**Validates: Requirements 11.8**

### Property 29: API Not Found Response

*For any* API request referencing a non-existent application ID, the response should be HTTP 404.

**Validates: Requirements 11.9**

### Property 30: String Length Validation

*For any* text field with length constraints (company name 1-200, position title 1-200, job description 0-10000), values outside these bounds should be rejected with a validation error.

**Validates: Requirements 12.1, 12.2, 12.5**

### Property 31: Date Logic Validation

*For any* application, the application date should not be in the future, and if an interview date is provided, it should not be before the application date.

**Validates: Requirements 12.3, 12.8**

### Property 32: Input Sanitization

*For any* text input containing control characters or malicious content, the sanitized version should have those characters removed or escaped.

**Validates: Requirements 12.6**

## Error Handling

### Validation Errors

All validation errors return HTTP 400 with a structured error response:

```javascript
{
  error: string,              // Human-readable error message
  code: string,               // Machine-readable error code
  field: string | null,       // Field that failed validation
  details: object | null      // Additional error context
}
```

**Error Codes:**
- `INVALID_COMPANY_NAME`: Company name empty or too long
- `INVALID_POSITION_TITLE`: Position title empty or too long
- `INVALID_DATE`: Date is invalid or in the future
- `INVALID_STATUS`: Status value not in allowed enum
- `INVALID_CV_VERSION`: CV version ID doesn't exist
- `INVALID_JOB_DESCRIPTION`: Job description exceeds max length
- `INVALID_DATE_RANGE`: Interview date before application date
- `MISSING_REQUIRED_FIELD`: Required field not provided

### Not Found Errors

HTTP 404 responses for non-existent resources:

```javascript
{
  error: "Application not found",
  code: "NOT_FOUND",
  resourceId: string
}
```

### Storage Errors

File system errors are handled gracefully:

1. **Corrupted File**: Create backup, log error, initialize empty storage
2. **Write Failure**: Retry once, then return HTTP 500
3. **Read Failure**: Log error, return HTTP 500

```javascript
{
  error: "Storage operation failed",
  code: "STORAGE_ERROR",
  operation: "read" | "write" | "backup"
}
```

### Rate Limiting

Uses existing rate limit middleware. Returns HTTP 429:

```javascript
{
  error: "Too many requests. Please wait a minute.",
  code: "RATE_LIMIT_EXCEEDED"
}
```

### Error Logging

All errors are logged with:
- Timestamp (ISO 8601)
- User ID
- Operation attempted
- Error message and stack trace
- Request context (endpoint, method, params)

## Testing Strategy

### Dual Testing Approach

The Job Application Tracker will use both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests** focus on:
- Specific examples of application creation, updates, and deletion
- Edge cases (empty storage file, corrupted JSON, boundary values)
- Error conditions (invalid inputs, missing fields, non-existent IDs)
- Integration points (rate limiting, sanitization, user identification)
- API endpoint responses (status codes, response structure)

**Property-Based Tests** focus on:
- Universal properties that hold for all inputs (round-trip, uniqueness, calculations)
- Comprehensive input coverage through randomization
- Invariants that must hold regardless of data (sorting, filtering, statistics)

### Property-Based Testing Configuration

**Library**: Use `fast-check` for JavaScript/Node.js property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test references its design document property
- Tag format: `Feature: job-application-tracker, Property {number}: {property_text}`

**Example Test Structure**:

```javascript
// Feature: job-application-tracker, Property 1: Application Data Round-Trip
test('application data round-trip', () => {
  fc.assert(
    fc.property(
      fc.record({
        companyName: fc.string({ minLength: 1, maxLength: 200 }),
        positionTitle: fc.string({ minLength: 1, maxLength: 200 }),
        applicationDate: fc.date({ max: new Date() }),
        cvVersionId: fc.uuid(),
        jobDescription: fc.string({ maxLength: 10000 })
      }),
      (applicationData) => {
        const userId = 'test-user';
        const created = tracker.createApplication(userId, applicationData);
        const retrieved = tracker.getApplication(userId, created.id);
        
        expect(retrieved.companyName).toBe(applicationData.companyName);
        expect(retrieved.positionTitle).toBe(applicationData.positionTitle);
        expect(retrieved.jobDescription).toBe(applicationData.jobDescription);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Test Coverage

**Core Functionality**:
- Application CRUD operations
- CV version management
- Status transitions and history
- Filtering and sorting
- Statistics calculations

**Edge Cases**:
- Empty application list
- Single application
- All applications with same status
- CV version with 0, 1, 2, 3+ applications
- Date range with no matching applications

**Error Scenarios**:
- Empty required fields
- Strings exceeding max length
- Invalid status values
- Future dates
- Non-existent IDs
- Corrupted storage file
- Invalid JSON structure

**Integration Tests**:
- API endpoints with valid requests
- API endpoints with invalid requests
- Rate limiting behavior
- Input sanitization
- User isolation (users can't access each other's data)

### Test Data Generators

For property-based tests, create generators for:

```javascript
// Valid application data
const validApplicationGen = fc.record({
  companyName: fc.string({ minLength: 1, maxLength: 200 }),
  positionTitle: fc.string({ minLength: 1, maxLength: 200 }),
  applicationDate: fc.date({ max: new Date() }),
  cvVersionId: fc.uuid(),
  jobDescription: fc.option(fc.string({ maxLength: 10000 }))
});

// Valid status values
const statusGen = fc.constantFrom(
  'Applied', 'Interview', 'Rejected', 'Offer', 'Accepted'
);

// Invalid status values (for error testing)
const invalidStatusGen = fc.string().filter(
  s => !['Applied', 'Interview', 'Rejected', 'Offer', 'Accepted'].includes(s)
);

// Date ranges
const dateRangeGen = fc.tuple(fc.date(), fc.date()).map(([d1, d2]) => ({
  start: d1 < d2 ? d1 : d2,
  end: d1 < d2 ? d2 : d1
}));
```

### Test Organization

```
tests/
├── unit/
│   ├── application-tracker.test.js
│   ├── cv-version-manager.test.js
│   ├── performance-analyzer.test.js
│   └── storage-service.test.js
├── integration/
│   ├── api-endpoints.test.js
│   └── user-isolation.test.js
└── property/
    ├── application-properties.test.js
    ├── cv-version-properties.test.js
    ├── statistics-properties.test.js
    └── validation-properties.test.js
```

### Continuous Testing

- Run unit tests on every commit
- Run property-based tests (100 iterations) on every commit
- Run extended property-based tests (1000 iterations) nightly
- Monitor test execution time and optimize slow tests
- Track code coverage (target: 90%+ for business logic)

