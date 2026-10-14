import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function registerOnboarding(context:vscode.ExtensionContext){
 let panel:vscode.WebviewPanel|undefined;
 async function practiceRoot(){
   for(const root of vscode.workspace.workspaceFolders??[]){
     if(root.uri.scheme!=='file')continue;
     try{const marker=JSON.parse(await fs.readFile(path.join(root.uri.fsPath,'.zhima-practice.json'),'utf8'));if(marker.kind==='zhima-beginner-practice')return root;}catch{}
   }
 }
 async function initialStep(){
   if(!context.workspaceState.get('guidePracticeDetected03')&&await practiceRoot()){
     if(context.workspaceState.get<number>('guideStep',0)===0)await context.workspaceState.update('guideStep',1);
     await context.workspaceState.update('guidePracticeDetected03',true);
   }
   return context.workspaceState.get<number>('guideStep',0);
 }
 async function start(){
   await initialStep();
   if(panel){panel.reveal();return;}
   panel=vscode.window.createWebviewPanel('zhima.start','知码 · 从这里开始',vscode.ViewColumn.One,{enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]});
   const active=panel;
   const asset=(name:string)=>active.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media',name)).toString();
   const nonce=randomUUID().replace(/-/g,'');
   active.webview.html=(await fs.readFile(path.join(context.extensionPath,'media','start.html'),'utf8')).replaceAll('{{CSP}}',active.webview.cspSource).replaceAll('{{NONCE}}',nonce).replaceAll('{{CSS}}',asset('start.css')).replaceAll('{{JS}}',asset('start.js'));
   active.onDidDispose(()=>{panel=undefined},undefined,context.subscriptions);
   active.webview.onDidReceiveMessage(async(message:unknown)=>{
    const msg=message as {action?:string;step?:number};if(!msg||typeof msg.action!=='string')return;
    const commands:Record<string,string>={practice:'zhima.openPractice',terms:'zhima.terms',note:'zhima.guidedNote',file:'zhima.practiceFile',fix:'zhima.practiceFix',folder:'workbench.action.files.openFolder'};
    try{
      if(msg.action==='ready'){await active.webview.postMessage({kind:'state',step:await initialStep()});return;}
      if(msg.action==='step'&&typeof msg.step==='number'&&Number.isInteger(msg.step)&&msg.step>=0&&msg.step<=3){await context.workspaceState.update('guideStep',msg.step);return;}
      if(msg.action==='help'){const doc=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(context.extensionUri,'docs','新手从这里开始.md'));await vscode.commands.executeCommand('markdown.showPreview',doc.uri);return;}
      const command=commands[msg.action];if(command)await vscode.commands.executeCommand(command);
    }catch(error){await active.webview.postMessage({kind:'error',text:`这一步没能完成：${String(error)}。可以点击“不会操作，查看图文步骤”。`});}
   },undefined,context.subscriptions);
 }
 async function openPractice(){
  const parent=await vscode.window.showOpenDialog({title:'选择练习放在哪里（例如桌面）。知码会新建一个文件夹，不改动已有文件。',canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'把练习放在这里'});if(!parent?.[0])return;
  if(parent[0].scheme!=='file')throw new Error('请选择电脑上的文件夹。');
  const target=path.join(parent[0].fsPath,`知码练习-${new Date().toISOString().slice(0,10)}-${randomUUID().slice(0,6)}`);
  await fs.cp(path.join(context.extensionPath,'examples'),target,{recursive:true,errorOnExist:true,force:false});
  await context.globalState.update('practiceRoot',target);await context.globalState.update('pendingGuide',true);
  await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(target),true);
 }
 async function practiceFile(relative='hello.py'){
   const root=await practiceRoot();
   if(!root){await vscode.window.showInformationMessage('请先点“创建我的练习”。练习会在另一个 VS Code 窗口打开。');return;}
   const uri=vscode.Uri.joinPath(root.uri,relative);const realRoot=await fs.realpath(root.uri.fsPath);const realFile=await fs.realpath(uri.fsPath);const rel=path.relative(realRoot,realFile);if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('练习文件指向了练习文件夹以外的位置，请重新创建练习。');
   const doc=await vscode.workspace.openTextDocument(uri);return vscode.window.showTextDocument(doc,{viewColumn:vscode.ViewColumn.Beside,preview:false});
 }
 const command=(id:string,fn:()=>unknown)=>context.subscriptions.push(vscode.commands.registerCommand(id,async()=>{try{return await fn()}catch(e){await vscode.window.showErrorMessage(`知码：这一步没能完成。${String(e)}`)}}));
 command('zhima.start',start);command('zhima.openPractice',openPractice);command('zhima.practiceFile',()=>practiceFile());
 command('zhima.guidedNote',async()=>{const editor=await practiceFile();if(!editor)return;const doc=editor.document;const text=doc.getText();const start=text.indexOf('def greet');const end=text.indexOf('\n\n',start);if(start>=0){const range=new vscode.Range(doc.positionAt(start),doc.positionAt(end<0?text.length:end));editor.selection=new vscode.Selection(range.start,range.end);}await vscode.commands.executeCommand('zhima.annotate');});
 command('zhima.practiceFix',async()=>{const editor=await practiceFile('practice/missing_colon.py');if(editor)await vscode.commands.executeCommand('zhima.previewFix',editor.document.uri);});
 context.subscriptions.push({dispose:()=>panel?.dispose()});
 if(context.extensionMode!==vscode.ExtensionMode.Test&&context.globalState.get('pendingGuide')){
   void (async()=>{const practice=context.globalState.get<string>('practiceRoot');if(context.globalState.get('pendingGuide')&&vscode.workspace.workspaceFolders?.some(r=>r.uri.fsPath===practice))await context.workspaceState.update('guideStep',1);await context.globalState.update('onboardingSeen02',true);await context.globalState.update('pendingGuide',false);await start()})().catch(e=>vscode.window.showErrorMessage(`知码入门页未能打开：${String(e)}`));
 }
 return {start,initialStep};
}
