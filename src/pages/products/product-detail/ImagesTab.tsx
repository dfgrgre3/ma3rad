import React, { useEffect, useState } from 'react';
import { Star, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { ProductExtraService, ProductImage } from '../../../services/ProductExtraService';

interface ImagesTabProps {
  productId: string;
  canEdit: boolean;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({ productId, canEdit }) => {
  const service = new ProductExtraService();
  const [rows, setRows] = useState<ProductImage[]>([]);
  const [filePath, setFilePath] = useState('');
  const [caption, setCaption] = useState('');

  const load = () => { try { setRows(service.getImages(productId)); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [productId]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath.trim()) return;
    try { service.addImage(productId, filePath.trim(), caption.trim() || undefined); setFilePath(''); setCaption(''); load(); }
    catch (err: any) { alert(err?.message); }
  };

  const remove = (id: string) => {
    if (!confirm('حذف هذه الصورة؟')) return;
    try { service.deleteImage(id); load(); } catch (err: any) { alert(err?.message); }
  };

  const makePrimary = (id: string) => {
    try { service.setPrimaryImage(productId, id); load(); } catch (err: any) { alert(err?.message); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form onSubmit={add} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">مسار الصورة أو رابطها</label>
            <input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="https://... أو C:\\images\\tile.jpg" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-700 mb-1">وصف الصورة</label>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="مثال: صورة أمامية" className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs" />
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer">
            <Upload className="w-4 h-4" /> اختيار ملف
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFilePath((f as any).path || f.name); }} />
          </label>
          <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold">إضافة</button>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 text-center text-slate-500 py-12 text-sm">لا توجد صور لهذا المنتج</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {rows.map((img) => (
            <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
                <img src={img.filePath} alt={img.caption || ''} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                  {img.isPrimary ? <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> : <ImageIcon className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="truncate">{img.caption || 'صورة المنتج'}</span>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {!img.isPrimary && <button onClick={() => makePrimary(img.id)} className="text-[10px] font-bold text-sky-600 hover:bg-sky-50 rounded-lg px-2 py-1">تعيين كرئيسية</button>}
                    <button onClick={() => remove(img.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
