import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './test/global-setup.js',
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/luxwatch_test?replicaSet=rs0',
      JWT_SECRET: 'test-only-secret-0123456789-0123456789-0123456789',
      WEB_ORIGIN: 'http://localhost:5173',
      // Fake gateway credentials: enough to enable the code paths, never used to call Razorpay.
      RAZORPAY_KEY_ID: 'rzp_test_dummy',
      RAZORPAY_KEY_SECRET: 'dummy_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
      UPLOAD_DIR: './test/.uploads',
    },
  },
});
