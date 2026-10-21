import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,cp,mkdir,symlink,readdir,readFile,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const root=fileURLToPath(new URL('../',import.meta.url))
test('two independent build roots produce identical declarations, bundles and maps',async()=>{
  assert(process.env.DSH_CHECKOUT,'An explicit built SDK is required; no skipped build gate')
  const temp=await mkdtemp(join(tmpdir(),'mydsh-repro-'))
  async function inventory(dir,prefix=''){
    const files={}
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const name=prefix+entry.name,path=join(dir,entry.name)
      if(entry.isDirectory())Object.assign(files,await inventory(path,name+'/'))
      else {assert(entry.isFile(),`Unexpected non-file artifact: ${name}`);files[name]=createHash('sha256').update(await readFile(path)).digest('hex')}
    }
    return files
  }
  try {
    const results=[]
    for(const name of ['one','other-directory']){
      const dir=join(temp,name);await mkdir(dir)
      for(const file of ['src','scripts','tsconfig.json','tsdown.config.ts','package.json']) await cp(join(root,file),join(dir,file),{recursive:true})
      // Build commands only read dependencies; never run npm install against a
      // shared node_modules symlink. Dependency installation belongs elsewhere.
      await symlink(resolve(root,'node_modules'),join(dir,'node_modules'),'dir')
      execFileSync('npm',['run','build'],{cwd:dir,env:process.env,stdio:'pipe',timeout:120000})
      const bundle=await readFile(join(dir,'lib/client.js'),'utf8')
      assert(!bundle.includes(temp),'The bundle must not disclose the temporary build root')
      results.push(await inventory(join(dir,'lib')))
    }
    assert(Object.keys(results[0]).length>10,'Expected complete declaration and bundle outputs')
    assert.deepEqual(results[0],results[1])
  } finally {
    // Only the test-owned mkdtemp tree. rm does not follow dependency symlinks.
    await rm(temp,{recursive:true})
  }
})
