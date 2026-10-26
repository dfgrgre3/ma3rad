import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ProductImportRow } from '../services/ProductImportService';
interface Props { rows: ProductImportRow[] }
export const ProductImportPreviewTable: React.FC<Props> = ({ rows }) => (
<table className="w-full text-xs text-right">
                  <thead className="bg-slate-50 text-[10px] text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">الكود</th><th className="px-2 py-2">الاسم</th><th className="px-2 py-2">التصنيف</th><th className="px-2 py-2">الماركة</th><th className="px-2 py-2">المقاس</th><th className="px-2 py-2">سعر المتر</th><th className="px-2 py-2">الحالة</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className={row.errors.length ? 'bg-rose-50/40' : ''}>
                        <td className="px-2 py-1.5 text-slate-400">{row.rowNumber}</td>
                        <td className="px-2 py-1.5 font-mono">{row.sku}</td>
                        <td className="px-2 py-1.5 font-semibold">{row.name}</td>
                        <td className="px-2 py-1.5">{row.category}</td>
                        <td className="px-2 py-1.5">{row.brand}</td>
                        <td className="px-2 py-1.5 font-mono">{row.size}</td>
                        <td className="px-2 py-1.5 font-mono">{row.sellingPriceM2}</td>
                        <td className="px-2 py-1.5">
                          {row.errors.length === 0
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> جاهز</span>
                            : <span className="text-rose-600 text-[10px]" title={row.errors.join('، ')}>{row.errors[0]}{row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
);
