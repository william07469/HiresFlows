# Requirements Document

## Introduction

Job Application Tracker, kullanıcıların iş başvurularını sistematik olarak takip etmelerini, hangi CV versiyonunun daha iyi performans gösterdiğini analiz etmelerini ve başvuru süreçlerini optimize etmelerini sağlayan bir özelliktir. Bu özellik, mevcut CV builder ve ATS analyzer uygulamasına entegre edilecek ve kullanıcılara başvuru yönetimi, performans analizi ve veri odaklı karar verme yetenekleri kazandıracaktır.

## Glossary

- **Application_Tracker**: İş başvurularını kaydeden, saklayan ve yöneten sistem bileşeni
- **CV_Version**: Kullanıcının farklı iş ilanlarına gönderdiği CV'nin belirli bir varyasyonu
- **Job_Posting**: Kullanıcının başvurduğu iş ilanı (şirket adı, pozisyon, ilan metni içerir)
- **Application_Status**: Başvurunun mevcut durumu (Applied, Interview, Rejected, Offer, Accepted)
- **Performance_Analyzer**: CV versiyonlarının başarı oranlarını hesaplayan analiz motoru
- **User**: Sistemi kullanan ve iş başvurularını takip eden kişi
- **Application_Record**: Tek bir iş başvurusuna ait tüm bilgileri içeren kayıt
- **Success_Rate**: Bir CV versiyonunun pozitif sonuç (mülakat, teklif) alma oranı
- **Storage_Service**: Başvuru verilerini kalıcı olarak saklayan servis (JSON file veya database)

## Requirements

### Requirement 1: Başvuru Kaydı Oluşturma

**User Story:** As a job seeker, I want to record my job applications with all relevant details, so that I can track which positions I've applied to and with which CV version.

#### Acceptance Criteria

1. WHEN User submits a new application record, THE Application_Tracker SHALL save the record with company name, position title, application date, CV version identifier, and job description
2. THE Application_Tracker SHALL assign a unique identifier to each Application_Record
3. WHEN User provides a job description, THE Application_Tracker SHALL store the full text for future analysis
4. THE Application_Tracker SHALL set the initial Application_Status to "Applied"
5. WHEN User does not provide a CV version identifier, THE Application_Tracker SHALL assign a default version identifier
6. THE Application_Tracker SHALL validate that company name and position title are not empty before saving

### Requirement 2: Başvuru Durumu Güncelleme

**User Story:** As a job seeker, I want to update the status of my applications, so that I can track my progress through different stages of the hiring process.

#### Acceptance Criteria

1. WHEN User selects an Application_Record and chooses a new status, THE Application_Tracker SHALL update the Application_Status
2. THE Application_Tracker SHALL support these status values: Applied, Interview, Rejected, Offer, Accepted
3. WHEN Application_Status changes to "Rejected", THE Application_Tracker SHALL record the rejection date
4. WHEN Application_Status changes to "Interview", THE Application_Tracker SHALL allow User to add interview date and notes
5. THE Application_Tracker SHALL maintain a status change history for each Application_Record
6. WHEN Application_Status changes, THE Application_Tracker SHALL update the last_modified timestamp

### Requirement 3: CV Versiyonu Yönetimi

**User Story:** As a job seeker, I want to create and manage different CV versions, so that I can tailor my resume for different types of positions.

#### Acceptance Criteria

1. WHEN User creates a new CV version, THE Application_Tracker SHALL store the version with a unique identifier and descriptive name
2. THE Application_Tracker SHALL allow User to associate a CV version with multiple Application_Records
3. WHEN User requests CV version list, THE Application_Tracker SHALL return all saved CV versions with their identifiers and names
4. THE Application_Tracker SHALL store CV content or reference to CV file for each version
5. WHERE User provides ATS score for a CV version, THE Application_Tracker SHALL store the score with the version
6. THE Application_Tracker SHALL allow User to mark a CV version as "active" or "archived"

### Requirement 4: Başvuru Listesi Görüntüleme

**User Story:** As a job seeker, I want to view all my applications in a list, so that I can see my job search activity at a glance.

#### Acceptance Criteria

1. WHEN User requests application list, THE Application_Tracker SHALL return all Application_Records sorted by application date descending
2. THE Application_Tracker SHALL display company name, position title, application date, Application_Status, and CV version for each record
3. WHERE User applies a status filter, THE Application_Tracker SHALL return only Application_Records matching the selected status
4. WHERE User applies a date range filter, THE Application_Tracker SHALL return only Application_Records within the specified date range
5. WHERE User applies a CV version filter, THE Application_Tracker SHALL return only Application_Records using the selected CV version
6. THE Application_Tracker SHALL support sorting by application date, company name, or status

### Requirement 5: Red Sayısı Takibi

**User Story:** As a job seeker, I want to see how many rejections I've received, so that I can understand my application success rate and adjust my strategy.

#### Acceptance Criteria

1. WHEN User requests rejection statistics, THE Application_Tracker SHALL count all Application_Records with status "Rejected"
2. THE Application_Tracker SHALL calculate rejection rate as (rejected count / total applications) * 100
3. WHERE User specifies a date range, THE Application_Tracker SHALL calculate rejection statistics only for that period
4. THE Application_Tracker SHALL display rejection count by CV version
5. THE Application_Tracker SHALL calculate average time to rejection from application date
6. WHEN User views rejection statistics, THE Application_Tracker SHALL display the total rejection count prominently

### Requirement 6: CV Performans Analizi

**User Story:** As a job seeker, I want to see which CV version performs better, so that I can use the most effective resume for future applications.

#### Acceptance Criteria

1. WHEN User requests CV performance analysis, THE Performance_Analyzer SHALL calculate Success_Rate for each CV_Version
2. THE Performance_Analyzer SHALL define Success_Rate as (Interview + Offer + Accepted count) / (total applications with that CV version) * 100
3. THE Performance_Analyzer SHALL calculate rejection rate for each CV_Version
4. THE Performance_Analyzer SHALL calculate average response time for each CV_Version
5. WHEN a CV_Version has fewer than 3 applications, THE Performance_Analyzer SHALL mark the statistics as "insufficient data"
6. THE Performance_Analyzer SHALL rank CV versions by Success_Rate in descending order
7. THE Performance_Analyzer SHALL display comparison metrics between the best and worst performing CV versions

### Requirement 7: Başvuru Detayları Görüntüleme

**User Story:** As a job seeker, I want to view detailed information about a specific application, so that I can review all the information I recorded.

#### Acceptance Criteria

1. WHEN User selects an Application_Record, THE Application_Tracker SHALL display all stored information including company name, position, application date, status, CV version, and job description
2. THE Application_Tracker SHALL display the status change history with timestamps
3. WHERE interview notes exist, THE Application_Tracker SHALL display them in the detail view
4. THE Application_Tracker SHALL display the ATS score of the CV version used for this application
5. WHERE job description was provided, THE Application_Tracker SHALL display keyword match analysis between the CV version and job description
6. THE Application_Tracker SHALL allow User to edit all fields except the unique identifier and creation date

### Requirement 8: Veri Kalıcılığı

**User Story:** As a job seeker, I want my application data to be saved permanently, so that I don't lose my tracking history when I close the application.

#### Acceptance Criteria

1. WHEN User creates or updates an Application_Record, THE Storage_Service SHALL persist the data to disk within 1 second
2. THE Storage_Service SHALL store data in JSON format in a file named "applications.json"
3. WHEN the application starts, THE Storage_Service SHALL load all Application_Records from disk
4. IF the storage file does not exist, THE Storage_Service SHALL create an empty file with valid JSON structure
5. IF the storage file is corrupted, THE Storage_Service SHALL log an error and create a backup before initializing empty storage
6. THE Storage_Service SHALL validate JSON structure before writing to disk

### Requirement 9: Dashboard İstatistikleri

**User Story:** As a job seeker, I want to see summary statistics on a dashboard, so that I can quickly understand my job search progress.

#### Acceptance Criteria

1. WHEN User views the dashboard, THE Application_Tracker SHALL display total number of applications
2. THE Application_Tracker SHALL display count of applications by status (Applied, Interview, Rejected, Offer, Accepted)
3. THE Application_Tracker SHALL display overall Success_Rate across all applications
4. THE Application_Tracker SHALL display the best performing CV version name and its Success_Rate
5. THE Application_Tracker SHALL display total rejection count
6. THE Application_Tracker SHALL display average time from application to first response
7. WHERE User has applications in the last 30 days, THE Application_Tracker SHALL display a trend indicator (increasing/decreasing application rate)

### Requirement 10: Başvuru Silme

**User Story:** As a job seeker, I want to delete application records, so that I can remove incorrect or test entries.

#### Acceptance Criteria

1. WHEN User selects an Application_Record and confirms deletion, THE Application_Tracker SHALL remove the record from storage
2. THE Application_Tracker SHALL require explicit confirmation before deleting an Application_Record
3. WHEN an Application_Record is deleted, THE Application_Tracker SHALL update all statistics immediately
4. THE Application_Tracker SHALL not allow recovery of deleted Application_Records
5. WHEN User deletes an Application_Record, THE Storage_Service SHALL persist the deletion within 1 second
6. THE Application_Tracker SHALL log deletion events with timestamp and record identifier

### Requirement 11: API Endpoint'leri

**User Story:** As a developer, I want RESTful API endpoints for application tracking, so that the frontend can interact with the tracking system.

#### Acceptance Criteria

1. THE Application_Tracker SHALL provide a POST endpoint at "/api/applications" to create new Application_Records
2. THE Application_Tracker SHALL provide a GET endpoint at "/api/applications" to retrieve all Application_Records with optional filters
3. THE Application_Tracker SHALL provide a GET endpoint at "/api/applications/:id" to retrieve a specific Application_Record
4. THE Application_Tracker SHALL provide a PUT endpoint at "/api/applications/:id" to update an Application_Record
5. THE Application_Tracker SHALL provide a DELETE endpoint at "/api/applications/:id" to delete an Application_Record
6. THE Application_Tracker SHALL provide a GET endpoint at "/api/applications/stats" to retrieve dashboard statistics
7. THE Application_Tracker SHALL provide a GET endpoint at "/api/cv-versions/performance" to retrieve CV performance analysis
8. WHEN an API request fails validation, THE Application_Tracker SHALL return HTTP 400 with descriptive error message
9. WHEN an API request references a non-existent Application_Record, THE Application_Tracker SHALL return HTTP 404
10. THE Application_Tracker SHALL apply rate limiting to all API endpoints using the existing rate limit middleware

### Requirement 12: Veri Validasyonu

**User Story:** As a system, I want to validate all input data, so that data integrity is maintained and security vulnerabilities are prevented.

#### Acceptance Criteria

1. WHEN User submits an Application_Record, THE Application_Tracker SHALL validate that company name length is between 1 and 200 characters
2. THE Application_Tracker SHALL validate that position title length is between 1 and 200 characters
3. THE Application_Tracker SHALL validate that application date is not in the future
4. THE Application_Tracker SHALL validate that Application_Status is one of the allowed values
5. WHERE job description is provided, THE Application_Tracker SHALL validate that length does not exceed 10000 characters
6. THE Application_Tracker SHALL sanitize all text inputs using the existing sanitizeText function
7. WHERE CV version identifier is provided, THE Application_Tracker SHALL validate that it matches an existing CV version or is a valid new identifier
8. THE Application_Tracker SHALL validate that interview date is not before application date
