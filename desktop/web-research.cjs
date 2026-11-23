'use strict';

// Internet research gateway: searches can ONLY happen when the user enables
// them in Settings. Screen captures, memory notes and chat history are never
// sent to these search providers. No arbitrary page fetching or actions.
const crypto = require('node:crypto');

function cleanSearchQuery(input) {
  if (typeof input !== 'string') return '';
  const text = input.trim().replace(/\s+/g, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email omitted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/gi, '[token omitted]')
    .replace(/\b\d{10,}\b/g, '[number omitted]');
  return text.slice(0, 140).replace(/[<>\r\n]/g, '');
}
function safeSource(result) {
  if (!result || typeof result !== 'object') return null;
  let url;
  try {
    url = new URL(String(result.url || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))
      return null;
  } catch { return null; }
  const title = String(result.title || '').replace(/[\x00-\x1f]+/g, ' ').trim().slice(0, 140);
  const snippet = String(result.snippet || '').replace(/[\x00-\x1f]+/g, ' ').trim().slice(0, 700);
  if (!title) return null;
  return { title, url: url.href, snippet };
}
function explicitResearchQuery(question) {
  const value = String(question || '').trim();
  if (!value) return '';
  if (/\b(search|look up|google|browse|research|find online|internet|sources|verify online|latest|up.to.date|current price|today.s news)\b/i.test(value))
    return cleanSearchQuery(value);
  if (/\b(how (do|can) i craft|where do i find|quest walkthrough|patch notes|what version|price of|released when)\b/i.test(value))
    return cleanSearchQuery(value);
  return '';
}
function shouldConsiderAutoresearch(question) {
  return /\b(fix|error|bug|update|game|quest|recipe|boss|craft|comparison|price|product|software|version|latest|source|check|how do|why does|find|available)\b/i.test(question);
}
async function readJsonLimited(response, max = 280000) {
  if (!response.ok) throw new Error('Search provider returned HTTP ' + response.status);
  const text = await response.text();
  if (text.length > max) throw new Error('Search provider response exceeded size limit');
  return JSON.parse(text);
}

class MyaWebResearch {
  constructor(fetchImpl = fetch) {
    this.fetchImpl = fetchImpl;
    this.recent = [];
    this.cache = new Map();
    this.limitPerHour = 12;
  }
  async search(rawQuery, { enabled = false, provider = 'wikipedia', braveKey = '' } = {}) {
    if (!enabled) return { searched: false, reason: 'Internet research disabled', sources: [] };
    const query = cleanSearchQuery(rawQuery);
    if (!query || query.includes('[token omitted]') || query.includes('[email omitted]') ||
        query.includes('[number omitted]'))
      return { searched: false, reason: 'Search query was empty or contained private data', sources: [] };
    if (!['wikipedia','brave'].includes(provider))
      return { searched: false, reason: 'Unknown research provider', sources: [] };
    if (provider === 'brave' && (!braveKey || braveKey.length > 256))
      return { searched: false, reason: 'Brave Search API key is not configured', sources: [] };

    const now = Date.now();
    this.recent = this.recent.filter(t => now - t < 3600000);
    const cacheKey = crypto.createHash('sha256').update(provider + ':' + query).digest('hex');
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.at < 300000)
      return { ...cached.value, fromCache: true };
    if (this.recent.length >= this.limitPerHour)
      return { searched: false, reason: 'Hourly search limit reached (12 per hour)', sources: [] };
    this.recent.push(now);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      let raw = [];
      if (provider === 'brave') {
        const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
        endpoint.searchParams.set('q', query);
        endpoint.searchParams.set('count', '5');
        const response = await this.fetchImpl(endpoint, {
          headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
          signal: controller.signal,
          redirect: 'error'
        });
        const data = await readJsonLimited(response);
        raw = (data.web?.results || []).slice(0, 5).map(item => ({
          title: item.title, url: item.url, snippet: item.description
        }));
      } else {
        const endpoint = new URL('https://en.wikipedia.org/w/api.php');
        endpoint.searchParams.set('action', 'query');
        endpoint.searchParams.set('generator', 'search');
        endpoint.searchParams.set('gsrsearch', query);
        endpoint.searchParams.set('gsrlimit', '5');
        endpoint.searchParams.set('prop', 'extracts');
        endpoint.searchParams.set('exintro', '1');
        endpoint.searchParams.set('explaintext', '1');
        endpoint.searchParams.set('exsentences', '2');
        endpoint.searchParams.set('format', 'json');
        const response = await this.fetchImpl(endpoint, {
          headers: { 'User-Agent': 'MyaRelayDesktop/0.1 (local user research tool)' },
          signal: controller.signal,
          redirect: 'error'
        });
        const data = await readJsonLimited(response);
        raw = Object.values(data.query?.pages || {}).slice(0, 5).map(page => ({
          title: page.title,
          url: 'https://en.wikipedia.org/?curid=' + encodeURIComponent(page.pageid),
          snippet: page.extract || 'Wikipedia article'
        }));
      }
      const sources = raw.map(safeSource).filter(Boolean);
      const value = { searched: true, provider, query, sources };
      this.cache.set(cacheKey, { at: now, value });
      if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
      return value;
    } catch (error) {
      return { searched: false, reason: 'Search failed: ' + String(error.message || error).slice(0, 120), sources: [] };
    } finally { clearTimeout(timer); }
  }
}
module.exports = {
  MyaWebResearch, cleanSearchQuery, safeSource,
  explicitResearchQuery, shouldConsiderAutoresearch
};
