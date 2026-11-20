import React from 'react';
import { Building2, DoorOpen, Plus, Ruler, Trash2 } from 'lucide-react';
import { getRoomMeasures, getRoomWallLength } from '../estimateCalculations';
import { fieldClass, fmt, makeId, newRoom, parsePolygonCoordinates, type Room } from './estimateModel';
import { Metric, NumberInput } from './EstimateUi';

export const RoomsSection: React.FC<{
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  patchRoom: (id: string, patch: Partial<Room>) => void;
}> = ({ rooms, setRooms, patchRoom }) => {
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Ruler className="h-5 w-5 text-primary" /><div><h2 className="font-black text-ink">تقسيم الشقة والغرف</h2><p className="text-xs text-muted">المساحة الصافية للحوائط تخصم فتحات الأبواب والنوافذ.</p></div></div>
          <button type="button" onClick={() => setRooms((current) => [...current, newRoom()])} className="inline-flex items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-xs font-bold text-primary"><Plus className="h-4 w-4" /> إضافة غرفة</button>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rooms.map((room, index) => {
            const measures = getRoomMeasures(room);
            return (
              <article key={room.id} className="rounded-xl border border-line p-3">
                <header className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-sunken text-xs font-black text-ink-secondary">{index + 1}</span><input aria-label="اسم الغرفة" value={room.name} onChange={(event) => patchRoom(room.id, { name: event.target.value })} className="max-w-56 border-b border-line bg-transparent px-1 py-1 font-bold outline-none focus:border-primary" /></div>
                  {rooms.length > 1 && <button type="button" aria-label="حذف الغرفة" onClick={() => setRooms((current) => current.filter((entry) => entry.id !== room.id))} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                </header>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-bold text-muted">شكل الغرفة<select value={room.shape || 'rectangle'} onChange={(event) => {
                    const shape = event.target.value as Room['shape'];
                    if (shape === 'polygon') {
                      const vertices = room.polygonVertices?.length ? room.polygonVertices : [{ x: 0, y: 0 }, { x: room.length, y: 0 }, { x: room.length, y: room.width }, { x: 0, y: room.width }];
                      const walls = room.walls?.length === vertices.length ? room.walls : vertices.map((_, wallIndex) => ({ id: makeId(), name: `جدار ${wallIndex + 1}`, length: 0, height: room.height }));
                      patchRoom(room.id, { shape, polygonVertices: vertices, polygonCoordinatesInput: vertices.map((point) => `${point.x},${point.y}`).join('; '), walls });
                    } else patchRoom(room.id, { shape });
                  }} className={`${fieldClass()} mt-1`}><option value="rectangle">مستطيلة</option><option value="polygon">غير منتظمة / متعددة الأضلاع</option></select></label>
                  {room.shape === 'polygon' && <label className="text-[11px] font-bold text-muted">إحداثيات الرؤوس (س،ص بالمتر) مفصولة بفاصلة منقوطة<input value={room.polygonCoordinatesInput ?? (room.polygonVertices || []).map((point) => `${point.x},${point.y}`).join('; ')} onChange={(event) => {
                    const polygonCoordinatesInput = event.target.value;
                    const polygonVertices = parsePolygonCoordinates(polygonCoordinatesInput);
                    patchRoom(room.id, { polygonCoordinatesInput, polygonVertices });
                  }} className={`${fieldClass()} mt-1`} placeholder="0,0; 4,0; 3.5,3; 0,3" /><span className="mt-1 block font-normal text-muted">أدخل 3 رؤوس أو أكثر بالترتيب حول محيط الغرفة؛ المساحة تحسب من الإحداثيات.</span></label>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <NumberInput label="الطول (م)" value={room.length} min={0} onChange={(length) => patchRoom(room.id, { length })} />
                  <NumberInput label="العرض (م)" value={room.width} min={0} onChange={(width) => patchRoom(room.id, { width })} />
                  <NumberInput label="الارتفاع (م)" value={room.height} min={0} onChange={(height) => patchRoom(room.id, { height })} />
                </div>
                <div className="mt-3 rounded-lg border border-accent-border bg-accent-soft/50 p-2">
                  <div className="mb-2 flex items-center justify-between"><b className="text-[11px] text-primary">تقسيم الجدران وفتحات كل جدار</b><button type="button" onClick={() => patchRoom(room.id, { walls: [...(room.walls || []), { id: makeId(), name: `جدار ${(room.walls || []).length + 1}`, length: 2, height: room.height } ] })} className="text-[11px] font-bold text-primary">+ إضافة جدار / تقسيم</button></div>
                  <div className="space-y-2">{(room.walls || []).map((wall) => <div key={wall.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <input aria-label="اسم الجدار" value={wall.name} onChange={(event) => patchRoom(room.id, { walls: room.walls?.map((item) => item.id === wall.id ? { ...item, name: event.target.value } : item) })} className={`${fieldClass()} text-xs`} />
                    {room.shape === 'polygon' ? <div className="self-end rounded-lg bg-surface-muted px-2 py-2 text-[10px] text-ink-secondary">طول الضلع: {fmt(getRoomWallLength(room, wall.id))} م</div> : <NumberInput label="طول م" value={wall.length} min={0} step={0.1} onChange={(length) => patchRoom(room.id, { walls: room.walls?.map((item) => item.id === wall.id ? { ...item, length } : item) })} />}
                    <NumberInput label="ارتفاع م" value={wall.height} min={0} step={0.1} onChange={(height) => patchRoom(room.id, { walls: room.walls?.map((item) => item.id === wall.id ? { ...item, height } : item) })} />
                    <select aria-label="نوع الفتحة" className={fieldClass()} onChange={(event) => { const openings = room.openings || []; patchRoom(room.id, { openings: [...openings, { id: makeId(), wallId: wall.id, kind: event.target.value as 'door' | 'window', name: event.target.value === 'door' ? 'باب' : 'شباك', count: 1, width: event.target.value === 'door' ? 0.9 : 1.2, height: event.target.value === 'door' ? 2.1 : 1.2 }] }); event.target.value = ''; }} value=""><option value="">+ فتحة</option><option value="door">باب</option><option value="window">شباك</option></select>
                    {(room.shape !== 'polygon' || (room.walls || []).findIndex((item) => item.id === wall.id) >= (room.polygonVertices || []).length) && <button type="button" onClick={() => patchRoom(room.id, { walls: room.walls?.filter((item) => item.id !== wall.id), openings: room.openings?.filter((item) => item.wallId !== wall.id) })} className="rounded-lg text-xs text-danger">حذف</button>}
                    {(room.openings || []).filter((opening) => opening.wallId === wall.id).map((opening) => <div key={opening.id} className="col-span-2 grid grid-cols-2 gap-1 rounded bg-surface p-1 sm:col-span-5 sm:grid-cols-5"><span className="self-center text-[10px]">{opening.name}</span><NumberInput label="عدد" value={opening.count} min={0} onChange={(count) => patchRoom(room.id, { openings: room.openings?.map((item) => item.id === opening.id ? { ...item, count } : item) })} /><NumberInput label="عرض" value={opening.width} min={0} step={0.1} onChange={(width) => patchRoom(room.id, { openings: room.openings?.map((item) => item.id === opening.id ? { ...item, width } : item) })} /><NumberInput label="ارتفاع" value={opening.height} min={0} step={0.1} onChange={(height) => patchRoom(room.id, { openings: room.openings?.map((item) => item.id === opening.id ? { ...item, height } : item) })} /><button type="button" onClick={() => patchRoom(room.id, { openings: room.openings?.filter((item) => item.id !== opening.id) })} className="col-span-2 text-right text-[10px] text-danger sm:col-span-5">حذف الفتحة</button></div>)}
                  </div>)}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NumberInput label="طول البلكونة م" value={room.balconyLength || 0} min={0} step={0.1} onChange={(balconyLength) => patchRoom(room.id, { balconyLength })} />
                  <NumberInput label="عرض البلكونة م" value={room.balconyWidth || 0} min={0} step={0.1} onChange={(balconyWidth) => patchRoom(room.id, { balconyWidth })} />
                  <NumberInput label="نقاط الكهرباء" value={room.electricalPoints || 0} min={0} onChange={(electricalPoints) => patchRoom(room.id, { electricalPoints })} />
                  <NumberInput label="نقاط السباكة" value={room.plumbingPoints || 0} min={0} onChange={(plumbingPoints) => patchRoom(room.id, { plumbingPoints })} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-surface-muted p-2">
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-ink-secondary"><DoorOpen className="h-3.5 w-3.5" /> الأبواب</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <NumberInput label="عدد" value={room.doorCount} min={0} onChange={(doorCount) => patchRoom(room.id, { doorCount })} />
                      <NumberInput label="عرض" value={room.doorWidth} min={0} step={0.1} onChange={(doorWidth) => patchRoom(room.id, { doorWidth })} />
                      <NumberInput label="ارتفاع" value={room.doorHeight} min={0} step={0.1} onChange={(doorHeight) => patchRoom(room.id, { doorHeight })} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-muted p-2">
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-ink-secondary"><Building2 className="h-3.5 w-3.5" /> النوافذ</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <NumberInput label="عدد" value={room.windowCount} min={0} onChange={(windowCount) => patchRoom(room.id, { windowCount })} />
                      <NumberInput label="عرض" value={room.windowWidth} min={0} step={0.1} onChange={(windowWidth) => patchRoom(room.id, { windowWidth })} />
                      <NumberInput label="ارتفاع" value={room.windowHeight} min={0} step={0.1} onChange={(windowHeight) => patchRoom(room.id, { windowHeight })} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <Metric label="الأرضية" value={`${fmt(measures.floor)} م²`} />
                  <Metric label="الحيطان الصافية" value={`${fmt(measures.walls)} م²`} />
                  <Metric label="السقف" value={`${fmt(measures.ceiling)} م²`} />
                  <Metric label="المحيط" value={`${fmt(measures.perimeter)} م`} />
                </div>
              </article>
            );
          })}
        </div>
    </section>
  );
};
