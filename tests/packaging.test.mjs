import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url),pkg=JSON.parse(readFileSync(new URL('package.json',root)));
test('standalone install declares and ships the host activation layer',()=>{assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml');assert(pkg.files.includes('cordis.patch.yml'));const patch=readFileSync(new URL(pkg.dsh.bundle.patch,root),'utf8');assert(patch.includes('id: mydsh-side-tasks'));assert(patch.includes(pkg.name));assert(pkg.dsh.client.inject.length>0);assert(existsSync(new URL(pkg.exports['./client'].default,root)));});
test('distributed inert host entry has a real apply export',async()=>{const entry=await import(new URL(pkg.main,root));assert.equal(typeof entry.apply,'function');assert.equal(entry.apply(),undefined);});

test('exported declarations match acknowledged-operation contract',()=>{
  const controller=readFileSync(new URL('lib/types/client/controller.d.ts',root),'utf8');
  const panel=readFileSync(new URL('lib/types/client/SideTaskPanel.d.ts',root),'utf8');
  for(const text of [controller,panel]){
    assert.match(text,/sendTask\(childId: SessionId, text: string\): Promise<boolean>/);
    assert.match(text,/stopTask\(childId: SessionId\): Promise<boolean>/);
  }
  assert(existsSync(new URL('lib/types/client/history.d.ts',root)),'history adapter declaration must be current');
});

test('npm package contains all export targets and usable map references',async()=>{
  const {execFileSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const path=await import('node:path');
  const packed=JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{cwd:fileURLToPath(root),encoding:'utf8'}));
  const files=new Set(packed[0].files.map(x=>x.path));
  for(const [name,entry] of Object.entries(pkg.exports)){
    if(name.includes('*')) continue;
    for(const target of typeof entry==='string'?[entry]:Object.values(entry)){
      assert(files.has(target.replace(/^\.\//,'')),`missing export ${name}: ${target}`);
    }
  }
  for(const file of files){
    if(!file.endsWith('.map')) continue;
    const map=JSON.parse(readFileSync(new URL(file,root),'utf8'));
    for(const [index,source] of (map.sources??[]).entries()){
      if(typeof map.sourcesContent?.[index]==='string') continue;
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),map.sourceRoot??'',source));
      assert(files.has(target),`map ${file} references missing source ${target}`);
    }
  }
  assert(files.has('LICENSE'));
  assert(files.has('README.md'));
  assert(files.has('docs/compatibility.md'));
  assert(files.has('lib/client.js.map'));
  assert(files.has('lib/types/client/controller.d.ts.map'));
  assert(files.has('src/client/controller.ts'));
});
