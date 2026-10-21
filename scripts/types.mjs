#!/usr/bin/env node
/** Check/emit against the compiled types of an explicit, pinned DSH checkout. */
import ts from 'typescript'
import {existsSync} from 'node:fs'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const sdk=process.env.DSH_CHECKOUT && resolve(process.env.DSH_CHECKOUT)
if(!sdk || !existsSync(resolve(sdk,'tsconfig.base.json'))) {
  console.error('Set DSH_CHECKOUT to the tested DeepSeek Harness checkout with built declarations.')
  process.exit(1)
}
const args=process.argv.slice(2)
if(args.some(x=>x!=='--emit')) throw new Error('Only --emit is supported')
const base=ts.readConfigFile(resolve(sdk,'tsconfig.base.json'),ts.sys.readFile)
const own=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile)
if(base.error || own.error) throw new Error('Unable to read the project/SDK type configuration')
const paths=Object.fromEntries(Object.entries(base.config.compilerOptions.paths).map(([key,values])=>[
  key,values.map(p=>resolve(sdk,p.replace(/\/src(?=\/|$)/,'/lib/types').replace(/\.tsx?$/,'.d.ts'))),
]))
// Resolve React's declarations, never React's JS implementation. Installed
// project dependencies win; the explicit SDK's runtime dev dependencies are a
// fallback for isolated checks. There is no fake ambient module or any shim.
const require=createRequire(import.meta.url)
const reactRoot=dirname(require.resolve('@types/react/package.json',{paths:[root,resolve(sdk,'packages/client/runtime')]}))
for(const [key,file] of [['react','index.d.ts'],['react/jsx-runtime','jsx-runtime.d.ts'],['react/jsx-dev-runtime','jsx-dev-runtime.d.ts']]) paths[key]=[resolve(reactRoot,file)]
const emit=args.includes('--emit')
const config=ts.parseJsonConfigFileContent({...own.config,compilerOptions:{...own.config.compilerOptions,
  paths,allowImportingTsExtensions:true,noEmit:!emit,emitDeclarationOnly:emit,
  declaration:true,declarationMap:true,rootDir:resolve(root,'src'),outDir:resolve(root,'lib/types'),
},include:['src']},ts.sys,root)
const program=ts.createProgram(config.fileNames,config.options)
let diagnostics=[...config.errors,...ts.getPreEmitDiagnostics(program)]
if(!diagnostics.length && emit) diagnostics=[...program.emit().diagnostics]
if(diagnostics.length){
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}))
  process.exit(1)
}
console.log(emit?'Declaration build passed (SDK compiled types).':'Typecheck passed (SDK compiled types).')
