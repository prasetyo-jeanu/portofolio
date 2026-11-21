import path from 'node:path';

export const env = {
  get SITE_URL() {
    return (process.env.SITE_URL || 'http://localhost:4321').replace(/\/+$/, '');
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || 'development';
  },
  get IS_PROD() {
    return (process.env.NODE_ENV || 'development') === 'production';
  },
  get HOST() {
    return process.env.HOST || '0.0.0.0';
  },
  get PORT() {
    return Number(process.env.PORT || 4321);
  },
  get DATABASE_PATH() {
    return path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/portfolio.db');
  },
  get DATABASE_URL() {
    return process.env.DATABASE_URL;
  },
  get MYSQL_HOST() {
    return process.env.MYSQL_HOST || '127.0.0.1';
  },
  get MYSQL_PORT() {
    return Number(process.env.MYSQL_PORT || 3306);
  },
  get MYSQL_USER() {
    return process.env.MYSQL_USER || 'root';
  },
  get MYSQL_PASSWORD() {
    return process.env.MYSQL_PASSWORD || '';
  },
  get MYSQL_DATABASE() {
    return process.env.MYSQL_DATABASE || 'portfolio';
  },
  get UPLOAD_DIR() {
    return path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads');
  },
  get PUBLIC_DIST_DIR() {
    return path.resolve(process.cwd(), process.env.PUBLIC_DIST_DIR || './dist-public');
  },
  get SESSION_SECRET() {
    return process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-in-production-min-32-chars';
  },
  get ADMIN_EMAIL() {
    return process.env.ADMIN_EMAIL || 'admin@example.com';
  },
  get ADMIN_PASSWORD() {
    return process.env.ADMIN_PASSWORD || 'ChangeMeStrongPassword123!';
  },
  get ADMIN_NAME() {
    return process.env.ADMIN_NAME || 'Developer Admin';
  },
  get PUBLISH_LOCK_TIMEOUT_MS() {
    return Number(process.env.PUBLISH_LOCK_TIMEOUT_MS || 300000);
  },
};
