import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import type { Note } from './core';

export const MAX_BACKUP_BYTES=10*1024*1024;
type PortableNote=Omit<Note,'uri'|'revision'> & {path:string};
export interface NoteBackup {kind:'zhima-notes';version:1;createdAt:string;projectName:string;notes:PortableNote[]}
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
function invalid():never{throw new Error('这份文件不是完整的知码笔记备份，或内容已损坏。没有恢复任何笔记。');}
function text(value:unknown,max:number,empty=false):value is string{return typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0);}
export function safeRelativePath(value:unknown):value is string{
  return text(value,2048)&&!/[\\\x00-\x1f:]/.test(value)&&!value.startsWith('/')&&value.split('/').every(p=>p!=='.'&&p!=='..'&&p!==''&&!/[. ]$/.test(p)&&!/[<>"|?*]/.test(p)&&!/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(\.|$)/i.test(p))&&/\.(py|html)$/i.test(value);
}
export function parseBackup(raw:string):NoteBackup{
  if(Buffer.byteLength(raw,'utf8')>MAX_BACKUP_BYTES)throw new Error('备份超过 10 MB，请分项目备份。');
  let data:any;try{data=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{invalid();}
  if(!data||data.kind!=='zhima-notes'||data.version!==1||!text(data.createdAt,64)||!Number.isFinite(Date.parse(data.createdAt))||!text(data.projectName,255)||!Array.isArray(data.notes)||data.notes.length>5000)invalid();
  const ids=new Set<string>();const notes:PortableNote[]=data.notes.map((n:any)=>{
    if(!n||!text(n.id,128)||ids.has(n.id)||!safeRelativePath(n.path)||!text(n.selectedText,100000)||!text(n.content,10000)||!text(n.author,200)||!text(n.createdAt,64)||!text(n.updatedAt,64)||!Number.isFinite(Date.parse(n.createdAt))||!Number.isFinite(Date.parse(n.updatedAt))||!Number.isSafeInteger(n.start)||n.start<0||!Number.isSafeInteger(n.end)||n.end-n.start!==n.selectedText.length||!['active','stale'].includes(n.status)||n.codeHash!==digest(n.selectedText))invalid();
    ids.add(n.id);return {id:n.id,path:n.path,start:n.start,end:n.end,selectedText:n.selectedText,codeHash:n.codeHash,content:n.content,createdAt:n.createdAt,updatedAt:n.updatedAt,status:n.status,author:n.author};
  });return {kind:'zhima-notes',version:1,createdAt:data.createdAt,projectName:data.projectName,notes};
}
const inside=(root:string,file:string)=>{const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
export function createBackup(notes:Note[],root:string):{backup:NoteBackup;skipped:number}{
  const portable:PortableNote[]=[];let skipped=0;
  for(const n of notes){let file:string;try{file=fileURLToPath(n.uri);}catch{skipped++;continue;}
    if(!inside(root,file)){skipped++;continue;}const relative=path.relative(root,file).split(path.sep).join('/');
    if(!safeRelativePath(relative)){skipped++;continue;}
    const {uri,revision,...rest}=n;portable.push({...rest,path:relative});
  }
  const backup:NoteBackup={kind:'zhima-notes',version:1,createdAt:new Date().toISOString(),projectName:path.basename(root),notes:portable};
  return {backup:parseBackup(JSON.stringify(backup)),skipped};
}
export function prepareRestore(backup:NoteBackup,root:string,allowed:(file:string)=>boolean,maxFileBytes=1024*1024):{notes:Note[];skipped:string[]}{
  const realRoot=fs.realpathSync(root);const notes:Note[]=[];const skipped:string[]=[];
  for(const item of backup.notes){
    if(!safeRelativePath(item.path))invalid();
    const target=path.resolve(root,...item.path.split('/'));
    try{
      if(!inside(root,target)||!inside(realRoot,fs.realpathSync(target))||!allowed(target))throw new Error();
      const stat=fs.statSync(target);if(!stat.isFile()||stat.size>maxFileBytes)throw new Error();
      const source=fs.readFileSync(target,'utf8');const at=source.indexOf(item.selectedText);
      const unique=at>=0&&source.indexOf(item.selectedText,at+1)<0;
      const {path:relative,...note}=item;
      notes.push({...note,uri:pathToFileURL(target).href,start:unique?at:note.start,end:unique?at+note.selectedText.length:note.end,status:unique?'active':'stale'});
    }catch{skipped.push(item.path);}
  }return {notes,skipped};
}
