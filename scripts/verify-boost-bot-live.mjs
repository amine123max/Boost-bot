// Real gateway/browser probe; never sends an inference request or model credentials.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const base = args.find(arg => arg.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:3005';
const output = resolve(args.find(arg => arg.startsWith('--output='))?.slice(9) || resolve(root,'tmp/boost-bot-live'));
mkdirSync(output,{recursive:true});
const require = createRequire(resolve(root,'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:args.includes('--reduced-motion')?'reduce':'no-preference'});
  if(args.includes('--still')) await page.addInitScript(()=>{
    let value={}; try{value=JSON.parse(localStorage.getItem('boost.bot.appearance.v1')||'{}')}catch{}
    localStorage.setItem('boost.bot.appearance.v1',JSON.stringify({...value,version:1,animation:'still'}));
  });
  const keyCount=async()=>{
    const response=await page.request.post(base+'/api/rpc',{data:{jsonrpc:'2.0',id:1,method:'apikey/list',params:{}}});
    const payload=await response.json();
    return payload.result?.items?.length;
  };
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('response', response=>{ if(response.status()>=400 && /\/boost-bot\//.test(response.url())) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto(base+'/');
  await expect(page.getByRole('link',{name:'Boost 智能体',exact:true})).toBeVisible();
  await expect(page.locator('.boost-startup')).toHaveCount(0,{timeout:30000});
  const navigationAvatar = page.locator('.brand [data-boost-bot-avatar]');
  const activePreference = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('boost.bot.appearance.v1') || '{}').animation || 'auto'; } catch { return 'auto'; }
  });
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const expectedNavigationMotion = activePreference === 'still' || reduced ? 'gentle' : 'animated';
  await expect(navigationAvatar).toHaveAttribute('data-bot-motion',expectedNavigationMotion);
  const navFrame = await navigationAvatar.locator('[data-body]').getAttribute('d');
  await expect.poll(()=>navigationAvatar.locator('[data-body]').getAttribute('d')).not.toBe(navFrame);
  const existingKeyCount=await keyCount();
  if (args.includes('--light')) {
    await page.getByRole('link',{name:'设置',exact:true}).click();
    await page.getByRole('button',{name:'浅色',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('boost.theme.v1'))).toBe('light');
  }
  const theme=await page.locator('html').getAttribute('data-theme');
  const box=await page.locator('.brand svg').boundingBox();
  await page.getByRole('link',{name:'Boost 智能体',exact:true}).click();
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-origin','avatar');
  const bot=page.frameLocator('iframe[title="Boost Bot"]');
  await expect(bot.locator('.side')).toBeVisible({timeout:60000});
  await expect(bot.locator('textarea').first()).toBeVisible({timeout:30000});
  if (await bot.getByRole('button',{name:'返回 Boost 首页',exact:true}).count()) {
    const botBrand = bot.locator('.boost-brand-return [data-boost-bot-avatar]');
    const brandMotion = activePreference === 'still' || reduced ? 'gentle' : 'animated';
    await expect(botBrand).toHaveAttribute('data-bot-motion',brandMotion);
    const initialBrandFrame=await botBrand.locator('[data-body]').getAttribute('d');
    await expect.poll(()=>botBrand.locator('[data-body]').getAttribute('d')).not.toBe(initialBrandFrame);
  }
  if (await bot.getByRole('button',{name:'返回 Boost 首页',exact:true}).count()) {
    const botBrand = bot.locator('.boost-brand-return [data-boost-bot-avatar]');
    const brandMotion = activePreference === 'still' || reduced ? 'gentle' : 'animated';
    await expect(botBrand).toHaveAttribute('data-bot-motion',brandMotion);
    const initialBrandFrame=await botBrand.locator('[data-body]').getAttribute('d');
    await expect.poll(()=>botBrand.locator('[data-body]').getAttribute('d')).not.toBe(initialBrandFrame);
  }
  const animation=await page.locator('[data-bot-surface]').evaluate(el=>{
    const a=el.getAnimations()[0];
    return {duration:a?.effect?.getComputedTiming().duration,frames:a?.effect?.getKeyframes()};
  });
  if(animation.duration !== undefined) {
    assert.equal(animation.duration,reduced?180:1050);
    assert(animation.frames[0].clipPath.includes(`${box.x+box.width/2}px`));
  } else assert.equal(await page.locator('[data-bot-workspace]').getAttribute('data-bot-revealing'),'false');
  await page.screenshot({path:resolve(output,'bot-expanding.png')});
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-revealing','false');
  await page.screenshot({path:resolve(output,'bot-ready.png')});
  assert(await bot.locator('.bot-face').count()>0,'Original Bot avatars must be retained');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-origin','center');
  await expect(bot.locator('.side')).toBeVisible({timeout:60000});
  const refresh=await page.locator('[data-bot-surface]').evaluate(el=>el.getAnimations()[0]?.effect?.getKeyframes()[0].clipPath);
  if (refresh) assert(refresh.includes('640px 450px'),refresh);
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-revealing','false');
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('.bot-workspace-bar')).toHaveCount(0);
  const brand=await bot.getByRole('button',{name:'返回 Boost 首页',exact:true}).boundingBox();
  assert(brand.x<280,'Boost brand must be in the original left sidebar');
  const botBrand = bot.locator('.boost-brand-return [data-boost-bot-avatar]');
  const botFrame = await botBrand.locator('[data-body]').getAttribute('d');
  await expect.poll(()=>botBrand.locator('[data-body]').getAttribute('d')).not.toBe(botFrame);
  const viewport=await page.locator('iframe').boundingBox();
  assert.equal(viewport.y,0); assert.equal(viewport.height,900);
  const instances=await bot.locator('.catalog-thread .snip').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,full:el.scrollHeight<=el.clientHeight+1,whiteSpace:getComputedStyle(el).whiteSpace})));
  assert(instances.length>0,'Bundled bot instances must be visible');
  assert(instances.every(instance=>instance.full && instance.whiteSpace==='normal'),'Instance summaries must be fully visible');
  await bot.getByRole('button',{name:'返回 Boost 首页',exact:true}).click();
  await expect(page).toHaveURL(base+'/');
  assert.deepEqual(errors,[]);
  assert.equal(await keyCount(),existingKeyCount,'Opening and refreshing Bot must not create API keys');
  console.log(JSON.stringify({liveGateway:base,originalSidebar:true,leftBrandReturnsHome:true,noExtraTopbar:true,fullInstanceSummaries:true,originalBotAvatars:true,clickRevealMs:animation.duration,refreshOrigin:'viewport center',themePreserved:theme,existingKeysOnly:true,browserErrors:errors.length}));
} finally {await browser.close();}
