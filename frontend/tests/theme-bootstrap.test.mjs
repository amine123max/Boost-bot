import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../boost-theme.js',import.meta.url),'utf8');
function boot(value,systemDark=false,preferences={}){
  const properties={};
  const element={dataset:{},style:{setProperty:(key,value)=>properties[key]=value},properties};
  runInNewContext(source,{localStorage:{getItem:key=>key==='boost.ui.v1'?JSON.stringify(preferences):value},document:{documentElement:element},matchMedia:()=>({matches:systemDark})});
  return element;
}
test('cached light theme is applied before app/RPC load even on a dark operating system',()=>{
  const root=boot('light',true);
  assert.equal(root.dataset.theme,'light');
  assert.equal(root.style.colorScheme,'light');
  assert.equal(root.style.backgroundColor,'#f5f5f6');
});

test('saved typography is present before the SPA and remains within the supported bounds',()=>{
  const root=boot('dark',false,{typographyVersion:1,fontSize:13,fontWeight:500,letterSpacing:1,density:'comfortable'});
  assert.equal(root.style.backgroundColor,'#0e0e0e');
  assert.equal(root.properties['--font-scale'],String(13/14));
  assert.equal(root.properties['--data-font-scale'],String(13/15));
  assert.equal(root.properties['--ui-body-weight'],'500');
  assert.equal(root.properties['--ui-letter-spacing'],'1px');
  assert.equal(root.dataset.density,'comfortable');
  const bounded=boot('light',false,{typographyVersion:1,fontSize:100,fontWeight:900,letterSpacing:-4});
  assert.equal(bounded.properties['--font-scale'],String(16/14));
  assert.equal(bounded.properties['--ui-body-weight'],'400');
  assert.equal(bounded.properties['--ui-letter-spacing'],'-0.3px');
});
test('default and prior default typography are normalized before first paint',()=>{
  const fresh=boot('dark');
  assert.equal(fresh.properties['--font-scale'],String(13/14));
  assert.equal(fresh.properties['--data-font-scale'],String(13/15));
  assert.equal(fresh.properties['--ui-letter-spacing'],'0px');
  const versionOne=boot('dark',false,{typographyVersion:1,fontSize:15,fontWeight:400,letterSpacing:.5});
  assert.equal(versionOne.properties['--font-scale'],String(13/14));
  assert.equal(versionOne.properties['--ui-letter-spacing'],'0px');
  const versionTwo=boot('dark',false,{typographyVersion:2,fontSize:14,fontWeight:400,letterSpacing:0});
  assert.equal(versionTwo.properties['--font-scale'],String(13/14));
});
test('system appearance is resolved before first paint and invalid cache falls back to system',()=>{
  assert.equal(boot('system',true).style.colorScheme,'dark');
  assert.equal(boot('invalid',false).style.colorScheme,'light');
});

test('saved accent is available before RPC and invalid accent keeps the default',()=>{
  for (const color of ['green','emerald','teal','cyan','sky','blue','indigo','violet','purple','pink','fuchsia','rose','red','orange','amber','yellow','lime']) {
    for (const mode of ['light','dark','system']) {
      const root=boot(mode,true,{themeColor:color});
      assert.equal(root.dataset.accent,color);
      assert.equal(root.properties['--blue'],undefined);
    }
  }
  for (const themeColor of [undefined,null,'invalid','#fff',{},1])
    assert.equal(boot('dark',false,{themeColor}).dataset.accent,'teal');
});
