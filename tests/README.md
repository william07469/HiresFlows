# Job Application Tracker Tests

This directory contains tests for the Job Application Tracker feature.

## Test Structure

- **unit/**: Unit tests for individual components (StorageService, ApplicationTracker, CVVersionManager, PerformanceAnalyzer)
- **integration/**: Integration tests for API endpoints and component interactions
- **property/**: Property-based tests using fast-check for universal properties

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only property-based tests
npm run test:property
```

## Property-Based Testing

Property-based tests use the `fast-check` library to verify universal properties across many randomly generated inputs. Each property test:

- Runs a minimum of 100 iterations
- References its corresponding design document property
- Uses the tag format: `Feature: job-application-tracker, Property {number}: {property_text}`

## Test Guidelines

- Write BOTH unit tests AND property-based tests for new functionality
- Unit tests verify specific examples and edge cases
- Property-based tests verify universal properties hold across all inputs
- Tests should be minimal and focus on core functional logic
- Avoid mocks where possible - test real functionality
