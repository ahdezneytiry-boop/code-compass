const vscode=require('vscode');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
exports.run=async()=>{
 const results=[];const extension=vscode.extensions.getExtension('local-learning.code-compass-zh');assert.ok(extension,'extension is discoverable');const api=await extension.activate();results.push('插件在真实 VS Code 扩展宿主中成功激活');
 const root=vscode.workspace.workspaceFolders[0].uri;
 const uri=vscode.Uri.joinPath(root,'backend','auth_service.py');const doc=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(doc);await vscode.commands.executeCommand('zhima.refresh');
 const hovers=await vscode.commands.executeCommand('vscode.executeHoverProvider',uri,new vscode.Position(3,1));assert.ok(hovers.some(h=>h.contents.some(c=>(typeof c==='string'?c:c.value).includes('函数定义'))));results.push('Python 术语悬停返回中文解释');
 assert.ok(api.getAnalysis().health.some(i=>i.type==='long_params'));assert.ok(api.getAnalysis().health.some(i=>i.type==='unused_variable'));results.push('实际编辑器检测到参数过多与未使用变量');
 assert.equal(api.isAllowedUri(vscode.Uri.file(path.join(path.dirname(root.fsPath),'outside.py'))),false);results.push('工作区外文件被拒绝');
 const html=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root,'frontend','login.html'));await vscode.window.showTextDocument(html);await vscode.commands.executeCommand('zhima.refresh');assert.equal(api.getAnalysis().regions[0].layer,'ui');results.push('HTML 文件解析与界面层分区成功');
 const bad=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root,'practice','missing_colon.py'));await vscode.window.showTextDocument(bad);await vscode.commands.executeCommand('zhima.refresh');assert.ok(vscode.languages.getDiagnostics(bad.uri).some(d=>d.source==='知码'));const actions=await vscode.commands.executeCommand('vscode.executeCodeActionProvider',bad.uri,bad.lineAt(5).range);assert.ok(actions.some(a=>a.title.includes('预览补全冒号')));results.push('语法问题和预览修复入口可用');
 await vscode.workspace.getConfiguration('zhima').update('enabled',false,vscode.ConfigurationTarget.Global);await vscode.commands.executeCommand('zhima.refresh');assert.equal(vscode.languages.getDiagnostics(bad.uri).filter(d=>d.source==='知码').length,0);assert.equal(api.getAnalysis(),undefined);results.push('关闭学习模式清除学习诊断');
 await vscode.workspace.getConfiguration('zhima').update('enabled',true,vscode.ConfigurationTarget.Global);
 await vscode.commands.executeCommand('zhima.start');results.push('新版分步引导入口可以打开');
 assert.equal(await api.onboarding.initialStep(),1);results.push('已打开练习项目自动进入读懂一句，不要求重复创建');
 await vscode.commands.executeCommand('zhima.practiceFile');assert.ok(vscode.window.activeTextEditor.document.fileName.endsWith('hello.py'));results.push('引导识别练习标记并打开入门代码');
 const commands=await vscode.commands.getCommands(true);assert.ok(commands.includes('zhima.exportNotes'));assert.ok(commands.includes('zhima.importNotes'));results.push('备份与恢复命令在真实宿主中注册');
 const {randomUUID,createHash}=require('node:crypto');const sample='def greet(name):';const now=new Date().toISOString();
 const saved=api.store.put({id:randomUUID(),uri:vscode.Uri.joinPath(root,'hello.py').toString(),start:0,end:sample.length,selectedText:sample,codeHash:createHash('sha256').update(sample).digest('hex'),content:'集成验收临时笔记',createdAt:now,updatedAt:now,status:'active',author:'test'});
 try{const updated=api.store.put({...saved,content:'已更新'});assert.throws(()=>api.store.put({...saved,content:'过期输入'}));assert.equal(api.store.list(saved.uri).find(n=>n.id===saved.id).revision,updated.revision);results.push('真实宿主保存笔记并阻止过期修改');}finally{const latest=api.store.list().find(n=>n.id===saved.id);if(latest)api.store.delete(latest.id,latest.revision);}
 const resultDir=path.resolve(__dirname,'../test-results');fs.mkdirSync(resultDir,{recursive:true});fs.writeFileSync(path.join(resultDir,'integration.json'),JSON.stringify({passed:true,version:vscode.version,extensionVersion:extension.packageJSON.version,extensionPath:extension.extensionPath,checks:results},null,2));
};
