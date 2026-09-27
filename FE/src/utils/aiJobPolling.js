import { readTask, writeTask } from './taskState.js';

export async function trackAiJob(api, key, signature, submit, shouldAbort, onProgress) {
  const saved = readTask(key);
  let jobId = saved && saved.signature === signature ? saved.jobId : null;
  if (!jobId) {
    if (!submit || shouldAbort?.()) return null;
    const response = await submit();
    jobId = response.data.jobId;
    writeTask(key, { signature, jobId });
  }
  try { return await pollAiJob(api, jobId, shouldAbort, onProgress); }
  catch (error) {
    if ([401, 403, 404].includes(error.response?.status)) writeTask(key, null);
    throw error;
  }
}

export async function getWithRetry(api, url, shouldAbort, config) {
  for (let attempt = 0; ; attempt += 1) {
    if (shouldAbort?.()) return null;
    try {
      const response = await api.get(url, config);
      return shouldAbort?.() ? null : response;
    } catch (error) {
      if (shouldAbort?.()) return null;
      const status = error.response?.status;
      if (attempt >= 4 || (status && status !== 429 && status < 500)) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(1500 * (attempt + 1), 6000)));
    }
  }
}

export async function pollAiJob(api, jobId, shouldAbort, onProgress) {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const response = await getWithRetry(api, `/api/jobs/${jobId}`, shouldAbort);
    if (!response) return null;
    const job = response.data;
    onProgress?.({
      current: Math.max(0, Number(job.progressCurrent) || 0),
      total: Math.max(0, Number(job.progressTotal) || 0),
    }, job);
    if (job.status === 'SUCCESS' || (job.status === 'FAILED'
      && job.kind === 'SECTION_CITATION_REVIEW' && job.result?.complete === false)) return job;
    if (job.status === 'FAILED') {
      const error = new Error(job.errorMessage || 'AI evaluation failed');
      error.status = Number(job.errorMessage?.match(/(\d{3})/)?.[1]) || undefined;
      error.job = job;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  const error = new Error('AI evaluation timed out');
  error.status = 503;
  throw error;
}
