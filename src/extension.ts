import * as vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Analyzer, Analysis, Note, NoteStore, NoteConflictError, Layer, layers, hash, relocate, translateError, safeFixes, SafeFix } from './core';
import { terms, findTerm, Term } from './terms';
import { registerOnboarding } from './onboarding';
import { registerBackupCommands } from './backupCommands';
import { registerReader } from './readerPanel';

class Row extends vscode.TreeItem {
  children?: Row[]; note?:Note; uri?:vscode.Uri;
  constructor(label:string,description?:string,icon?:string){super(label);this.description=description;if(icon)this.iconPath=new vscode.ThemeIcon(icon);}
}
class View implements vscode.TreeDataProvider<Row> {
  private changed=new vscode.EventEmitter<Row|undefined>();onDidChangeTreeData=this.changed.event;
  constructor(public rows:()=>Row[]|Promise<Row[]>){ }
  getTreeItem(row:Row){return row;}
  getChildren(row?:Row){return row?.children??this.rows();}
  refresh(){this.changed.fire(undefined);}
  dispose(){this.changed.dispose();}
}
const config=()=>vscode.workspace.getConfiguration('zhima');
const enabled=()=>config().get<boolean>('enabled',true);
const selector:vscode.DocumentSelector=[{language:'python',scheme:'file'},{language:'html',scheme:'file'}];
const esc=(text:string)=>{const md=new vscode.MarkdownString();md.appendText(text);return md;};
function termMarkdown(term:Term){const md=new vscode.MarkdownString();md.appendText(`${term.title} · ${term.key}\n\n用简单的话说：${term.definition}\n\n看一个例子：\n`);md.appendCodeblock(term.example,term.languages[0]==='python'?'python':'html');md.appendText(`\n还可以了解：${term.related.map(key=>findTerm(key,term.languages[0])?.title??key).join('、')}\n这是一条词典解释，具体含义要结合所在代码。`);return md;}
function jumpRow(label:string,uri:vscode.Uri,line:number,detail?:string,icon='symbol-event'){const row=new Row(label,`第 ${line+1} 行`,icon);row.tooltip=esc(detail??label);row.command={command:'zhima.open',title:'定位代码',arguments:[uri,line]};return row;}

export async function activate(context:vscode.ExtensionContext){
  const output=vscode.window.createOutputChannel('知码');context.subscriptions.push(output);
  const analyzer=new Analyzer();
  const storageDir=context.storageUri?.fsPath??path.join(context.globalStorageUri.fsPath,'no-workspace');
  const store=new NoteStore(path.join(storageDir,'notes.sqlite'),path.join(context.extensionPath,'dist'));
  try {await Promise.all([analyzer.init(path.join(context.extensionPath,'dist')),store.init()]);}
  catch(error){output.appendLine(String(error));vscode.window.showErrorMessage(`知码初始化失败：${String(error)}`);throw error;}
  context.subscriptions.push({dispose:()=>analyzer.dispose()});
  const syntax=vscode.languages.createDiagnosticCollection('知码语法');
  const healthDiagnostics=vscode.languages.createDiagnosticCollection('知码健康');
  context.subscriptions.push(syntax,healthDiagnostics);
  let current:vscode.TextDocument|undefined=vscode.window.activeTextEditor?.document;
  let analysis:Analysis|undefined;let notice='打开 Python 或 HTML 文件，开始阅读。';
  const analyses=new Map<string,{version:number;data:Analysis}>();
  const externalErrors=new Map<string,vscode.Diagnostic[]>();
  const timers=new Map<string,ReturnType<typeof setTimeout>>();
  const previews=new Map<string,string>();
  let pendingFix:{uri:vscode.Uri;version:number;original:string;fixes:SafeFix[]}|undefined;
  const regionTypes=new Map<Layer,vscode.TextEditorDecorationType>();
  const noteType=vscode.window.createTextEditorDecorationType({isWholeLine:true,gutterIconPath:vscode.Uri.joinPath(context.extensionUri,'media','note.svg'),gutterIconSize:'contain'});
  context.subscriptions.push(noteType);
  const bannerType=vscode.window.createTextEditorDecorationType({after:{margin:'0 0 0 3em',color:new vscode.ThemeColor('descriptionForeground'),fontStyle:'italic'}});context.subscriptions.push(bannerType);
  function resetRegionTypes(){for(const type of regionTypes.values())type.dispose();regionTypes.clear();for(const [layer,meta] of Object.entries(layers))regionTypes.set(layer as Layer,vscode.window.createTextEditorDecorationType({isWholeLine:true,borderWidth:'0 0 0 2px',borderStyle:'solid',borderColor:meta.color,backgroundColor:config().get('regionBackground',true)?meta.color+'10':undefined,overviewRulerColor:meta.color+'88',overviewRulerLane:vscode.OverviewRulerLane.Left}));}
  resetRegionTypes();context.subscriptions.push({dispose:()=>{for(const type of regionTypes.values())type.dispose();for(const t of timers.values())clearTimeout(t);}});
  function isAllowedUri(uri:vscode.Uri):boolean{
    if(uri.scheme!=='file'||!['.py','.html'].includes(path.extname(uri.fsPath).toLowerCase()))return false;
    const root=vscode.workspace.getWorkspaceFolder(uri);if(!root)return false;
    const relative=path.relative(root.uri.fsPath,uri.fsPath);
    if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))return false;
    const ignored=config().get<string[]>('ignoreDirectories',[]);
    if(relative.split(/[\\/]/).some(part=>ignored.includes(part)))return false;
    try{const realRelative=path.relative(fs.realpathSync(root.uri.fsPath),fs.realpathSync(uri.fsPath));return realRelative!== '..'&&!realRelative.startsWith('..'+path.sep)&&!path.isAbsolute(realRelative);}catch{return false;}
  }
  function eligible(doc:vscode.TextDocument){return isAllowedUri(doc.uri)&&['python','html'].includes(doc.languageId)&&Buffer.byteLength(doc.getText(),'utf8')<=config().get<number>('maxFileKB',1024)*1024;}
  const views:View[]=[];
  function registerView(id:string,rows:()=>Row[]|Promise<Row[]>){const view=new View(rows);views.push(view);context.subscriptions.push(view,vscode.window.registerTreeDataProvider(id,view));return view;}
  const overview=registerView('zhima.overview',()=>{
    const start=new Row('读懂 AI 写的项目', '全貌 → 文件 → 一小段', 'book');start.command={command:'zhima.readProject',title:'打开项目阅读室'};
    const rows=[start,new Row(enabled()?'学习提示已开启':'学习提示已暂停','在你的电脑上处理','book')];
    if(current&&analysis){rows.push(new Row(path.basename(current.fileName),undefined,'file-code'));const summary=new Row(analysis.summary);summary.tooltip=esc(analysis.summary);rows.push(summary);}else rows.push(new Row(notice));
    const legend=new Row('这些颜色是什么意思？','每种颜色代表一种工作','symbol-color');legend.collapsibleState=vscode.TreeItemCollapsibleState.Collapsed;legend.children=Object.entries(layers).map(([,meta])=>{const row=new Row(meta.title,meta.description,'circle-filled');row.tooltip=esc(`${meta.description}。颜色表示这段代码可能在做什么，不评价好坏。`);return row});rows.push(legend);
    rows.push(new Row('遇到不懂的词','把鼠标放在词上，稍等片刻','lightbulb'));
    return rows;
  });
  class Files implements vscode.TreeDataProvider<Row>{
    private event=new vscode.EventEmitter<Row|undefined>();onDidChangeTreeData=this.event.event;
    getTreeItem(row:Row){return row;}
    async getChildren(row?:Row):Promise<Row[]>{
      if(!row)return (vscode.workspace.workspaceFolders??[]).map(root=>{const item=new Row(root.name,undefined,'root-folder');item.uri=root.uri;item.collapsibleState=vscode.TreeItemCollapsibleState.Expanded;return item;});
      if(!row.uri)return [];
      try{
        const entries=await vscode.workspace.fs.readDirectory(row.uri);const ignored=config().get<string[]>('ignoreDirectories',[]);
        return entries.filter(([name,type])=>!(type&vscode.FileType.SymbolicLink)&&!ignored.includes(name)&&((type&vscode.FileType.Directory)||/\.(py|html)$/i.test(name))).sort((a,b)=>Number(Boolean(b[1]&vscode.FileType.Directory))-Number(Boolean(a[1]&vscode.FileType.Directory))||a[0].localeCompare(b[0])).map(([name,type])=>{const uri=vscode.Uri.joinPath(row.uri!,name);const directory=Boolean(type&vscode.FileType.Directory);const item=new Row(name,directory?undefined:name.endsWith('.py')?'Python':'HTML',directory?'folder':'file-code');item.uri=uri;item.resourceUri=uri;if(directory)item.collapsibleState=vscode.TreeItemCollapsibleState.Collapsed;else item.command={command:'zhima.open',title:'打开文件',arguments:[uri,0]};return item;});
      }catch{return [new Row('目录暂时无法读取')];}
    }
    refresh(){this.event.fire(undefined)}dispose(){this.event.dispose()}
  }
  const files=new Files();context.subscriptions.push(files,vscode.window.registerTreeDataProvider('zhima.files',files));
  function notesForDocument(doc:vscode.TextDocument){return store.list(doc.uri.toString()).map(note=>relocate(note,doc.getText()));}
  const notesView=registerView('zhima.notes',()=>{
    const notes=store.list();if(!notes.length)return [new Row('还没有笔记','选中代码后右键添加','comment')];
    return notes.map(saved=>{const doc=vscode.workspace.textDocuments.find(d=>d.uri.toString()===saved.uri);const note=doc?relocate(saved,doc.getText()):saved;const uri=vscode.Uri.parse(note.uri);const row=new Row(note.content.split('\n')[0],`${path.basename(uri.fsPath)} · ${note.status==='stale'?'需重新绑定':'已保存'}`,note.status==='stale'?'question':'comment');row.note=saved;row.contextValue='note';row.tooltip=esc(`${note.content}\n\n${vscode.workspace.asRelativePath(uri)}\n创建：${note.createdAt}\n作者：${note.author}\n状态：${note.status==='active'?'锚点有效（打开文件时复核）':'原代码已变化或不唯一，请重新绑定'}`);row.command={command:'zhima.openNote',title:'查看标注',arguments:[note.id]};return row;});
  });
  registerView('zhima.health',()=>{if(!enabled())return [new Row('学习模式已关闭')];if(!current||!analysis)return [new Row('打开文件以查看健康提示')];if(!analysis.health.length)return [new Row('本次规则检查未发现提示','不代表代码完全正确','check')];return analysis.health.map(i=>jumpRow(i.message,current!.uri,i.start,i.suggestion,'info'));});
  registerView('zhima.errors',()=>{
    const rows:Row[]=[];
    if(enabled()&&current){for(const diagnostic of [...(syntax.get(current.uri)??[]),...(externalErrors.get(current.uri.toString())??[])]){const translated=translateError(diagnostic.message);rows.push(jumpRow(translated.title,current.uri,diagnostic.range.start.line,`${translated.explanation}\n建议：${translated.suggestion}\n原文：${diagnostic.message}`,'info'));}}
    if(!rows.length)rows.push(new Row('当前没有可解释的诊断','终端报错可用“解释粘贴的报错”','check'));
    const history=store.history();if(history.length){const parent=new Row('最近修复记录',`${history.length} 条`,'history');parent.collapsibleState=vscode.TreeItemCollapsibleState.Collapsed;parent.children=history.map(h=>{const row=new Row(h.title,path.basename(vscode.Uri.parse(h.uri).fsPath),'check');row.tooltip=esc(`${h.time}\n${h.uri}`);return row});rows.push(parent);}
    return rows;
  });
  registerView('zhima.dictionary',()=>terms.filter(t=>!current||t.languages.includes(current.languageId)).map(t=>{const row=new Row(t.key,t.title,'symbol-key');row.tooltip=termMarkdown(t);row.command={command:'zhima.termDetail',title:'查看术语',arguments:[t.key,t.languages[0]]};return row;}));
  function refreshViews(){for(const view of views)view.refresh();}
  function clearEditor(editor:vscode.TextEditor){for(const type of regionTypes.values())editor.setDecorations(type,[]);editor.setDecorations(noteType,[]);editor.setDecorations(bannerType,[]);}
  function paint(editor:vscode.TextEditor){
    clearEditor(editor);const doc=editor.document;if(!enabled()||!eligible(doc))return;
    const data=analyses.get(doc.uri.toString());if(!data||data.version!==doc.version)return;
    const perLine=new Map<number,{layer:Layer;reason:string}>();for(const r of data.data.regions)for(let line=r.start;line<=Math.min(r.end,doc.lineCount-1);line++)perLine.set(line,{layer:r.layer,reason:r.reason});
    for(const [layer,type] of regionTypes){const ranges:vscode.DecorationOptions[]=[];for(const [line,meta] of perLine)if(meta.layer===layer)ranges.push({range:doc.lineAt(line).range,hoverMessage:esc(`${layers[layer].title} · ${meta.reason}`)});editor.setDecorations(type,ranges);}
    editor.setDecorations(bannerType,[{range:doc.lineAt(0).range,renderOptions:{after:{contentText:`知码 · ${data.data.summary}`}}}]);
    editor.setDecorations(noteType,notesForDocument(doc).filter(n=>n.status==='active').map(n=>({range:new vscode.Range(doc.positionAt(n.start),doc.positionAt(n.end)),hoverMessage:esc(n.content)})));
  }
  function analyzeDocument(doc:vscode.TextDocument){
    if(!enabled()||!eligible(doc)){analyses.delete(doc.uri.toString());syntax.delete(doc.uri);healthDiagnostics.delete(doc.uri);if(doc===current){analysis=undefined;notice=enabled()?'请选择工作区内的 Python／HTML 文件；忽略目录和超限文件不自动分析。':'学习模式已关闭。';}for(const e of vscode.window.visibleTextEditors)if(e.document===doc)clearEditor(e);refreshViews();return;}
    try{
      const result=analyzer.analyze(doc.getText(),doc.languageId,doc.fileName,{functionLines:config().get('functionLines',50),nestingDepth:config().get('nestingDepth',4),parameterCount:config().get('parameterCount',5)});
      analyses.set(doc.uri.toString(),{version:doc.version,data:result});if(doc===current)analysis=result;
      const makeDiagnostic=(i:{start:number;end:number;message:string;suggestion:string},severity:vscode.DiagnosticSeverity)=>{const d=new vscode.Diagnostic(doc.lineAt(Math.min(i.start,doc.lineCount-1)).range,`${i.message}\n${i.suggestion}`,severity);d.source='知码';return d;};
      syntax.set(doc.uri,result.syntax.map(i=>makeDiagnostic(i,vscode.DiagnosticSeverity.Information)));
      healthDiagnostics.set(doc.uri,result.health.map(i=>makeDiagnostic(i,vscode.DiagnosticSeverity.Hint)));
      // Persist anchors only for saved text; unsaved buffers are evaluated without altering durable anchors.
      if(!doc.isDirty)for(const saved of store.list(doc.uri.toString())){const relocated=relocate(saved,doc.getText());if(saved.start!==relocated.start||saved.end!==relocated.end||saved.status!==relocated.status){try{store.put(relocated)}catch(error){output.appendLine(`笔记位置暂未保存：${String(error)}`)}}}
      for(const editor of vscode.window.visibleTextEditors)if(editor.document===doc)paint(editor);refreshViews();
    }catch(error){output.appendLine(String(error));notice=`分析失败：${String(error)}`;analysis=undefined;overview.refresh();}
  }
  function refresh(){current=vscode.window.activeTextEditor?.document;if(current)analyzeDocument(current);else{analysis=undefined;notice='打开 Python 或 HTML 文件，开始阅读。';refreshViews();}}
  function safeCommand(name:string,fn:(...args:any[])=>unknown){context.subscriptions.push(vscode.commands.registerCommand(name,async(...args:any[])=>{try{return await fn(...args)}catch(error){output.appendLine(String(error));if(error instanceof NoteConflictError)refreshViews();await vscode.window.showErrorMessage(`知码：${error instanceof Error?error.message:String(error)}`);}}));}
  async function open(uri:vscode.Uri,line=0){if(!isAllowedUri(uri))throw new Error('仅允许打开当前工作区内未被忽略的 Python / HTML 文件。');const doc=await vscode.workspace.openTextDocument(uri);const editor=await vscode.window.showTextDocument(doc);const position=new vscode.Position(Math.max(0,Math.min(line,doc.lineCount-1)),0);editor.selection=new vscode.Selection(position,position);editor.revealRange(new vscode.Range(position,position),vscode.TextEditorRevealType.InCenterIfOutsideViewport);return editor;}
  safeCommand('zhima.open',open);
  safeCommand('zhima.refresh',refresh);
  safeCommand('zhima.toggle',async()=>{await config().update('enabled',!enabled(),config().inspect('enabled')?.workspaceValue!==undefined?vscode.ConfigurationTarget.Workspace:vscode.ConfigurationTarget.Global);});
  safeCommand('zhima.storage',()=>vscode.env.openExternal(vscode.Uri.file(storageDir)));
  safeCommand('zhima.explainFile',()=>vscode.window.showInformationMessage(analysis?.summary??notice));
  async function showTerm(key:string,language:string){const term=findTerm(key,language);if(!term)return;await vscode.window.showInformationMessage(`${term.title}（${term.key}）\n${term.definition}`,{modal:true,detail:`示例：\n${term.example}\n\n相关：${term.related.join('、')}`});}
  safeCommand('zhima.termDetail',showTerm);
  safeCommand('zhima.terms',async()=>{const picked=await vscode.window.showQuickPick(terms.map(t=>({label:t.key,description:t.title,detail:`${t.aliases.join(' / ')} · ${t.definition}`,term:t})),{placeHolder:'输入不懂的词，例如：函数、工作区、API、安装包',matchOnDescription:true,matchOnDetail:true});if(picked)await showTerm(picked.term.key,picked.term.languages[0]);});
  function getSelection(){const editor=vscode.window.activeTextEditor;if(!editor||!eligible(editor.document))throw new Error('请先打开工作区内的 Python / HTML 文件。');let selection:vscode.Range=editor.selection;if(selection.isEmpty)selection=editor.document.lineAt(selection.start.line).range;const selectedText=editor.document.getText(selection);if(!selectedText.trim())throw new Error('请选择非空代码。');if(selectedText.length>100000)throw new Error('选区过大，请选择更小的代码片段。');return {editor,selectedText,start:editor.document.offsetAt(selection.start),end:editor.document.offsetAt(selection.end)};}
  safeCommand('zhima.annotate',async()=>{const selected=getSelection();const version=selected.editor.document.version;const content=await vscode.window.showInputBox({title:'给这段代码写笔记',prompt:'保存在这台电脑里，不会改动代码',validateInput:value=>!value.trim()?'请输入笔记内容':value.length>10000?'最多 10000 字':undefined});if(!content?.trim())return;if(selected.editor.document.version!==version)throw new Error('输入期间代码发生变化，请重新选择后添加。');const now=new Date().toISOString();store.put({id:randomUUID(),uri:selected.editor.document.uri.toString(),start:selected.start,end:selected.end,selectedText:selected.selectedText,codeHash:hash(selected.selectedText),content:content.trim(),createdAt:now,updatedAt:now,status:'active',author:'本地用户'});refresh();});
  safeCommand('zhima.openNote',async(id:string)=>{const note=store.list().find(n=>n.id===id);if(!note)return;const editor=await open(vscode.Uri.parse(note.uri));const located=relocate(note,editor.document.getText());if(located.status==='stale'){await vscode.window.showWarningMessage('原代码已变化或出现多个匹配位置。请选中正确代码，在标注菜单中选择“绑定到当前选区”。');return;}const range=new vscode.Range(editor.document.positionAt(located.start),editor.document.positionAt(located.end));editor.selection=new vscode.Selection(range.start,range.end);editor.revealRange(range,vscode.TextEditorRevealType.InCenterIfOutsideViewport);await vscode.window.showInformationMessage(note.content,{modal:true});});
  safeCommand('zhima.editNote',async(row?:Row)=>{
    if(!row?.note)return;const note=row.note;
    const content=await vscode.window.showInputBox({title:'修改笔记',value:note.content,validateInput:value=>!value.trim()?'请输入内容':value.length>10000?'最多 10000 字':undefined});
    if(!content?.trim())return;
    try{store.put({...note,content:content.trim(),updatedAt:new Date().toISOString()});refresh();}
    catch(error){
      if(!(error instanceof NoteConflictError))throw error;
      refreshViews();
      // Keep the user's newly typed text available without overwriting the other window.
      const draft=await vscode.workspace.openTextDocument({language:'plaintext',content:`刚才输入的笔记（尚未保存到知码）\n\n${content}\n\n原文件：${note.uri}\n请从“我的笔记”重新打开最新内容，再决定如何合并。`});
      await vscode.window.showTextDocument(draft);
      await vscode.window.showWarningMessage('另一窗口修改了这条笔记。你的输入已放在旁边的草稿中，请复制后合并。');
    }
  });
  safeCommand('zhima.deleteNote',async(row?:Row)=>{if(!row?.note)return;if(await vscode.window.showWarningMessage('删除这条笔记？',{modal:true},'删除')==='删除'){store.delete(row.note.id,row.note.revision??1);refresh();}});
  safeCommand('zhima.reanchor',async(row?:Row)=>{if(!row?.note)return;const selection=getSelection();if(row.note.uri!==selection.editor.document.uri.toString())throw new Error('请在原标注所在文件中选择代码。');store.put({...row.note,...{start:selection.start,end:selection.end,selectedText:selection.selectedText},codeHash:hash(selection.selectedText),status:'active',updatedAt:new Date().toISOString()});refresh();});
  safeCommand('zhima.translate',async()=>{const raw=await vscode.window.showInputBox({title:'粘贴报错信息',prompt:'本地规则解释；不会联网或执行代码'});if(!raw)return;const translated=translateError(raw);await vscode.window.showInformationMessage(translated.title,{modal:true,detail:`${translated.explanation}\n\n建议：${translated.suggestion}\n\n原文：${raw}`});});
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('zhima-preview',{provideTextDocumentContent:uri=>previews.get(uri.toString())??'预览已过期，请重新预览。'}));
  function verifiedFixes(doc:vscode.TextDocument):SafeFix[]{
    const original=doc.getText();const candidates=safeFixes(original,doc.languageId);if(!candidates.length)return [];
    const before=analyzer.analyze(original,doc.languageId,doc.fileName);
    if(!before.syntax.length)return [];
    return candidates.filter(fix=>{const modified=original.slice(0,fix.start)+fix.replacement+original.slice(fix.end);return analyzer.analyze(modified,doc.languageId,doc.fileName).syntax.length<before.syntax.length;});
  }
  async function previewFix(uri?:vscode.Uri){
    const doc=uri?await vscode.workspace.openTextDocument(uri):vscode.window.activeTextEditor?.document;if(!doc||!eligible(doc))throw new Error('请打开工作区内的 Python 文件。');
    const fixes=verifiedFixes(doc);if(!fixes.length){await vscode.window.showInformationMessage('没有可确定的自动修复。请查看中文报错建议；首版仅自动补全明确的 else / try / finally 冒号。');return;}
    const chosen=fixes.length===1?fixes[0]:(await vscode.window.showQuickPick(fixes.map(f=>({label:f.title,description:`第 ${doc.positionAt(f.start).line+1} 行`,fix:f})),{title:'选择要预览的修复'}))?.fix;if(!chosen)return;
    const original=doc.getText(),modified=original.slice(0,chosen.start)+chosen.replacement+original.slice(chosen.end);
    pendingFix={uri:doc.uri,version:doc.version,original,fixes:[chosen]};previews.clear();
    const token=randomUUID();const before=vscode.Uri.parse(`zhima-preview:/${token}/原始${path.extname(doc.fileName)}`),after=vscode.Uri.parse(`zhima-preview:/${token}/修改后${path.extname(doc.fileName)}`);previews.set(before.toString(),original);previews.set(after.toString(),modified);
    await vscode.commands.executeCommand('vscode.diff',before,after,`知码修复预览 · ${chosen.title}`);
    if(await vscode.window.showInformationMessage('已打开修改对比。确认后应用；不会自动保存文件。','应用修复')==='应用修复')await applyFix();
  }
  async function applyFix(){
    if(!pendingFix){await vscode.window.showInformationMessage('请先运行“预览当前文件安全修复”。');return;}
    const pending=pendingFix;pendingFix=undefined;if(!isAllowedUri(pending.uri))throw new Error('原文件已不在当前可编辑范围。');const doc=await vscode.workspace.openTextDocument(pending.uri);
    if(doc.version!==pending.version||doc.getText()!==pending.original)throw new Error('代码在预览后发生变化，修复已取消，请重新预览。');
    const edit=new vscode.WorkspaceEdit();for(const fix of pending.fixes)edit.replace(doc.uri,new vscode.Range(doc.positionAt(fix.start),doc.positionAt(fix.end)),fix.replacement);
    if(!await vscode.workspace.applyEdit(edit))throw new Error('编辑未能应用。');store.record({uri:doc.uri.toString(),title:pending.fixes.map(f=>f.title).join('；'),time:new Date().toISOString()});await vscode.window.showTextDocument(doc);refresh();
  }
  safeCommand('zhima.previewFix',previewFix);safeCommand('zhima.applyFix',applyFix);
  context.subscriptions.push(vscode.languages.registerHoverProvider(selector,{provideHover(doc,pos){if(!enabled()||!eligible(doc))return;const range=doc.getWordRangeAtPosition(pos,/[\p{L}_][\p{L}\p{N}_-]*/u);if(!range)return;const term=findTerm(doc.getText(range),doc.languageId);if(term)return new vscode.Hover(termMarkdown(term),range);}}));
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector,{provideCodeActions(doc,range){if(!enabled()||!eligible(doc))return [];const fixes=verifiedFixes(doc).filter(f=>Math.abs(doc.positionAt(f.start).line-range.start.line)<=1);if(!fixes.length)return [];const action=new vscode.CodeAction('知码：预览补全冒号',vscode.CodeActionKind.QuickFix);action.command={command:'zhima.previewFix',title:action.title,arguments:[doc.uri]};return [action];}},{providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor=>{if(editor?.document.uri.scheme==='zhima-preview')return;refresh();}));
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors=>{for(const editor of editors)if(!analyses.has(editor.document.uri.toString()))analyzeDocument(editor.document);else paint(editor);}));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event=>{if(!event.contentChanges.length)return;const key=event.document.uri.toString();clearTimeout(timers.get(key));timers.set(key,setTimeout(()=>{timers.delete(key);analyzeDocument(event.document)},350));}));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(analyzeDocument));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc=>{const key=doc.uri.toString();clearTimeout(timers.get(key));timers.delete(key);analyses.delete(key);externalErrors.delete(key);syntax.delete(doc.uri);healthDiagnostics.delete(doc.uri);}));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{if(!event.affectsConfiguration('zhima'))return;resetRegionTypes();analyses.clear();syntax.clear();healthDiagnostics.clear();for(const editor of vscode.window.visibleTextEditors)analyzeDocument(editor.document);refresh();files.refresh();}));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(()=>{files.refresh();refresh()}));
  context.subscriptions.push(vscode.window.onDidChangeWindowState(state=>{if(state.focused)refreshViews()}));
  const watcher=vscode.workspace.createFileSystemWatcher('**/*');context.subscriptions.push(watcher,watcher.onDidCreate(()=>files.refresh()),watcher.onDidDelete(()=>{files.refresh();refresh()}));
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(event=>{for(const uri of event.uris){if(!isAllowedUri(uri))continue;externalErrors.set(uri.toString(),vscode.languages.getDiagnostics(uri).filter(d=>d.source!=='知码'&&d.severity<=vscode.DiagnosticSeverity.Warning));}refreshViews();}));
  for(const [uri,diagnostics] of vscode.languages.getDiagnostics())if(isAllowedUri(uri))externalErrors.set(uri.toString(),diagnostics.filter(d=>d.source!=='知码'&&d.severity<=vscode.DiagnosticSeverity.Warning));
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,80);status.command='zhima.toggle';status.tooltip='切换知码学习模式';const updateStatus=()=>{status.text=enabled()?'$(book) 知码 · 学习中':'$(book) 知码 · 已暂停';status.show()};updateStatus();context.subscriptions.push(status,vscode.workspace.onDidChangeConfiguration(updateStatus));
  registerBackupCommands(context,store,isAllowedUri,refresh);
  const onboarding=registerOnboarding(context);
  const projectReader=registerReader(context);
  refresh();output.appendLine('知码已就绪：本地解析与 SQLite 存储，不执行项目代码，不上传源码。');
  return {analyzer,store,isAllowedUri,getAnalysis:()=>analysis,onboarding,projectReader};
}
export function deactivate(){}
