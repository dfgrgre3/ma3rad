const fs=require('fs'),path=require('path');
const tables=['product_batches','product_variants','price_list_items','customer_price_overrides','inventory_transactions','inventory_cost_layers','inventory_special_stocks','stock_transfers','stock_transfer_items','stock_counts','stock_count_items','stock_adjustments','stock_adjustment_items','inventory_reconciliation_logs'];
const moneyRe=/\b(unit_cost|total_cost|cost_price|selling_price_m2|selling_price_box|wholesale_price_m2|min_selling_price_m2|price_m2|price_box|total_value|variance_value|total_variance_value|total_physical_cost|total_fifo_layer_cost|total_gl_inventory_cost|variance_physical_vs_fifo|variance_fifo_vs_gl)\b/;
const hits=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory()){if(e.name==='migrations'||e.name==='schema')continue;walk(p);continue;}
 if(!/\.(ts|tsx)$/.test(e.name))continue;
 const lines=fs.readFileSync(p,'utf8').split('\n');
 lines.forEach((l,i)=>{
   if(/SELECT|INSERT|UPDATE|DELETE|FROM|JOIN|SUM|AVG|WHERE/.test(l)&&moneyRe.test(l))
     hits.push(p+':'+(i+1)+': '+l.trim().slice(0,120));
 });}}
walk('src');
console.log(hits.length+' hits');
console.log([...new Set(hits.map(h=>h.split(':')[0]))].join('\n'));
