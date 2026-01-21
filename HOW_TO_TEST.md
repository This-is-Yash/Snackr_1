# How to Perform Security Testing on Your Webpage

This guide provides step-by-step instructions for testing the 10 security vulnerabilities in your Snackr Food App.

## Prerequisites

1. Make sure your application is running:
   ```bash
   cd snackr-food-app
   npm start
   # Or if using server.js directly:
   node src/server.js
   ```

2. Have a browser with Developer Tools (Chrome/Firefox recommended)
3. Have curl or Postman installed (optional, for API testing)

---

## Quick Start: Automated Testing

### Step 1: Run the Automated Security Test

```bash
cd snackr-food-app
node test-security.js
```

This will automatically test:
- NoSQL Injection
- Missing Authentication
- CORS Misconfiguration
- Rate Limiting
- Input Validation
- Hardcoded Secrets
- IDOR Vulnerabilities
- NPM Package Vulnerabilities

**Expected Output:**
```
🔒 SECURITY VULNERABILITY TESTING
============================================================
Testing: http://localhost:3001

[TEST 1] NoSQL Injection on Login
  ⚠️  VULNERABLE: NoSQL injection may bypass authentication

[TEST 2] Missing Authentication Checks
  ⚠️  VULNERABLE: /orders/my accessible without authentication

...
```

---

## Manual Testing Guide

### 1. Missing Server-Side Validation

#### Test NoSQL Injection on Login

**Method 1: Using Browser Console**
1. Open your app: `http://localhost:3001/user`
2. Open Developer Tools (F12) → Console tab
3. Run this:
   ```javascript
   fetch('/login/user', {
     method: 'POST',
     headers: {'Content-Type': 'application/x-www-form-urlencoded'},
     body: 'email[$ne]=null&password[$ne]=null'
   }).then(r => r.text()).then(console.log)
   ```
4. **If it returns success without valid credentials → VULNERABLE**

**Method 2: Using curl**
```bash
curl -X POST http://localhost:3001/login/user \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email[$ne]=null&password[$ne]=null"
```

#### Test Input Length Validation

1. Open browser console
2. Run:
   ```javascript
   const longString = 'A'.repeat(10000);
   fetch('/register/user', {
     method: 'POST',
     headers: {'Content-Type': 'application/x-www-form-urlencoded'},
     body: `name=${longString}&email=test@test.com&password=test123&flat=1&building=1&region=1&landmark=1&city=1&pin=123456`
   })
   ```
3. **If server accepts it without error → VULNERABLE**

---

### 2. Hardcoded Secrets

#### Check for Hardcoded Secrets

```bash
# Search for secrets in code
cd snackr-food-app
grep -r "secret\|password\|api_key" src/ --ignore-case

# Check server.js for hardcoded values
grep "secret:\|mongodb://" src/server.js
```

**What to look for:**
- `secret: "snackr-secret"` ← Hardcoded session secret
- `mongodb://127.0.0.1:27017` ← Hardcoded database URL
- Any API keys or passwords in code

**Fix:** Move to `.env` file:
```bash
# Create .env file
echo "SESSION_SECRET=your-random-secret-here" > .env
echo "MONGODB_URI=mongodb://localhost:27017/snackr" >> .env
```

---

### 3. Outdated NPM Packages

#### Run NPM Audit

```bash
cd snackr-food-app
npm audit
```

**Look for:**
- High/Critical severity vulnerabilities
- XSS vulnerabilities
- Prototype pollution
- ReDoS (Regular Expression Denial of Service)

**Fix vulnerabilities:**
```bash
npm audit fix
# Or for major updates:
npm update
```

---

### 4. Missing Authentication Checks

#### Test Protected Endpoints Without Login

**Test 1: Access Orders Without Login**
```javascript
// In browser console (not logged in)
fetch('/orders/my')
  .then(r => r.json())
  .then(console.log)
```
**If it returns data → VULNERABLE**

**Test 2: Access Restaurant Orders**
```javascript
// Try accessing any restaurant's orders
fetch('/restaurant/ANY_ID/orders')
  .then(r => r.text())
  .then(console.log)
```
**If it shows orders without checking ownership → VULNERABLE**

**Test 3: Add to Cart Without Login**
```javascript
fetch('/cart/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'itemId=test&restaurantId=test&itemName=test&price=100&quantity=1'
})
```
**If it succeeds without session → VULNERABLE**

---

### 5. No Rate Limiting

#### Test Brute Force Protection

**Method 1: Rapid Login Attempts**
```bash
# Using curl in a loop (Windows PowerShell)
for ($i=1; $i -le 100; $i++) {
  curl -X POST http://localhost:3001/login/user -H "Content-Type: application/x-www-form-urlencoded" -d "email=test@test.com&password=wrong$i"
}
```

**Method 2: Using Browser Console**
```javascript
// Make 100 rapid requests
for (let i = 0; i < 100; i++) {
  fetch('/login/user', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'email=test@test.com&password=wrong'
  });
}
```

**Expected:** Server should return 429 (Too Many Requests) or slow down
**If all requests succeed quickly → VULNERABLE**

---

### 6. CORS Misconfiguration

#### Test CORS Headers

**Method 1: Using curl**
```bash
curl -I -X OPTIONS http://localhost:3001/orders/my \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET"
```

**Look for:**
```
Access-Control-Allow-Origin: *
```
**If you see `*` → VULNERABLE**

**Method 2: Using Browser Console**
```javascript
fetch('http://localhost:3001/orders/my', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://evil.com',
    'Access-Control-Request-Method': 'GET'
  }
}).then(r => {
  console.log('CORS Header:', r.headers.get('access-control-allow-origin'));
})
```

---

### 7. Missing HTTPS Enforcement

#### Test HTTP vs HTTPS

1. Check if your app runs on HTTP:
   ```bash
   curl -I http://localhost:3001/login/user
   ```

2. Check for HSTS headers:
   ```bash
   curl -I https://your-domain.com/login/user | grep -i strict-transport
   ```

3. **If no HTTPS redirect and no HSTS → VULNERABLE**

**Note:** For local testing, this may not apply, but check production deployment.

---

### 8. React XSS Vulnerabilities

#### Test XSS in Forms

**Step 1: Open XSS Testing Tool**
```bash
# Open in browser
open xss-test.html
# Or navigate to: file:///path/to/snackr-food-app/xss-test.html
```

**Step 2: Test Registration Form**
1. Go to `http://localhost:3001/user`
2. In the registration form, enter this in the "Full Name" field:
   ```
   <script>alert('XSS')</script>
   ```
3. Fill other required fields and submit
4. **If alert pops up → VULNERABLE**

**Step 3: Test Other Input Fields**
Try XSS payloads in:
- Search boxes
- Comment fields
- Any text input

**Common XSS Payloads:**
```
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
<svg onload=alert('XSS')>
javascript:alert('XSS')
```

---

### 9. No Access Control on Admin Pages

#### Test Privilege Escalation

**Test 1: Access Admin Functions as Regular User**
1. Register as a regular user
2. Login
3. Try accessing restaurant admin functions:
   ```javascript
   // In browser console (logged in as regular user)
   fetch('/restaurant/SOME_RESTAURANT_ID/menu/add', {
     method: 'POST',
     headers: {'Content-Type': 'application/x-www-form-urlencoded'},
     body: 'name=Hacked Item&description=Test&price=999&category=Test&available=true'
   })
   ```
4. **If it succeeds → VULNERABLE**

**Test 2: Access Other Users' Orders**
1. Login as User A
2. Get your order ID from `/orders/my`
3. Try accessing another user's order:
   ```javascript
   fetch('/orders/OTHER_USER_ORDER_ID')
   ```
4. **If you can see other users' orders → VULNERABLE (IDOR)**

---

### 10. Insecure JWT Handling

**Note:** Your app uses sessions, not JWT. But if you add JWT later, test:

#### Test JWT Storage

```javascript
// Check if JWT is in localStorage (insecure)
console.log(localStorage.getItem('token'));

// Check if JWT is in cookies without HttpOnly
document.cookie
```

#### Test JWT Algorithm

If JWT is used:
```javascript
// Decode JWT
const token = localStorage.getItem('token');
const parts = token.split('.');
const header = JSON.parse(atob(parts[0]));
const payload = JSON.parse(atob(parts[1]));

console.log('Algorithm:', header.alg);
console.log('Expires:', payload.exp ? new Date(payload.exp * 1000) : 'Never');

// If alg is "none" → VULNERABLE
// If no exp → VULNERABLE (never expires)
```

---

## Testing Checklist

Use this checklist to track your testing:

- [ ] **NoSQL Injection**: Tested login with `[$ne]=null` payload
- [ ] **Input Validation**: Tested with 10,000 character input
- [ ] **Hardcoded Secrets**: Checked server.js for secrets
- [ ] **NPM Audit**: Ran `npm audit` and reviewed results
- [ ] **Authentication**: Tested `/orders/my` without login
- [ ] **Rate Limiting**: Made 100 rapid requests
- [ ] **CORS**: Checked for `Access-Control-Allow-Origin: *`
- [ ] **HTTPS**: Checked for HTTPS enforcement
- [ ] **XSS**: Tested `<script>alert('XSS')</script>` in forms
- [ ] **Access Control**: Tried admin functions as regular user
- [ ] **JWT**: Checked token storage and expiration (if applicable)

---

## Tools Provided

1. **`test-security.js`** - Automated security testing script
2. **`SECURITY_TESTING_GUIDE.md`** - Detailed vulnerability explanations
3. **`xss-test.html`** - Interactive XSS testing tool

---

## Next Steps After Testing

1. **Document Findings**: Create a security report
2. **Prioritize Fixes**: 
   - Critical: Authentication, Input Validation
   - High: Secrets, Rate Limiting
   - Medium: CORS, NPM updates
3. **Implement Fixes**: See remediation suggestions in `SECURITY_TESTING_GUIDE.md`
4. **Re-test**: Run tests again after fixes

---

## Important Reminders

⚠️ **Only test on your own application**
⚠️ **Never test on production without authorization**
⚠️ **Use a test database, not production data**
⚠️ **Document all findings for learning purposes**

---

## Getting Help

If you encounter issues:
1. Check that your server is running: `http://localhost:3001`
2. Check browser console for errors
3. Review `SECURITY_TESTING_GUIDE.md` for detailed explanations
4. Ensure MongoDB is running if testing database-related vulnerabilities

---

**Happy (and safe) testing! 🔒**

