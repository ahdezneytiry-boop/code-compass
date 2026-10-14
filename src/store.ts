import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Note } from './core';

export class NoteConflictError extends Error {
  constructor(){super('这条笔记已在另一个窗口修改或删除。列表已刷新，请重新打开后再操作。');}
}
export type ImportPolicy='skip'|'keepBoth';
export interface ImportResult {added:number;duplicates:number;conflicts:number;copies:number}
const normalize=(note:Note):Note=>({...note,revision:note.revision??1});
// A restored copy can have a new ID and anchor, but remains the same learning note.
const identity=(n:Note)=>JSON.stringify([n.uri,n.selectedText,n.codeHash,n.content,n.author]);
export class NoteStore {
  private SQL!:SqlJsStatic;
  constructor(private readonly file:string,private readonly wasmDirectory:string){}
  async init(){this.SQL=await initSqlJs({locateFile:()=>path.join(this.wasmDirectory,'sql-wasm.wasm')});fs.mkdirSync(path.dirname(this.file),{recursive:true});this.read(db=>db.run('SELECT 1'));}
  private open():Database {const db=fs.existsSync(this.file)?new this.SQL.Database(fs.readFileSync(this.file)):new this.SQL.Database();db.run('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, uri TEXT NOT NULL, body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS notes_uri ON notes(uri); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS note_revisions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL)');return db;}
  private read<T>(fn:(db:Database)=>T):T{const db=this.open();try{return fn(db)}finally{db.close()}}
  private write<T>(fn:(db:Database)=>T):T{
    const lock=this.file+'.lock';let fd:number;
    try{fd=fs.openSync(lock,'wx')}catch{throw new Error('数据目录正被另一个窗口使用，请稍后重试。如果此前异常退出，请关闭所有知码窗口后删除 notes.sqlite.lock。')}
    let db:Database|undefined;
    try{db=this.open();db.run('BEGIN');const result=fn(db);db.run('COMMIT');const tmp=this.file+'.tmp';fs.writeFileSync(tmp,db.export());fs.renameSync(tmp,this.file);return result;}
    finally{db?.close();fs.closeSync(fd);fs.unlinkSync(lock)}
  }
  private rows(db:Database,uri?:string):Note[]{const stmt=db.prepare(uri?'SELECT body FROM notes WHERE uri = ? ORDER BY id':'SELECT body FROM notes ORDER BY id');try{if(uri)stmt.bind([uri]);const result:Note[]=[];while(stmt.step())result.push(normalize(JSON.parse(String(stmt.getAsObject().body))));return result}finally{stmt.free()}}
  private get(db:Database,id:string):Note|undefined{const stmt=db.prepare('SELECT body FROM notes WHERE id = ?');try{stmt.bind([id]);return stmt.step()?normalize(JSON.parse(String(stmt.getAsObject().body))):undefined}finally{stmt.free()}}
  private insert(db:Database,note:Note){db.run('INSERT OR REPLACE INTO notes(id,uri,body) VALUES (?,?,?)',[note.id,note.uri,JSON.stringify(note)]);}
  private nextRevision(db:Database,id:string,current=0):number{
    const stmt=db.prepare('SELECT revision FROM note_revisions WHERE id = ?');let previous=0;
    try{stmt.bind([id]);if(stmt.step())previous=Number(stmt.getAsObject().revision)}finally{stmt.free()}
    const next=Math.max(previous,current)+1;
    db.run('INSERT OR REPLACE INTO note_revisions(id,revision) VALUES (?,?)',[id,next]);return next;
  }
  list(uri?:string):Note[]{return this.read(db=>this.rows(db,uri));}
  put(note:Note):Note{return this.write(db=>{const current=this.get(db,note.id);if(current?note.revision!==current.revision:note.revision!==undefined)throw new NoteConflictError();const saved={...note,revision:this.nextRevision(db,note.id,current?.revision)};this.insert(db,saved);return saved;});}
  delete(id:string,expectedRevision:number){this.write(db=>{const current=this.get(db,id);if(!current||current.revision!==expectedRevision)throw new NoteConflictError();this.nextRevision(db,id,current.revision);db.run('DELETE FROM notes WHERE id = ?',[id]);});}
  private merge(db:Database,notes:Note[],policy:ImportPolicy,commit:boolean):ImportResult{
    const existing=this.rows(db),byId=new Map(existing.map(n=>[n.id,n]));const seen=new Set(existing.map(identity));
    const result:ImportResult={added:0,duplicates:0,conflicts:0,copies:0};
    for(const note of notes){const key=identity(note);if(seen.has(key)){result.duplicates++;continue;}
      const conflict=byId.has(note.id);if(conflict){result.conflicts++;if(policy==='skip')continue;}
      const saved={...note,id:conflict?randomUUID():note.id,revision:1};
      if(commit){saved.revision=this.nextRevision(db,saved.id);this.insert(db,saved);}byId.set(saved.id,saved);seen.add(key);result.added++;if(conflict)result.copies++;
    }return result;
  }
  previewImport(notes:Note[],policy:ImportPolicy):ImportResult{return this.read(db=>this.merge(db,notes,policy,false));}
  importNotes(notes:Note[],policy:ImportPolicy):ImportResult{return this.write(db=>this.merge(db,notes,policy,true));}
  record(entry:{uri:string;title:string;time:string}){this.write(db=>db.run('INSERT INTO history(body) VALUES (?)',[JSON.stringify(entry)]));}
  history():{uri:string;title:string;time:string}[]{return this.read(db=>{const rows=db.exec('SELECT body FROM history ORDER BY id DESC LIMIT 30');return (rows[0]?.values??[]).map(row=>JSON.parse(String(row[0])));});}
}
