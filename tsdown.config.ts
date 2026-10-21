/** Standalone MyDSH build: no sibling monorepo helper is required. */
import {readFile} from 'node:fs/promises'
import {basename,dirname,resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {transform} from 'lightningcss'
import {defineConfig} from 'tsdown'
const id='@deepseek-ai/dsh-client-ui-side-tasks'
const projectRoot=dirname(fileURLToPath(import.meta.url))
const external=['react','react/jsx-runtime','@deepseek-ai/dsh-client-runtime/client']
const cssPrefix='\0mydsh-css:'
export default defineConfig([
  {entry:['src/index.ts','src/invariant.ts'],outDir:'lib',format:'esm',platform:'node',clean:false,dts:false,outputOptions:{entryFileNames:'[name].js'}},
  {
    entry:{client:'src/client/index.ts'},outDir:'lib',format:'cjs',platform:'browser',clean:false,dts:false,sourcemap:true,
    external,noExternal:source=>external.includes(source)?undefined:true,
    define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{
      name:'mydsh-css-modules',
      resolveId(source,importer){if(source.endsWith('.module.css'))return cssPrefix+resolve(dirname(importer!),source)+'.mjs'},
      async load(moduleId){
        if(!moduleId.startsWith(cssPrefix))return
        const path=moduleId.slice(cssPrefix.length,-4)
        this.addWatchFile(path)
        const result=transform({filename:relative(projectRoot,path),code:await readFile(path),cssModules:{pattern:'[hash]_[local]'},minify:true})
        const classes=Object.fromEntries(Object.entries(result.exports??{}).map(([key,value])=>[key,value.name]))
        const tag=id+'/'+basename(path)
        return `if(typeof document!=='undefined'&&!document.querySelector('style[data-plugin-css='+JSON.stringify(${JSON.stringify(tag)})+']')){const s=document.createElement('style');s.dataset.plugin=${JSON.stringify(id)};s.dataset.pluginCss=${JSON.stringify(tag)};s.textContent=${JSON.stringify(result.code.toString())};document.head.appendChild(s)};export default ${JSON.stringify(classes)}`
      },
    }],
    outputOptions:{entryFileNames:'client.js',banner:`window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:(require)=>{`,intro:'var module={exports:{}};var exports=module.exports;',footer:'return module.exports;}});'},
  },
])
