import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

function rgb(color) {
  return color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
}
function luminance(color) {
  const v = rgb(color).map(x => x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
await page.emulateMedia({ reducedMotion: 'no-preference' });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:12306/', { waitUntil: 'networkidle' });
console.log('REDUCED_MOTION=' + await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
await page.fill('#username', 'qa-admin');
await page.fill('#password', 'qa-only-password');
await page.click('#login-form button[type="submit"]');
await page.waitForSelector('#main-container:not(.d-none)');

await page.evaluate(() => {
  const app = window.mikanarrApp;
  const season = (total, downloaded) => ({ seasonNumber: 1, monitored: true, statistics: { episodeCount: total, episodeFileCount: downloaded, totalEpisodeCount: total, percentOfEpisodes: Math.round(downloaded / total * 100) } });
  const series = title => ({ title, titleSlug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), seasons: [season(24, 20)], images: [] });
  app.seriesLoadError = null;
  app.sonarrHost = 'http://sonarr.local';
  app.seriesList = [series('葬送的芙莉莲'), series('进击的巨人 最终季'), series('Re:Zero S3')];
  const names = ['葬送的芙莉莲','进击的巨人 最终季','mushoku tensei s2','孤独摇滚！','Re:Zero S3','药屋少女的呢喃'];
  app.allPatterns = names.map((name, i) => ({ id:i+1, series:name, season:'01', pattern:'.* - (?<episode>\\d+)(?:\\D.*)?', language:'Chinese', quality:'WEBDL 1080p', offset:0, releasegroup:i%2?'Nyaa':'DMHY 动漫花园', remote:`https://mikanani.me/RSS/Bangumi?bangumiId=${3400+i}`, last_matched_at:new Date(Date.now()-i*3600000).toISOString(), match_count:10+i }));
  app.filteredPatterns = app.allPatterns;
  app.currentView = 'card';
  document.getElementById('pattern-card-view').classList.remove('d-none');
  document.getElementById('pattern-table-view').classList.add('d-none');
  app.renderCurrentView(app.allPatterns);
  app.updatePatternSummary();
});
await page.waitForTimeout(100);
fs.mkdirSync('/tmp/ui-polish-render', { recursive: true });

const listMetrics = await page.evaluate(() => {
  const card = document.querySelector('.pattern-card');
  const actions = Array.from(card.querySelectorAll('.pattern-card-actions .btn')).map(el => {
    const r = el.getBoundingClientRect();
    return { className:el.className, x:r.x, y:r.y, width:r.width, height:r.height };
  });
  const title = card.querySelector('.pattern-card-title').getBoundingClientRect();
  const badgeEl = card.querySelector('.pattern-card-status-badge');
  const badge = badgeEl.getBoundingClientRect();
  const toolbar = ['export-btn','import-btn','new-pattern-btn'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect();
    return {id, y:r.y, height:r.height};
  });
  return { actions, titleCenter:title.y+title.height/2, badgeCenter:badge.y+badge.height/2, badgePosition:getComputedStyle(badgeEl).position, toolbar };
});
console.log('LIST_METRICS=' + JSON.stringify(listMetrics));
assert.ok(listMetrics.actions.length >= 3);
listMetrics.actions.forEach(a => assert.ok(Math.abs(a.width-32)<1 && Math.abs(a.height-32)<1, `${a.className}: ${a.width}x${a.height}`));
assert.ok(listMetrics.actions.every(a => Math.abs(a.y-listMetrics.actions[0].y)<1), 'card actions align');
assert.equal(listMetrics.badgePosition, 'static');
assert.ok(Math.abs(listMetrics.titleCenter-listMetrics.badgeCenter)<4, 'status badge aligns with title');
assert.ok(listMetrics.toolbar.every(a => Math.abs(a.y-listMetrics.toolbar[0].y)<1 && Math.abs(a.height-40)<1), 'toolbar alignment');
await page.screenshot({ path:'/tmp/ui-polish-render/list.png' });

await page.evaluate(() => { const app=window.mikanarrApp; app.currentPatternId=1; app.showPatternEdit(app.allPatterns[0]); });
await page.waitForTimeout(70);
const mid = await page.locator('#pattern-edit').boundingBox();
await page.waitForTimeout(220);
const end = await page.locator('#pattern-edit').boundingBox();
console.log(`DRAWER_POSITIONS=mid:${mid.x},end:${end.x}`);
assert.ok(mid.x > end.x + 20, `drawer animation must be perceptible: mid=${mid.x} end=${end.x}`);

const drawerMetrics = await page.evaluate(() => {
  const field=document.getElementById('pattern');
  const fs=getComputedStyle(field);
  const drawer=getComputedStyle(document.getElementById('pattern-edit'));
  return { tabs:Array.from(document.querySelectorAll('.ui-editor-tab'),e=>e.textContent.trim()), bg:fs.backgroundColor, text:fs.color, border:fs.borderTopColor, placeholder:getComputedStyle(field,'::placeholder').color, transition:drawer.transitionDuration, columns:getComputedStyle(document.getElementById('pattern-card-view')).gridTemplateColumns.split(' ').filter(Boolean).length };
});
console.log('DRAWER_METRICS=' + JSON.stringify(drawerMetrics));
assert.deepEqual(drawerMetrics.tabs,['订阅设置','匹配规则']);
assert.equal(drawerMetrics.columns,2);
assert.notEqual(drawerMetrics.transition,'0s');
assert.ok(contrast(drawerMetrics.text, drawerMetrics.bg) >= 4.5, `field text contrast ${contrast(drawerMetrics.text,drawerMetrics.bg)}`);
assert.ok(contrast(drawerMetrics.border, drawerMetrics.bg) >= 1.35, `field border contrast ${contrast(drawerMetrics.border,drawerMetrics.bg)}`);
assert.ok(contrast(drawerMetrics.placeholder, drawerMetrics.bg) >= 3, `placeholder contrast ${contrast(drawerMetrics.placeholder,drawerMetrics.bg)}`);
await page.screenshot({ path:'/tmp/ui-polish-render/drawer.png' });

await page.evaluate(() => window.mikanarrApp.showPatternList());
await page.waitForTimeout(70);
assert.equal(await page.locator('#pattern-edit').evaluate(el=>el.classList.contains('d-none')), false, 'drawer remains mounted while closing');
await page.waitForTimeout(200);
assert.equal(await page.locator('#pattern-edit').evaluate(el=>el.classList.contains('d-none')), true);

await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(100);
await page.screenshot({ path:'/tmp/ui-polish-render/mobile.png' });
fs.writeFileSync('/tmp/ui-polish-render/metrics.json', JSON.stringify({listMetrics,drawerMetrics,errors},null,2));
assert.equal(errors.length,0,errors.join(' | '));
await browser.close();
