import fs from 'node:fs';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { publishingJobs } from '../db/schema';
import { env } from './env';
import { materializeContentFromDb } from '../../scripts/materialize-content';

let inMemoryLock = false;

const STAGING_DIR = path.resolve(process.cwd(), '.build-staging');
const STAGING_OUT_DIR = path.join(STAGING_DIR, 'dist');
const PREV_DIST_DIR = `${env.PUBLIC_DIST_DIR}.prev`;

function safeCopyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function safeMoveDir(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest);
  } catch (err: any) {
    if (err && (err.code === 'EXDEV' || err.code === 'EPERM' || err.code === 'EBUSY')) {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

async function runCommandCapture(
  cmd: string[],
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

export async function isPublishRunning(): Promise<boolean> {
  if (inMemoryLock) return true;

  const running = await db
    .select()
    .from(publishingJobs)
    .where(eq(publishingJobs.status, 'running'))
    .orderBy(desc(publishingJobs.startedAt))
    .limit(1);

  if (running.length === 0) return false;

  const ageMs = Date.now() - running[0].startedAt.getTime();
  if (ageMs > env.PUBLISH_LOCK_TIMEOUT_MS) {
    await db
      .update(publishingJobs)
      .set({
        status: 'failed',
        errorMessage: 'Publishing job timed out and lock was automatically released.',
        finishedAt: new Date(),
      })
      .where(eq(publishingJobs.id, running[0].id));
    return false;
  }

  return true;
}

export async function runPublishPipeline(userId: number | null, triggerSource = 'admin'): Promise<{
  jobId: number;
  status: 'success' | 'failed';
  summary: string;
  errorMessage?: string;
}> {
  if (await isPublishRunning()) {
    throw new Error('A publishing job is already running. Please wait for it to finish.');
  }

  inMemoryLock = true;
  const startedAt = new Date();
  const logLines: string[] = [];
  const log = (msg: string) => {
    logLines.push(`[${new Date().toISOString()}] ${msg}`);
  };

  const [result] = await db
    .insert(publishingJobs)
    .values({
      status: 'running',
      triggerSource,
      triggeredByUserId: userId,
      startedAt,
      logs: '',
    });

  const [job] = await db
    .select()
    .from(publishingJobs)
    .where(eq(publishingJobs.id, result.insertId))
    .limit(1);

  try {
    log('Starting content materialization from database...');
    const { postsCount, projectsCount } = await materializeContentFromDb();
    log(`Materialized ${postsCount} published post(s) and ${projectsCount} published project(s).`);

    if (fs.existsSync(STAGING_DIR)) {
      try {
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(STAGING_DIR, { recursive: true });

    log('Running Astro build into isolated staging directory...');
    const buildRes = await runCommandCapture(['bun', '--bun', 'astro', 'build'], {
      ASTRO_OUT_DIR: STAGING_OUT_DIR,
    });
    if (buildRes.stdout.trim()) log(buildRes.stdout.trim());
    if (buildRes.stderr.trim()) log(buildRes.stderr.trim());

    if (buildRes.exitCode !== 0) {
      const errDetails = [buildRes.stderr, buildRes.stdout].filter(Boolean).join('\n').trim();
      throw new Error(`Astro build failed (exit code ${buildRes.exitCode}): ${errDetails.slice(-600)}`);
    }

    const builtClientDir = path.join(STAGING_OUT_DIR, 'client');
    if (!fs.existsSync(builtClientDir)) {
      throw new Error('Client output directory was not created by Astro build.');
    }

    log('Generating Pagefind search index...');
    const pagefindRes = await runCommandCapture(['bunx', 'pagefind', '--site', builtClientDir]);
    if (pagefindRes.stdout.trim()) log(pagefindRes.stdout.trim());
    if (pagefindRes.stderr.trim()) log(pagefindRes.stderr.trim());

    if (pagefindRes.exitCode !== 0) {
      const errDetails = [pagefindRes.stderr, pagefindRes.stdout].filter(Boolean).join('\n').trim();
      throw new Error(`Pagefind indexing failed (exit code ${pagefindRes.exitCode}): ${errDetails.slice(-600)}`);
    }

    // Verify essential public artifacts before touching live directory
    const requiredArtifacts = [
      path.join(builtClientDir, 'index.html'),
      path.join(builtClientDir, 'id', 'index.html'),
      path.join(builtClientDir, 'en', 'index.html'),
      path.join(builtClientDir, 'robots.txt'),
      path.join(builtClientDir, 'pagefind', 'pagefind.js'),
    ];
    for (const artifact of requiredArtifacts) {
      if (!fs.existsSync(artifact)) {
        throw new Error(`Missing required build artifact: ${path.relative(builtClientDir, artifact)}`);
      }
    }

    log('Backing up previous public directory snapshot...');
    if (fs.existsSync(PREV_DIST_DIR)) {
      fs.rmSync(PREV_DIST_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(env.PUBLIC_DIST_DIR)) {
      safeCopyDir(env.PUBLIC_DIST_DIR, PREV_DIST_DIR);
    }

    log('Deploying new client build to live public directory...');
    safeCopyDir(builtClientDir, env.PUBLIC_DIST_DIR);

    if (fs.existsSync(STAGING_DIR)) {
      try {
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });
      } catch {}
    }

    const summary = `Published ${postsCount} post(s) and ${projectsCount} project(s) with updated sitemap & Pagefind index.`;
    log(summary);

    await db
      .update(publishingJobs)
      .set({
        status: 'success',
        summary,
        logs: logLines.join('\n'),
        finishedAt: new Date(),
      })
      .where(eq(publishingJobs.id, job.id));

    return { jobId: job.id, status: 'success', summary };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${errorMessage}`);

    if (fs.existsSync(STAGING_DIR)) {
      try {
        fs.rmSync(STAGING_DIR, { recursive: true, force: true });
      } catch {}
    }

    await db
      .update(publishingJobs)
      .set({
        status: 'failed',
        errorMessage,
        logs: logLines.join('\n'),
        finishedAt: new Date(),
      })
      .where(eq(publishingJobs.id, job.id));

    return {
      jobId: job.id,
      status: 'failed',
      summary: 'Publishing failed; previous live site remains active.',
      errorMessage,
    };
  } finally {
    inMemoryLock = false;
  }
}

export async function rollbackLastPublish(userId: number | null): Promise<{
  success: boolean;
  message: string;
}> {
  if (await isPublishRunning()) {
    return { success: false, message: 'Cannot rollback while a publishing job is running.' };
  }
  if (!fs.existsSync(PREV_DIST_DIR)) {
    return { success: false, message: 'No previous build snapshot available to roll back to.' };
  }

  const tempDir = `${env.PUBLIC_DIST_DIR}.swap`;
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  if (fs.existsSync(env.PUBLIC_DIST_DIR)) {
    safeMoveDir(env.PUBLIC_DIST_DIR, tempDir);
  }
  safeMoveDir(PREV_DIST_DIR, env.PUBLIC_DIST_DIR);
  if (fs.existsSync(tempDir)) {
    safeMoveDir(tempDir, PREV_DIST_DIR);
  }

  const now = new Date();
  await db.insert(publishingJobs).values({
    status: 'rolled_back',
    triggerSource: 'admin-rollback',
    triggeredByUserId: userId,
    summary: 'Rolled back live public static files to previous snapshot.',
    logs: `[${now.toISOString()}] Rolled back ${env.PUBLIC_DIST_DIR} from ${PREV_DIST_DIR}.`,
    startedAt: now,
    finishedAt: now,
  });

  return { success: true, message: 'Successfully rolled back to previous published snapshot.' };
}

export function canRollback(): boolean {
  return fs.existsSync(PREV_DIST_DIR);
}
