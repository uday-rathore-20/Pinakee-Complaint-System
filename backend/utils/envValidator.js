/**
 * Environment & Configuration Validator for Production Hardening.
 * Validates mandatory environment variables when NODE_ENV === 'production'.
 */

const INSECURE_JWT_SECRETS = [
  'fallback_secret_key',
  'secret',
  'jwt_secret',
  'password',
  '123456',
  'change_me',
  'your_jwt_secret',
  'pinakee_secret',
  'default_secret'
];

/**
 * Validates environment variables for production readiness.
 * @param {Object} [customEnv=process.env] - Environment object to inspect
 * @param {boolean} [throwOnError=true] - Whether to throw an Error on validation failure
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateProductionEnv(customEnv = process.env, throwOnError = true) {
  const env = customEnv || {};
  const isProduction = env.NODE_ENV === 'production';
  const errors = [];

  // In development and test modes, bypass production assertions
  if (!isProduction) {
    return { valid: true, errors: [] };
  }

  // 1. Validate JWT_SECRET
  if (!env.JWT_SECRET || !env.JWT_SECRET.trim()) {
    errors.push('JWT_SECRET is required in production mode.');
  } else {
    const trimmedSecret = env.JWT_SECRET.trim();
    if (INSECURE_JWT_SECRETS.includes(trimmedSecret.toLowerCase())) {
      errors.push('JWT_SECRET must not use insecure default/fallback values in production mode.');
    } else if (trimmedSecret.length < 16) {
      errors.push('JWT_SECRET must be at least 16 characters long for production security.');
    }
  }

  // 2. Validate DATABASE_URL
  if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
    errors.push('DATABASE_URL is required in production mode. Local fallback is disabled.');
  }

  // 3. Validate ALLOWED_ORIGINS
  if (!env.ALLOWED_ORIGINS || !env.ALLOWED_ORIGINS.trim()) {
    errors.push('ALLOWED_ORIGINS is required in production mode. Localhost regex fallback is disabled.');
  }

  // 4. Validate STORAGE_DRIVER and driver-specific credentials
  const rawDriver = env.STORAGE_DRIVER ? env.STORAGE_DRIVER.trim().toLowerCase() : 'local';
  if (rawDriver !== 'local' && rawDriver !== 's3') {
    errors.push(`Invalid STORAGE_DRIVER "${env.STORAGE_DRIVER}". Supported values are "local" and "s3".`);
  } else if (rawDriver === 's3') {
    const hasAccessKey = env.AWS_ACCESS_KEY_ID && !env.AWS_ACCESS_KEY_ID.startsWith('mock_') && env.AWS_ACCESS_KEY_ID.trim().length > 0;
    const hasSecretKey = env.AWS_SECRET_ACCESS_KEY && env.AWS_SECRET_ACCESS_KEY.trim().length > 0;
    const hasBucket = env.AWS_S3_BUCKET && env.AWS_S3_BUCKET.trim().length > 0;

    if (!hasAccessKey || !hasSecretKey || !hasBucket) {
      errors.push('AWS S3 credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET) are required when STORAGE_DRIVER is "s3" in production mode.');
    }
  }

  // 5. Note on SMTP: SMTP configuration (SMTP_HOST, SMTP_PORT, etc.) is strictly optional.

  if (errors.length > 0) {
    const errorMessage = `CRITICAL CONFIGURATION ERROR:\n- ${errors.join('\n- ')}`;
    if (throwOnError) {
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

module.exports = {
  validateProductionEnv,
  INSECURE_JWT_SECRETS,
};
