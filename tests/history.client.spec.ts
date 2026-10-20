import {describe,it,expect,vi} from 'vitest'
import {historyReader} from '../src/client/history.ts'
const id='child' as never
const empty={ok:true as const,value:{events:[],hasMore:false}}
describe('declared wire history adaptation',()=>{
 it('preserves legacy receiver and does not call wire when legacy works',async()=>{const wire={history:vi.fn()};const legacy={marker:empty,async history(){return this.marker}};expect(await historyReader(legacy,wire).read(id,{maxMessages:50})).toEqual(empty);expect(wire.history).not.toHaveBeenCalled()})
 it('uses current public wire history and preserves pagination and receiver',async()=>{const wire={marker:empty,history:vi.fn(async function(this:any,_payload:any){return {result:this.marker}})};const reader=historyReader({},wire);expect(reader.available()).toBe(true);expect(await reader.read(id,{maxMessages:50,beforeSeq:100})).toEqual(empty);expect(wire.history).toHaveBeenCalledExactlyOnceWith({sessionId:'child',maxMessages:50,beforeSeq:100})})
 it('never falls back after a legacy business rejection',async()=>{const denied={ok:false as const,error:{code:'internal' as const,message:'read denied',details:{}}};const wire={history:vi.fn()};expect(await historyReader({history:async()=>denied},wire).read(id,{})).toEqual(denied);expect(wire.history).not.toHaveBeenCalled()})
 it('reports no capability without guessing a delete method',async()=>{const reader=historyReader({});expect(reader.available()).toBe(false);expect((await reader.read(id,{})).ok).toBe(false)})
 it('converts transport exceptions into a displayable history failure',async()=>{const reader=historyReader({}, {history:async()=>{throw Error('offline')}});expect((await reader.read(id,{}))).toMatchObject({ok:false,error:{message:'offline'}})})
 it('rejects malformed wire results instead of causing an unhandled panel failure',async()=>{const reader=historyReader({}, {history:async()=>({result:{ok:true,value:{}} as never})});expect(await reader.read(id,{})).toMatchObject({ok:false,error:{message:'Invalid session history response'}})})
})
