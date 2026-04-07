export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Dynamic import to avoid build failure if @sentry/nestjs is not installed
    const Sentry = require('@sentry/nestjs');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
  } catch {
    console.warn('Sentry not available, skipping initialization');
  }
}
