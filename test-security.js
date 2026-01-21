/**
 * Security Testing Script for Snackr Food App
 * 
 * ⚠️ WARNING: Only run this on your own application in a controlled environment.
 * Never test on production systems or systems you don't own.
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testNoSQLInjection() {
  log('\n[TEST 1] NoSQL Injection on Login', 'cyan');
  try {
    const res = await makeRequest(`${BASE_URL}/login/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'email[$ne]=null&password[$ne]=null'
    });
    
    if (res.status === 200 && !res.body.includes('Login failed')) {
      log('  ⚠️  VULNERABLE: NoSQL injection may bypass authentication', 'red');
      return true;
    } else {
      log('  ✓ Protected against NoSQL injection', 'green');
      return false;
    }
  } catch (e) {
    log(`  ✗ Error: ${e.message}`, 'yellow');
    return false;
  }
}

async function testMissingAuth() {
  log('\n[TEST 2] Missing Authentication Checks', 'cyan');
  const endpoints = [
    '/orders/my',
    '/cart',
    '/restaurants'
  ];
  
  let vulnerable = false;
  for (const endpoint of endpoints) {
    try {
      const res = await makeRequest(`${BASE_URL}${endpoint}`);
      if (res.status === 200 && !res.body.includes('Not logged in') && !res.body.includes('401')) {
        log(`  ⚠️  VULNERABLE: ${endpoint} accessible without authentication`, 'red');
        vulnerable = true;
      } else {
        log(`  ✓ ${endpoint} requires authentication`, 'green');
      }
    } catch (e) {
      log(`  ✗ ${endpoint}: ${e.message}`, 'yellow');
    }
  }
  return vulnerable;
}

async function testCORS() {
  log('\n[TEST 3] CORS Misconfiguration', 'cyan');
  try {
    const res = await makeRequest(`${BASE_URL}/orders/my`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    
    const corsHeader = res.headers['access-control-allow-origin'];
    if (corsHeader === '*') {
      log('  ⚠️  VULNERABLE: CORS allows all origins (*)', 'red');
      return true;
    } else if (corsHeader) {
      log(`  ⚠️  CORS configured: ${corsHeader}`, 'yellow');
      return false;
    } else {
      log('  ✓ CORS not configured (may be intentional)', 'green');
      return false;
    }
  } catch (e) {
    log(`  ✗ Error: ${e.message}`, 'yellow');
    return false;
  }
}

async function testRateLimiting() {
  log('\n[TEST 4] Rate Limiting', 'cyan');
  try {
    const start = Date.now();
    const requests = [];
    
    // Make 50 rapid requests
    for (let i = 0; i < 50; i++) {
      requests.push(
        makeRequest(`${BASE_URL}/login/user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'email=test@test.com&password=wrong'
        }).catch(() => ({ status: 429 }))
      );
    }
    
    const results = await Promise.all(requests);
    const duration = Date.now() - start;
    const rateLimited = results.some(r => r.status === 429);
    
    if (rateLimited) {
      log('  ✓ Rate limiting detected (429 responses)', 'green');
      return false;
    } else if (duration < 2000) {
      log('  ⚠️  VULNERABLE: No rate limiting detected (50 requests in <2s)', 'red');
      return true;
    } else {
      log('  ? Rate limiting may be present (slow responses)', 'yellow');
      return false;
    }
  } catch (e) {
    log(`  ✗ Error: ${e.message}`, 'yellow');
    return false;
  }
}

async function testInputValidation() {
  log('\n[TEST 5] Input Validation', 'cyan');
  try {
    // Test with extremely long input
    const longString = 'A'.repeat(10000);
    const res = await makeRequest(`${BASE_URL}/register/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `name=${longString}&email=test@test.com&password=test123&flat=1&building=1&region=1&landmark=1&city=1&pin=123456`
    });
    
    if (res.status === 200 && !res.body.includes('too long') && !res.body.includes('invalid')) {
      log('  ⚠️  VULNERABLE: No input length validation', 'red');
      return true;
    } else {
      log('  ✓ Input validation present', 'green');
      return false;
    }
  } catch (e) {
    log(`  ✗ Error: ${e.message}`, 'yellow');
    return false;
  }
}

async function testHardcodedSecrets() {
  log('\n[TEST 6] Hardcoded Secrets', 'cyan');
  const fs = require('fs');
  const path = require('path');
  
  try {
    const serverPath = path.join(__dirname, 'src', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    const issues = [];
    if (serverContent.includes('secret: "snackr-secret"')) {
      issues.push('Hardcoded session secret found');
    }
    if (serverContent.includes('mongodb://127.0.0.1:27017') && !serverContent.includes('process.env')) {
      issues.push('Hardcoded MongoDB connection string');
    }
    
    if (issues.length > 0) {
      log('  ⚠️  VULNERABLE: Hardcoded secrets found:', 'red');
      issues.forEach(issue => log(`    - ${issue}`, 'red'));
      return true;
    } else {
      log('  ✓ No obvious hardcoded secrets', 'green');
      return false;
    }
  } catch (e) {
    log(`  ✗ Error: ${e.message}`, 'yellow');
    return false;
  }
}

async function testIDOR() {
  log('\n[TEST 7] Insecure Direct Object Reference (IDOR)', 'cyan');
  try {
    // Try accessing restaurant orders with different IDs
    const testIds = ['507f1f77bcf86cd799439011', '000000000000000000000000'];
    
    for (const id of testIds) {
      const res = await makeRequest(`${BASE_URL}/restaurant/${id}/orders`);
      if (res.status === 200 && !res.body.includes('Not authorized') && !res.body.includes('401')) {
        log(`  ⚠️  VULNERABLE: Can access restaurant orders without proper authorization`, 'red');
        return true;
      }
    }
    
    log('  ✓ IDOR protection may be present', 'green');
    return false;
  } catch (e) {
    log(`  ✗ Error: ${e.message}`, 'yellow');
    return false;
  }
}

async function checkNpmAudit() {
  log('\n[TEST 8] NPM Package Vulnerabilities', 'cyan');
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    const { stdout } = await execPromise('npm audit --json', { 
      cwd: __dirname,
      timeout: 30000
    });
    
    const audit = JSON.parse(stdout);
    const vulnerabilities = audit.vulnerabilities || {};
    const vulnCount = Object.keys(vulnerabilities).length;
    
    if (vulnCount > 0) {
      log(`  ⚠️  VULNERABLE: ${vulnCount} packages with known vulnerabilities`, 'red');
      log('  Run "npm audit" for details', 'yellow');
      return true;
    } else {
      log('  ✓ No known vulnerabilities in packages', 'green');
      return false;
    }
  } catch (e) {
    log('  ? Could not run npm audit (may need to run manually)', 'yellow');
    log(`  Run: cd ${__dirname} && npm audit`, 'yellow');
    return false;
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🔒 SECURITY VULNERABILITY TESTING', 'blue');
  log('='.repeat(60), 'blue');
  log(`Testing: ${BASE_URL}`, 'cyan');
  
  const results = {
    nosql: await testNoSQLInjection(),
    auth: await testMissingAuth(),
    cors: await testCORS(),
    rateLimit: await testRateLimiting(),
    validation: await testInputValidation(),
    secrets: await testHardcodedSecrets(),
    idor: await testIDOR(),
    npm: await checkNpmAudit()
  };
  
  const vulnCount = Object.values(results).filter(Boolean).length;
  
  log('\n' + '='.repeat(60), 'blue');
  log('📊 TEST SUMMARY', 'blue');
  log('='.repeat(60), 'blue');
  
  log(`\nTotal Vulnerabilities Found: ${vulnCount}`, vulnCount > 0 ? 'red' : 'green');
  
  if (vulnCount > 0) {
    log('\n⚠️  Vulnerabilities Detected:', 'yellow');
    if (results.nosql) log('  - NoSQL Injection', 'red');
    if (results.auth) log('  - Missing Authentication', 'red');
    if (results.cors) log('  - CORS Misconfiguration', 'red');
    if (results.rateLimit) log('  - No Rate Limiting', 'red');
    if (results.validation) log('  - Missing Input Validation', 'red');
    if (results.secrets) log('  - Hardcoded Secrets', 'red');
    if (results.idor) log('  - IDOR Vulnerability', 'red');
    if (results.npm) log('  - Vulnerable NPM Packages', 'red');
  } else {
    log('\n✓ No obvious vulnerabilities detected in automated tests', 'green');
    log('  (Manual testing still recommended)', 'yellow');
  }
  
  log('\n📖 See SECURITY_TESTING_GUIDE.md for detailed testing methods', 'cyan');
  log('='.repeat(60) + '\n', 'blue');
}

// Run tests
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };

