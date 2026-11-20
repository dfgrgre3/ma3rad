const fs=require('fs'),path=require('path');
const hits=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory()){if(e.name==='migrations'||e.name==='schema')continue;walk(p);continue;}
 if(!/\.(ts|tsx)$/.test(e.name))continue;
 const lines=fs.readFileSync(p,'utf8').split('\n');
 lines.forEach((l,i)=>{
   if(/inventory_transactions|inventory_cost_layers|inventory_cost_allocations|inventory_special_stocks|stock_transfers|stock_transfer_items|stock_counts|stock_count_items|stock_adjustments|stock_adjustment_items|inventory_reconciliation_logs|product_batches|product_variants|price_list_items|customer_price_overrides/.test(l)
      && /unit_cost|total_cost|cost_price|price_m2|price_box|total_value|variance_value|total_variance_value|selling_price|wholesale_price|min_selling/.test(l))
     hits.push(p+':'+(i+1)+': '+l.trim().slice(0,150));
 });}}
walk('src');
fs.writeFileSync('it_hits.txt',hits.join('\n'));
console.log(hits.length);
