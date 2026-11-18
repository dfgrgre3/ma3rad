const fs=require('fs');
const files=[
'src/services/domains/inventory-count/countSessionService_part04.ts',
'src/services/domains/inventory/InventoryReceiptService.ts',
'src/services/domains/inventory/InventoryServicePart06.ts',
'src/services/domains/inventory/InventoryServicePart07.ts',
'src/services/domains/inventory/InventoryServicePart09_part01.ts',
'src/services/domains/inventory/InventoryServicePart10.ts',
'src/services/domains/inventory/InventoryServicePart11.ts',
'src/services/domains/inventory/InventoryServicePart14.ts',
'src/services/domains/manufacturing/ManufacturingService.ts',
'src/services/domains/purchases/PurchaseReturnService.ts',
'src/services/domains/purchases/PurchaseService.ts',
'src/services/domains/sales/ReservationService.ts',
'src/services/domains/sales/invoiceCreation.ts',
'src/services/domains/sales/invoiceVoid.ts',
'src/services/domains/sales/returns.ts',
];
// For each INSERT INTO inventory_transactions, locate column list & VALUES placeholders,
// replace the ? at unit_cost/total_cost positions with ROUND(?*100).
for(const f of files){
  let s=fs.readFileSync(f,'utf8');let changed=0;
  const re=/INSERT INTO inventory_transactions\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/gi;
  s=s.replace(re,(m,cols,vals)=>{
    const colList=cols.split(',').map(c=>c.trim().toLowerCase());
    const targets=['unit_cost','total_cost'];
    const idxs=[];
    colList.forEach((c,i)=>{if(targets.includes(c))idxs.push(i);});
    if(!idxs.length)return m;
    // literal zeros stay; '?' placeholders get ROUND
    let parts=vals.split(',').map(x=>x.trim());
    // count placeholders vs literals: only replace '?' entries at target idx
    let pi=-1; // placeholder index tracker not needed: positional
    // parts may include literals like 'SALE' or 0 — positions still align 1:1 with cols
    let out=parts.map((p,i)=>{
      if(idxs.includes(i)&&p==='?')return 'ROUND(?*100)';
      return p;
    });
    changed++;
    return m.replace(vals,out.join(', '));
  });
  fs.writeFileSync(f,s);
  console.log(f,changed);
}
