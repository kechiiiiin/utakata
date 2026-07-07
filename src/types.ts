export type Env = {
  KV: KVNamespace;
  ALLOWED_EMAILS: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  DEV_AUTH_BYPASS?: string;
};

export type SiteFile = {
  path: string;
};

export type SiteMeta = {
  id: string;
  owner: string; // Google sub
  email: string;
  title: string;
  entry: string; // entry file path
  files: SiteFile[];
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
};

export type SiteDigest = {
  id: string;
  title: string;
  expiresAt: number;
};

export type Session = {
  sub: string;
  email: string;
  expiresAt: number;
};

export type UploadFile = {
  path: string;
  content: string;
};
