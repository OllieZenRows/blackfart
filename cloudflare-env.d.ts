declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BF_ADMIN_EMAIL?: string;
  }
}
