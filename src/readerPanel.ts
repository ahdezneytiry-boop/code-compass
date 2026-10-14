import * as vscode from 'vscode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectReader, ReadingProject, readingLanguage } from './projectReader';
import { scanProject } from './projectReader';

export function registerReader(context:vscode.ExtensionContext){
 let panel:vscode.WebviewPanel|undefined;let reader:ProjectReader|undefined;let initializing:Promise<void>|undefined;
 let project:ReadingProject|undefined;let root:vscode.WorkspaceFolder|undefined;let generation=0;let timer:ReturnType<typeof setTimeout>|undefined;
 const readKey=(file:string,hash:string,chapter:string)=>`${root?.uri.toString()}|${file}|${hash}|${chapter}`;
 let completed=new Set(context.workspaceState.get<string[]>('readerCompleted04',[]));
 async function init(){if(!initializing){reader=new ProjectReader();initializing=reader.init(path.join(context.extensionPath,'dist'));}await initializing;}
 async function send(message:unknown){await panel?.webview.postMessage(message);}
 async function refresh(){
   const mine=++generation;if(!panel)return;
   const folders=(vscode.workspace.workspaceFolders??[]).filter(f=>f.uri.scheme==='file');
   if(!root||!folders.some(f=>f.uri.toString()===root!.uri.toString()))root=folders[0];
   if(!root){project=undefined;await send({kind:'empty'});return;}
   await send({kind:'loading',name:root.name});
   try{await init();const result=await scanProject(root.uri.fsPath,reader!,{ignore:vscode.workspace.getConfiguration('zhima').get<string[]>('ignoreDirectories',[]),cancelled:()=>mine!==generation});if(mine!==generation)return;project=result;await send({kind:'project',project,completed:project.files.flatMap(f=>f.chapters.filter(c=>completed.has(readKey(f.path,f.hash,c.id))).map(c=>`${f.path}|${c.id}`))});}
   catch(error){if(mine===generation)await send({kind:'error',message:`没能整理这个项目：${error instanceof Error?error.message:String(error)}`});}
 }
 async function openFile(fileId:unknown,chapterId:unknown){
   const file=project?.files.find(f=>f.path===fileId),chapter=file?.chapters.find(c=>c.id===chapterId);
   if(!file||!chapter||!root)throw new Error('这段内容已变化，请重新整理项目。');
   const uri=vscode.Uri.joinPath(root.uri,...file.path.split('/'));const actual=await fs.realpath(uri.fsPath);const rel=path.relative(await fs.realpath(root.uri.fsPath),actual);
   if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('这个文件指向项目以外的位置，已停止打开。');
   const doc=await vscode.workspace.openTextDocument(uri);const line=Math.min(chapter.start,doc.lineCount-1);
   await vscode.window.showTextDocument(doc,{viewColumn:vscode.ViewColumn.Beside,selection:new vscode.Range(line,0,Math.min(chapter.end,doc.lineCount-1),doc.lineAt(Math.min(chapter.end,doc.lineCount-1)).text.length),preview:true});
 }
 async function importFolder(){
   const selected=await vscode.window.showOpenDialog({title:'选择 AI 生成代码所在的整个文件夹',openLabel:'用知码阅读这个项目',canSelectFolders:true,canSelectFiles:false,canSelectMany:false});
   if(!selected?.[0])return;if(selected[0].scheme!=='file')throw new Error('请选择这台电脑上的项目文件夹。');
   const existing=vscode.workspace.workspaceFolders?.find(f=>f.uri.toString()===selected[0].toString());
   if(existing){root=existing;await refresh();return;}
   await context.globalState.update('readerPendingRoot04',selected[0].toString());
   await vscode.commands.executeCommand('vscode.openFolder',selected[0],true);
 }
 async function open(){
   if(panel){panel.reveal();return;}
   panel=vscode.window.createWebviewPanel('zhima.reader','知码 · 读懂 AI 代码',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]});
   const active=panel;const asset=(file:string)=>active.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media',file)).toString();
   active.webview.html=(await fs.readFile(path.join(context.extensionPath,'media','reader.html'),'utf8')).replaceAll('{{CSP}}',active.webview.cspSource).replaceAll('{{NONCE}}',randomUUID().replaceAll('-','')).replaceAll('{{CSS}}',asset('reader.css')).replaceAll('{{JS}}',asset('reader.js'));
   active.onDidDispose(()=>{generation++;panel=undefined;project=undefined;if(timer)clearTimeout(timer);},undefined,context.subscriptions);
   active.webview.onDidReceiveMessage(async msg=>{
     if(!msg||typeof msg.action!=='string')return;
     try{
       if(msg.action==='ready'||msg.action==='refresh')await refresh();
       else if(msg.action==='folder')await importFolder();
       else if(msg.action==='chooseRoot'){
         const choice=await vscode.window.showWorkspaceFolderPick({placeHolder:'选择这次要读的项目'});if(choice?.uri.scheme==='file'){root=choice;await refresh();}
       }
       else if(msg.action==='open')await openFile(msg.file,msg.chapter);
       else if(msg.action==='read'){
         const file=project?.files.find(f=>f.path===msg.file);if(!file||file.hash!==msg.hash||!file.chapters.some(c=>c.id===msg.chapter))return;
         completed.add(readKey(file.path,file.hash,msg.chapter));if(completed.size>3000)completed=new Set([...completed].slice(-3000));await context.workspaceState.update('readerCompleted04',[...completed]);
         await send({kind:'read',file:file.path,chapter:msg.chapter});
       }
       else if(msg.action==='ask'){
         const file=project?.files.find(f=>f.path===msg.file),chapter=file?.chapters.find(c=>c.id===msg.chapter);if(!file||!chapter)return;
         await vscode.env.clipboard.writeText(`我刚接触编程，正在阅读 AI 写的项目。请用白话解释下面这段代码：\n1. 这一段在项目中可能做什么？哪些结论可以确定，哪些需要其他文件？\n2. 输入是什么，按什么顺序处理，输出是什么？\n3. 用一个贴近日常的例子讲解，逐个解释必要术语。\n4. 如果要修改，请先说明影响，不要直接重写全部代码。\n\n文件：${file.path}，第 ${chapter.start+1}–${chapter.end+1} 行\n\n${chapter.code}${chapter.clipped?'\n（片段较长，此处已截取）':''}`);
         await send({kind:'notice',message:'问题和这段代码已复制。可以粘贴到你常用的 AI 中继续问。'});
       }
       else if(msg.action==='help')await vscode.commands.executeCommand('markdown.showPreview',vscode.Uri.joinPath(context.extensionUri,'docs','读懂AI代码-从这里开始.md'));
       else if(msg.action==='practice')await vscode.commands.executeCommand('zhima.start');
     }catch(error){await send({kind:'error',message:error instanceof Error?error.message:String(error)});}
   },undefined,context.subscriptions);
 }
 const register=(id:string,fn:()=>unknown)=>context.subscriptions.push(vscode.commands.registerCommand(id,async()=>{try{await fn()}catch(e){await vscode.window.showErrorMessage(`知码：${String(e)}`)}}));
 register('zhima.readProject',open);register('zhima.importProject',async()=>{await open();await importFolder();});
 context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc=>{if(panel&&root&&vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.toString()===root.uri.toString()&&readingLanguage(doc.fileName)){if(timer)clearTimeout(timer);timer=setTimeout(()=>void refresh(),700);}}));
 context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(()=>{if(panel)void refresh()}));
 context.subscriptions.push({dispose(){generation++;if(timer)clearTimeout(timer);panel?.dispose();reader?.dispose();}});
 if(context.extensionMode!==vscode.ExtensionMode.Test){
   const pending=context.globalState.get<string>('readerPendingRoot04');const belongs=pending&&vscode.workspace.workspaceFolders?.some(f=>f.uri.toString()===pending);
   if(!context.globalState.get('readerSeen04')||belongs)void(async()=>{await context.globalState.update('readerSeen04',true);if(belongs)await context.globalState.update('readerPendingRoot04',undefined);await open()})().catch(e=>vscode.window.showErrorMessage(`知码阅读页未能打开：${String(e)}`));
 }
 return {open,refresh,getProject:()=>project};
}
