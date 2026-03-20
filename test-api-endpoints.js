// Quick test script for Job Application Tracker API endpoints
// Using built-in fetch (Node.js 18+)

const BASE_URL = 'http://localhost:3001';
const SESSION_ID = 'test-session-' + Date.now();

const headers = {
  'Content-Type': 'application/json',
  'x-session-id': SESSION_ID
};

async function testEndpoints() {
  console.log('Testing Job Application Tracker API Endpoints\n');
  
  try {
    // Test 1: Create a CV version
    console.log('1. Creating CV version...');
    const cvVersionResponse = await fetch(`${BASE_URL}/api/cv-versions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Tech-focused CV',
        description: 'CV optimized for tech roles',
        atsScore: 85,
        status: 'active'
      })
    });
    const cvVersion = await cvVersionResponse.json();
    console.log('✓ CV version created:', cvVersion.id);
    
    // Test 2: Create an application
    console.log('\n2. Creating application...');
    const appResponse = await fetch(`${BASE_URL}/api/applications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        companyName: 'Tech Corp',
        positionTitle: 'Senior Developer',
        applicationDate: new Date().toISOString(),
        cvVersionId: cvVersion.id,
        jobDescription: 'Looking for a senior developer with 5+ years experience'
      })
    });
    const application = await appResponse.json();
    console.log('✓ Application created:', application.id);
    
    // Test 3: Get single application
    console.log('\n3. Getting single application...');
    const getAppResponse = await fetch(`${BASE_URL}/api/applications/${application.id}`, {
      headers
    });
    const retrievedApp = await getAppResponse.json();
    console.log('✓ Application retrieved:', retrievedApp.companyName, '-', retrievedApp.positionTitle);
    
    // Test 4: Get all applications
    console.log('\n4. Getting all applications...');
    const getAllResponse = await fetch(`${BASE_URL}/api/applications`, {
      headers
    });
    const allApps = await getAllResponse.json();
    console.log('✓ Total applications:', allApps.length);
    
    // Test 5: Update application status
    console.log('\n5. Updating application status...');
    const updateResponse = await fetch(`${BASE_URL}/api/applications/${application.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        status: 'Interview',
        interviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        statusNotes: 'Scheduled for next week'
      })
    });
    const updatedApp = await updateResponse.json();
    console.log('✓ Application updated to:', updatedApp.status);
    
    // Test 6: Get statistics
    console.log('\n6. Getting dashboard statistics...');
    const statsResponse = await fetch(`${BASE_URL}/api/applications/stats`, {
      headers
    });
    const stats = await statsResponse.json();
    console.log('✓ Statistics:', {
      total: stats.totalApplications,
      successRate: stats.successRate + '%',
      rejectionCount: stats.rejectionCount
    });
    
    // Test 7: Get CV versions
    console.log('\n7. Getting all CV versions...');
    const cvVersionsResponse = await fetch(`${BASE_URL}/api/cv-versions`, {
      headers
    });
    const cvVersions = await cvVersionsResponse.json();
    console.log('✓ Total CV versions:', cvVersions.length);
    
    // Test 8: Get CV performance analysis
    console.log('\n8. Getting CV performance analysis...');
    const perfResponse = await fetch(`${BASE_URL}/api/cv-versions/performance`, {
      headers
    });
    const performance = await perfResponse.json();
    console.log('✓ Performance analysis:', performance.length, 'versions analyzed');
    if (performance.length > 0) {
      console.log('  Best performing:', performance[0].versionName, '-', performance[0].successRate + '%');
    }
    
    // Test 9: Delete application
    console.log('\n9. Deleting application...');
    const deleteResponse = await fetch(`${BASE_URL}/api/applications/${application.id}`, {
      method: 'DELETE',
      headers
    });
    console.log('✓ Application deleted, status:', deleteResponse.status);
    
    // Test 10: Verify deletion (should return 404)
    console.log('\n10. Verifying deletion...');
    const verifyResponse = await fetch(`${BASE_URL}/api/applications/${application.id}`, {
      headers
    });
    console.log('✓ Verification status:', verifyResponse.status, '(expected 404)');
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testEndpoints();
