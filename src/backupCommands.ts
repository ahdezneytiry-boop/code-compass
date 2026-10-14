import * as vscode from 'vscode';
import { createBackup, parseBackup, prepareRestore, MAX_BACKUP_BYTES } from './backup';
import { NoteStore, ImportPolicy } from './store';

export function registerBackupCommands(context:vscode.ExtensionContext,store:NoteStore,allowed:(uri:vscode.Uri)=>boolean,refresh:()=>void){
  async function folder(title:string){
    const roots=(vscode.workspace.workspaceFolders??[]).filter(r=>r.uri.scheme==='file');
    if(!roots.length)throw new Error('请先用“文件 → 打开文件夹”打开笔记对应的项目。');
    if(roots.length===1)return roots[0];
    return (await vscode.window.showQuickPick(roots.map(root=>({label:root.name,description:root.uri.fsPath,root})),{title,placeHolder:'一次处理一个项目文件夹'}))?.root;
  }
  const register=(name:string,action:()=>Promise<void>)=>context.subscriptions.push(vscode.commands.registerCommand(name,async()=>{try{await action()}catch(error){await vscode.window.showErrorMessage(`知码：${error instanceof Error?error.message:String(error)}`)}}));
  register('zhima.exportNotes',async()=>{
    const root=await folder('选择要备份笔记的项目');if(!root)return;
    const {backup,skipped}=createBackup(store.list(),root.uri.fsPath);
    if(!backup.notes.length){await vscode.window.showInformationMessage('这个项目还没有可备份的笔记。先选中代码，右键“给这段代码写笔记”。');return;}
    const target=await vscode.window.showSaveDialog({title:`备份 ${backup.notes.length} 条笔记（包含所选代码片段）`,saveLabel:'保存笔记备份',defaultUri:vscode.Uri.joinPath(root.uri,`知码笔记-${new Date().toISOString().slice(0,10)}.zhima-notes.json`),filters:{'知码笔记备份':['json']}});
    if(!target)return;if(target.scheme!=='file'||!target.fsPath.toLowerCase().endsWith('.json'))throw new Error('请选择以 .json 结尾的电脑本地文件。');
    await vscode.workspace.fs.writeFile(target,Buffer.from(JSON.stringify(backup),'utf8'));
    await vscode.window.showInformationMessage(`已备份 ${backup.notes.length} 条笔记。${skipped?`另有 ${skipped} 条不属于所选项目或路径不支持，未包含在这份备份中。`:''}移动项目时，请同时保留代码文件和这份备份。`);
  });
  register('zhima.importNotes',async()=>{
    const files=await vscode.window.showOpenDialog({title:'第 1 步：选择以前保存的笔记备份',openLabel:'查看这份备份',canSelectMany:false,canSelectFiles:true,canSelectFolders:false,filters:{'知码笔记备份':['json']}});
    if(!files?.[0])return;const source=files[0];if(source.scheme!=='file')throw new Error('请选择电脑上的笔记备份。');
    // Check the file size before reading or parsing untrusted backup content.
    if((await vscode.workspace.fs.stat(source)).size>MAX_BACKUP_BYTES)throw new Error('备份超过 10 MB，请分项目备份。');
    const backup=parseBackup(Buffer.from(await vscode.workspace.fs.readFile(source)).toString('utf8'));
    const root=await folder('第 2 步：笔记要恢复到哪个项目？');if(!root)return;
    const prepare=()=>prepareRestore(backup,root.uri.fsPath,file=>allowed(vscode.Uri.file(file)),vscode.workspace.getConfiguration('zhima').get<number>('maxFileKB',1024)*1024);
    const prepared=prepare();
    // Use VS Code's URI serialization, also on Windows drives and non-ASCII paths.
    for(const n of prepared.notes)n.uri=vscode.Uri.file(vscode.Uri.parse(n.uri).fsPath).toString();
    let policy:ImportPolicy='skip';const initial=store.previewImport(prepared.notes,policy);
    if(initial.conflicts){
      const choice=await vscode.window.showQuickPick([{label:'保留现在的笔记，跳过冲突',policy:'skip' as const},{label:'两份都保留',description:'把备份中的不同内容另存为一条笔记',policy:'keepBoth' as const}],{title:`有 ${initial.conflicts} 条笔记的内容与现有记录不同`});
      if(!choice)return;policy=choice.policy;
    }
    const plan=store.previewImport(prepared.notes,policy);const stale=prepared.notes.filter(n=>n.status==='stale').length;
    const summary=`来源：${backup.projectName}\n恢复到：${root.uri.fsPath}\n\n预计新增 ${plan.added} 条（其中冲突副本 ${plan.copies} 条）\n相同内容跳过 ${plan.duplicates} 条\n保留现有内容、跳过冲突 ${policy==='skip'?plan.conflicts:0} 条\n文件不存在、被忽略或超限 ${prepared.skipped.length} 条\n可恢复笔记中，有 ${stale} 条需要重新选择对应代码\n\n${prepared.skipped.length?'未找到可用文件：\n'+prepared.skipped.slice(0,8).join('\n')+(prepared.skipped.length>8?'\n……':'')+'\n\n':''}只恢复笔记，不修改代码。确认时会再次核对文件和已有笔记。`;
    if(await vscode.window.showInformationMessage('第 3 步：确认恢复笔记',{modal:true,detail:summary},'确认恢复')!=='确认恢复')return;
    // A file or symlink may change while the confirmation dialog is open.
    const latest=prepare();for(const n of latest.notes)n.uri=vscode.Uri.file(vscode.Uri.parse(n.uri).fsPath).toString();
    if(JSON.stringify(latest)!==JSON.stringify(prepared))throw new Error('预览后项目文件发生变化，请重新恢复并核对结果。');
    const result=store.importNotes(latest.notes,policy);refresh();
    await vscode.window.showInformationMessage(`恢复完成：新增 ${result.added} 条，相同内容跳过 ${result.duplicates} 条，冲突跳过 ${policy==='skip'?result.conflicts:0} 条，文件不可用跳过 ${latest.skipped.length} 条。${stale?'带问号的笔记需要重新选择对应代码。':''}`);
  });
}
