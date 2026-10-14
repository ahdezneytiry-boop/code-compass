const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});try{
 const page=await browser.newPage({viewport:{width:1050,height:920}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const html=fs.readFileSync('media/start.html','utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/,'').replace('<link rel="stylesheet" href="{{CSS}}">','<style>'+fs.readFileSync('media/start.css','utf8')+'</style>').replace(/<script nonce="\{\{NONCE\}\}" src="\{\{JS\}\}"><\/script>/,'');
 await page.setContent(html);await page.evaluate(()=>{window.messages=[];window.acquireVsCodeApi=()=>({getState:()=>undefined,setState:s=>window.saved=s,postMessage:m=>window.messages.push(m)})});await page.addScriptTag({content:fs.readFileSync('media/start.js','utf8')});
 await page.getByRole('button',{name:'创建我的练习',exact:true}).click();assert.equal(await page.evaluate(()=>window.messages.at(-1).action),'practice');
 await page.getByRole('button',{name:'我完成了，下一步 →'}).click();assert.ok((await page.locator('#heading').textContent()).includes('问候'));await page.locator('#mainAction').click();assert.equal(await page.evaluate(()=>window.messages.at(-1).action),'file');
 await page.getByRole('button',{name:'3 写下理解',exact:true}).click();await page.locator('#mainAction').click();assert.equal(await page.evaluate(()=>window.messages.at(-1).action),'note');
 await page.getByRole('button',{name:'4 试着改错',exact:true}).click();await page.locator('#mainAction').click();assert.equal(await page.evaluate(()=>window.messages.at(-1).action),'fix');
 await page.evaluate(()=>window.postMessage({kind:'error',text:'测试错误提示'},'*'));await page.waitForFunction(()=>document.getElementById('error').textContent==='测试错误提示');
 await page.getByRole('button',{name:'2 读懂一句',exact:true}).click();fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/onboarding-desktop.png',fullPage:true});
 for(const width of [320,650,1050]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`overflow at ${width}`);}
 await page.setViewportSize({width:320,height:900});await page.screenshot({path:'test-results/onboarding-mobile.png',fullPage:true});
 await page.goto('file:///'+path.resolve('guide-output/常见词白话表.html').replaceAll('\\','/'));await page.locator('#search').fill('workspace');assert.ok((await page.locator('#count').textContent()).includes('1'));assert.equal(await page.locator('details:visible').count(),1);
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/ui.json',JSON.stringify({passed:true,checks:['四个主要按钮发送正确动作','步骤切换与错误文字','320/650/1050 无横向溢出','离线词表可检索'],note:'使用 Webview bridge stub 检查前端；宿主动作另由集成测试验证'},null,2));console.log('UI checks passed');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
