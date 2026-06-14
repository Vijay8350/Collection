// Cloudflare R2 client (S3-compatible).
// Use @aws-sdk/client-s3 — install with: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

// This module is a thin wrapper that throws if R2 env vars are missing,
// so the rest of the app can opt-in without forcing every dev to set up R2.

export interface UploadOptions {
  filename: string;
  contentType: string;
  body: Buffer | Uint8Array;
  ttlDays?: number; // default 180; the R2 lifecycle policy enforces deletion
}

export async function uploadFile(opts: UploadOptions): Promise<{ key: string; publicUrl: string; signedUrl: string }> {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  for (const k of required) {
    if (!process.env[k]) {
      throw new Error(`R2 not configured: ${k} is missing`);
    }
  }

  // Lazy-import so apps without R2 still boot.
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}-${opts.filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );

  const signedUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
    { expiresIn: 3600 },
  );
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  return { key, publicUrl, signedUrl };
}
