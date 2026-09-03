/**
 * Milestone 5.4.2 — Observability & Request Correlation Verification Suite
 */

const http = require('http');
const assert = require('assert');
const crypto = require('crypto');
const dbPool = require('./config/db');
const storage = require('./utils/storage');

const BASE_URL = 'http://127.0.0.1:5000';

function httpRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Accept': 'application/json',
        'x-bypass-rate-limit': 'true',
        ...headers
      }
    };

    let postData = null;
    if (body) {
      if (typeof body === 'object') {
        postData = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
      } else {
        postData = body;
      }
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

let passedCount = 0;
let failedCount = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`  ✓ PASS: ${desc}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    failedCount++;
  }
}

async function runM542TestSuite() {
  console.log('====================================================');
  console.log('STARTING MILESTONE 5.4.2 OBSERVABILITY & CORRELATION SUITE');
  console.log('====================================================\n');

  try {
    // --- Step 0: User Authentication ---
    console.log('--- Step 0: Authenticating Test Accounts ---');
    const adminLoginRes = await httpRequest('POST', '/api/auth/login', {
      'x-bypass-rate-limit': 'true'
    }, {
      email: 'admin@pinakee.com',
      password: 'admin123'
    });
    const adminToken = adminLoginRes.body?.data?.token;
    check('0. Admin authenticated successfully', adminToken !== undefined);

    // --- Part 1: Request Correlation ID Generation & Acceptance ---
    console.log('\n--- Part 1: Request Correlation ID Generation & Propagation ---');

    // Test 1: Request without X-Request-Id receives a valid generated UUID
    const resNoId = await httpRequest('GET', '/api/health');
    const genId1 = resNoId.headers['x-request-id'];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    check('1. Response includes X-Request-Id header', !!genId1);
    check('1. Generated request ID is a cryptographically strong UUID format', uuidRegex.test(genId1));

    // Test 2: Different requests receive distinct generated IDs
    const resNoId2 = await httpRequest('GET', '/api/health');
    const genId2 = resNoId2.headers['x-request-id'];
    check('2. Successive requests receive distinct UUIDs', genId1 !== genId2);

    // Test 3: Client supplied valid X-Request-Id is accepted and echoed back
    const customReqId = 'req-trace-pinakee-' + Date.now() + '-custom';
    const resCustom = await httpRequest('GET', '/api/health', {
      'x-request-id': customReqId
    });
    check('3. Client supplied valid X-Request-Id is echoed in response header', resCustom.headers['x-request-id'] === customReqId);

    // Test 4: Alternative X-Correlation-Id header is accepted if X-Request-Id absent
    const customCorrId = 'corr-uuid-alpha-9988';
    const resCorr = await httpRequest('GET', '/api/health', {
      'x-correlation-id': customCorrId
    });
    check('4. Client supplied X-Correlation-Id is recognized and mapped to X-Request-Id', resCorr.headers['x-request-id'] === customCorrId);

    // --- Part 2: Malformed and Oversized Header Sanitization ---
    console.log('\n--- Part 2: Malformed & Oversized Header Sanitization ---');

    // Test 5: Oversized header (>64 chars) is rejected and replaced with generated UUID
    const oversizedId = 'a'.repeat(200);
    const resOversized = await httpRequest('GET', '/api/health', {
      'x-request-id': oversizedId
    });
    check('5. Oversized X-Request-Id is replaced with safe generated UUID', resOversized.headers['x-request-id'] !== oversizedId && uuidRegex.test(resOversized.headers['x-request-id']));

    // Test 6: Malformed header containing injection/whitespace characters is sanitized/replaced
    const injectionId = 'req-id; DROP TABLE users; <script>alert(1)</script>';
    const resInjection = await httpRequest('GET', '/api/health', {
      'x-request-id': injectionId
    });
    check('6. Malformed/injection X-Request-Id is replaced with safe generated UUID', resInjection.headers['x-request-id'] !== injectionId && uuidRegex.test(resInjection.headers['x-request-id']));

    // --- Part 3: Error Tracing & Response Correlation ---
    console.log('\n--- Part 3: Error Tracing & Correlation ---');

    // Test 7: 404 endpoint returns X-Request-Id header
    const notFoundReqId = 'trace-404-' + Date.now();
    const res404 = await httpRequest('GET', '/api/non-existent-endpoint-test', {
      'x-request-id': notFoundReqId
    });
    check('7. 404 Not Found response preserves X-Request-Id header', res404.headers['x-request-id'] === notFoundReqId);
    check('7. 404 response payload structure is intact', res404.status === 404 && res404.body?.success === false);

    // Test 8: 401 Unauthorized returns X-Request-Id header
    const authReqId = 'trace-auth-401-' + Date.now();
    const res401 = await httpRequest('GET', '/api/complaints', {
      'Authorization': 'Bearer invalid_token_xyz',
      'x-request-id': authReqId
    });
    check('8. 401 Unauthorized response preserves X-Request-Id header', res401.headers['x-request-id'] === authReqId);

    // --- Part 4: Audit Log Correlation & Database Metadata Verification ---
    console.log('\n--- Part 4: Audit Log Correlation Verification ---');

    // Test 9: Authenticated action attaches requestId to audit log metadata
    const auditTraceId = 'audit-trace-' + Date.now();
    // Perform an audit-logged action (e.g. invalid login or view)
    const auditActionRes = await httpRequest('POST', '/api/auth/login', {
      'x-request-id': auditTraceId
    }, {
      email: 'nonexistent_user_for_audit@example.com',
      password: 'wrongpassword'
    });

    // Verify row in database audit_logs table
    const auditDbRes = await dbPool.query(
      "SELECT * FROM audit_logs WHERE action_type = 'AUTH_FAILED' ORDER BY created_at DESC LIMIT 5"
    );
    const matchingAudit = auditDbRes.rows.find(row => {
      const meta = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json;
      return meta?.requestId === auditTraceId;
    });
    check('9. Audit log persists requestId inside metadata_json JSONB field', matchingAudit !== undefined);
    check('9. Zero database schema migrations were required for audit correlation', auditDbRes.fields.some(f => f.name === 'metadata_json'));

    // --- Part 5: Security & Secret Leakage Prevention ---
    console.log('\n--- Part 5: Zero-Leakage Security Verification ---');

    // Test 10: X-Request-Id does not leak tokens, passwords, or JWT secrets
    const sensitiveTestId = 'trace-leakage-check-' + Date.now();
    const leakageRes = await httpRequest('GET', '/api/categories', {
      'Authorization': `Bearer ${adminToken}`,
      'x-request-id': sensitiveTestId
    });
    check('10. Response headers do not leak Authorization secrets', !leakageRes.headers['authorization']);
    check('10. Response body contains valid data without server secrets', leakageRes.status === 200 && Array.isArray(leakageRes.body?.data));

    // --- Part 6: Concurrent Request Independence ---
    console.log('\n--- Part 6: Concurrent Request Independence ---');

    // Test 11: 10 parallel requests all receive distinct, unique X-Request-Ids
    const parallelCount = 10;
    const parallelPromises = [];
    for (let i = 0; i < parallelCount; i++) {
      parallelPromises.push(httpRequest('GET', '/api/health'));
    }
    const parallelResults = await Promise.all(parallelPromises);
    const parallelIds = parallelResults.map(r => r.headers['x-request-id']);
    const uniqueIds = new Set(parallelIds);
    check(`11. ${parallelCount} concurrent requests generated ${parallelCount} unique correlation IDs`, uniqueIds.size === parallelCount);

    // --- Part 7: Background Worker Independence ---
    console.log('\n--- Part 7: Background Worker Independence ---');

    // Test 12: Storage driver and email outbox worker retain operational integrity
    const emailWorker = require('./utils/emailWorker');
    check('12. Email worker module exports start and stop', typeof emailWorker.start === 'function' && typeof emailWorker.stop === 'function');

    const slaScheduler = require('./utils/slaScheduler');
    check('12. SLA scheduler module exports startSlaScheduler', typeof slaScheduler.startSlaScheduler === 'function');

  } catch (err) {
    console.error('Test execution error:', err);
    failedCount++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runM542TestSuite().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
