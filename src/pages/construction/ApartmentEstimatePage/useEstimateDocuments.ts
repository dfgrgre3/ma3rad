import { useNavigate } from 'react-router-dom';
import { validateEstimateMeasurements } from '../../../services/domains/projects/estimateValidation';
import { buildExportHtml, downloadPdf, exportToExcel, type ExportOptions } from '../../../utils/export/export';
import { openWhatsAppChat } from '../../../utils/shared/externalLinks';
import { getMeasureFormula, getQuantity, getRoomLineTotal, getRoomMeasures } from '../estimateCalculations';
import { fmt, isUnitCompatible } from './estimateModel';
import type { ApartmentEstimateState } from './useApartmentEstimateState';

export const useEstimateDocuments = (s: ApartmentEstimateState) => {
  const navigate = useNavigate();
  const {
    quotationService, projectEstimateService, customers, projects, warehouses, products,
    projectId, selectedEstimateId, projectEstimates, versions,
    apartmentName, apartmentArea, documentTerms, customerId, warehouseId,
    rooms, lines, payments, paidAmount, contingencyPercent, taxPercent,
    inputApartmentArea, estimateTotal, totalCost, grossProfit, totalArea,
    contingencyAmount, taxAmount, grandTotal, totalPaid, remainingAmount,
    canCreateQuotation, getLineQuantity,
    setDataError, setSaving,
  } = s;

  const createQuotation = () => {
    if (!canCreateQuotation) {
      setDataError('لا تملك صلاحية إنشاء عروض الأسعار. يمكنك إعداد المقايسة، لكن يلزم منح صلاحية عروض الأسعار لإصدارها.');
      return;
    }
    if (!customerId) { setDataError('اختر العميل قبل إصدار عرض السعر.'); return; }
    const validationErrors = validateEstimateMeasurements({ name: apartmentName || 'المقايسة', areaM2: inputApartmentArea, rooms, costLines: lines, payments, paidAmount, contingencyPercent, taxPercent, totalAmount: estimateTotal, totalPayable: grandTotal });
    if (validationErrors.length) { setDataError(`لا يمكن إصدار عرض السعر قبل تصحيح: ${validationErrors.slice(0, 4).join('، ')}`); return; }
    const activeLines = lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0);
    if (!activeLines.length || grandTotal <= 0) { setDataError('أضف بندًا بكمية وسعر صالحين قبل إصدار عرض السعر.'); return; }
    setSaving(true);
    setDataError('');
    try {
      const savedEstimate = projectId ? projectEstimates.find((estimate) => estimate.id === selectedEstimateId) || null : null;
      const approvedVersion = projectId ? versions.find((version) => version.id === savedEstimate?.currentVersionId) : undefined;
      if (projectId && (!savedEstimate || !approvedVersion || approvedVersion.status !== 'APPROVED')) {
        setDataError('لا يمكن إصدار عرض سعر مرتبط بمشروع إلا من إصدار مقايسة معتمد. احفظ التعديلات كإصدار جديد وأرسله للاعتماد أولًا.');
        setSaving(false);
        return;
      }
      if (projectId && approvedVersion) {
        const snapshot = approvedVersion.snapshot;
        const snapshotQuantities = snapshot.lineQuantities || {};
        const sameLines = JSON.stringify(snapshot.costLines) === JSON.stringify(lines)
          && JSON.stringify(snapshot.rooms) === JSON.stringify(rooms)
          && snapshot.name === (apartmentName.trim() || projects.find((project) => project.id === projectId)?.name || 'تصميم الشقة')
          && Math.abs(Number(snapshot.areaM2) - inputApartmentArea) < 0.005
          && Math.abs(Number(snapshot.totalAmount) - estimateTotal) < 0.005
          && Math.abs(Number(snapshot.contingencyPercent || 0) - contingencyPercent) < 0.005
          && Math.abs(Number(snapshot.taxPercent || 0) - taxPercent) < 0.005
          && (snapshot.terms || '') === documentTerms
          && lines.every((line) => Math.abs(Number(snapshotQuantities[line.id] ?? line.manualQuantity) - getLineQuantity(line)) < 0.0001);
        if (!sameLines) {
          setDataError('البيانات المعروضة تختلف عن الإصدار المعتمد؛ احفظها كإصدار جديد ثم أعد دورة المراجعة قبل إصدار العرض.');
          setSaving(false);
          return;
        }
      }
      const quoteNotes = [
        `مقايسة تشطيب: ${apartmentName.trim() || 'الشقة'}`,
        `المساحة المدخلة: ${inputApartmentArea} م² | المساحة المحسوبة للغرف: ${fmt(totalArea)} م²`,
        `عدد الغرف: ${rooms.length}`,
        `الشروط: ${documentTerms}`,
        `تكلفة التنفيذ: ${fmt(totalCost)} ج | سعر البيع: ${fmt(estimateTotal)} ج | الربح: ${fmt(grossProfit)} ج | احتياطي ${fmt(contingencyPercent)}%: ${fmt(contingencyAmount)} ج | ضريبة ${fmt(taxPercent)}%: ${fmt(taxAmount)} ج | الإجمالي النهائي: ${fmt(grandTotal)} ج | مدفوع: ${fmt(totalPaid)} ج | متبقي: ${fmt(remainingAmount)} ج`,
        ...rooms.map((room) => {
          const measures = getRoomMeasures(room);
          return `${room.name}: ${room.length}×${room.width}×${room.height}م، أرضية ${fmt(measures.floor)}م²، حوائط صافية ${fmt(measures.walls)}م²`;
        }),
        'البنود (السعر يشمل الخامات والمصنعية والهالك والخصم والربح المحددة في المقايسة):',
        ...activeLines.map((line) => {
          const totalQuantity = rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
          const linkedProduct = products.find((product) => product.id === line.materialProductId);
          const compatibleProduct = linkedProduct && isUnitCompatible(linkedProduct, line.unit);
          return `${line.category} - ${line.name}: كمية ${fmt(totalQuantity)} ${line.unit}; خامات ${fmt(line.materialRate)}/${line.unit}; مصنعية ${fmt(line.laborRate)}/${line.unit}; هالك ${fmt(line.wastePercent)}%; خصم ${fmt(line.discountPercent)}%; ربح ${fmt(line.profitPercent)}%${compatibleProduct ? `; صنف المخزون: ${linkedProduct.name}` : linkedProduct ? `; لم يربط الصنف ${linkedProduct.name} لاختلاف الوحدة` : ''}`;
        }),
        `المخزن المرجعي: ${warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || 'غير محدد'}`,
      ].join('\n');
      const serviceItems = activeLines.map((line) => {
        const quantity = rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
        const lineTotal = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
        return {
          productId: line.materialProductId && products.some((product) =>
            product.id === line.materialProductId && isUnitCompatible(product, line.unit))
            ? line.materialProductId
            : undefined,
          description: `${line.workType === 'FOUNDATION' ? 'تأسيس' : 'تشطيب'} — ${line.phase || ''} — ${line.category}: ${line.name}${line.specifications ? ` | المواصفات: ${line.specifications}` : ''}${line.notes ? ` | ملاحظات: ${line.notes}` : ''}`,
          unit: line.unit,
          quantity,
          unitPrice: quantity ? lineTotal / quantity : 0,
        };
      });
      const adjustment = grandTotal - estimateTotal;
      if (adjustment > 0.005) serviceItems.push({
        productId: undefined,
        description: `احتياطي ${fmt(contingencyPercent)}% وضريبة ${fmt(taxPercent)}%`,
        unit: 'مقطوعية', quantity: 1, unitPrice: adjustment,
      });
      const quotation = quotationService.createQuotation({
        customerId,
        projectId: projectId || undefined,
        warehouseId: warehouseId || undefined,
        validDays: 15,
        notes: quoteNotes,
        serviceItems,
      });
      if (savedEstimate && projectId) {
        try {
          projectEstimateService.linkQuotation(savedEstimate.id, projectId, quotation.id, approvedVersion?.id);
        } catch (error) {
          setDataError(`تم إصدار عرض السعر ${quotation.quotationNumber} وربطه بالمشروع، لكن تعذر ربطه بتصميم الشقة: ${error instanceof Error ? error.message : String(error)}`);
          window.alert(`تم إنشاء عرض السعر ${quotation.quotationNumber} وربطه بالمشروع، لكن تعذر ربطه بسجل التصميم. راجع المشروع قبل إعادة المحاولة.`);
          navigate('/quotations');
          return;
        }
      }
      window.alert(`تم إنشاء عرض السعر ${quotation.quotationNumber} بالمقايسة كاملة. يمكنك مراجعته وتعديله وطباعته من عروض الأسعار.`);
      navigate('/quotations');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'خطأ غير معروف.';
      setDataError(`${projectId ? 'تعذر حفظ تصميم المشروع أو إصدار عرض السعر' : 'تعذر إصدار عرض السعر'}: ${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const buildEstimateDocument = (kind: 'detailed' | 'summary'): ExportOptions => {
    const validationErrors = validateEstimateMeasurements({ name: apartmentName || 'المقايسة', areaM2: inputApartmentArea, rooms, costLines: lines, payments, paidAmount, contingencyPercent, taxPercent, totalAmount: estimateTotal, totalPayable: grandTotal });
    if (validationErrors.length) throw new Error(`صحح بيانات المقايسة قبل استخراج المستند: ${validationErrors.slice(0, 4).join('، ')}`);
    const customerName = customers.find((customer) => customer.id === customerId)?.name
      || projects.find((project) => project.id === projectId)?.customerName || 'عميل';
    const customerPhone = customers.find((customer) => customer.id === customerId)?.phone || '';
    const projectName = projects.find((project) => project.id === projectId)?.name || '';
    const lineRows = lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0).map((line) => {
      const quantity = getLineQuantity(line);
      const lineTotal = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
      return {
        recordType: 'بند أعمال', phase: line.phase || '', category: line.category, description: line.name,
        formula: rooms.map((room) => `${room.name}: ${getMeasureFormula(line, room, rooms.length)}`).join(' | '),
        unit: line.unit, quantity: Number(quantity.toFixed(3)), materialRate: line.materialRate,
        laborRate: line.laborRate, equipmentRate: line.equipmentRate || 0, expenseRate: line.expenseRate || 0,
        saleRate: Number((quantity ? lineTotal / quantity : 0).toFixed(2)), total: Number(lineTotal.toFixed(2)), specifications: line.specifications || '', notes: line.notes || '',
      };
    });
    const measurementRows = rooms.map((room) => {
      const measures = getRoomMeasures(room);
      return {
        recordType: 'قياسات غرفة', phase: '', category: 'قياسات', description: room.name,
        formula: `${room.length} × ${room.width} × ${room.height} م | أرضية ${fmt(measures.floor)} م² | حوائط ${fmt(measures.walls)} م² | محيط ${fmt(measures.perimeter)} م`,
        unit: 'متعدد', quantity: '', materialRate: '', laborRate: '', equipmentRate: '', expenseRate: '', total: '',
        specifications: `أبواب ${room.doorCount}، نوافذ ${room.windowCount}، بلكونة ${room.balconyLength || 0} × ${room.balconyWidth || 0} م، كهرباء ${room.electricalPoints || 0} نقطة، سباكة ${room.plumbingPoints || 0} نقطة`,
        notes: (room.openings || []).map((opening) => `${opening.name}: ${opening.count} × ${opening.width} × ${opening.height} م`).join(' | '),
      };
    });
    const columns = kind === 'detailed' ? [
      { key: 'recordType', label: 'نوع السجل' }, { key: 'phase', label: 'المرحلة' }, { key: 'category', label: 'التصنيف' },
      { key: 'description', label: 'البند / الغرفة' }, { key: 'formula', label: 'معادلة القياس' }, { key: 'unit', label: 'الوحدة' },
      { key: 'quantity', label: 'الكمية', type: 'qty' }, { key: 'materialRate', label: 'خامات/وحدة', type: 'currency' },
      { key: 'laborRate', label: 'عمالة/وحدة', type: 'currency' }, { key: 'equipmentRate', label: 'معدات/وحدة', type: 'currency' },
      { key: 'expenseRate', label: 'مصروفات/وحدة', type: 'currency' }, { key: 'saleRate', label: 'سعر البيع/وحدة', type: 'currency' }, { key: 'total', label: 'الإجمالي', type: 'currency' },
      { key: 'specifications', label: 'المواصفات' }, { key: 'notes', label: 'ملاحظات' },
    ] : [
      { key: 'category', label: 'التصنيف / المرحلة' }, { key: 'description', label: 'الأعمال' },
      { key: 'unit', label: 'الوحدة' }, { key: 'quantity', label: 'الكمية', type: 'qty' },
      { key: 'total', label: 'القيمة', type: 'currency' }, { key: 'specifications', label: 'المواصفات' },
    ];
    let rows: Array<Record<string, unknown>>;
    if (kind === 'detailed') rows = [...measurementRows, ...lineRows];
    else {
      const grouped = new Map<string, { quantity: number; total: number; lines: string[]; unit: string; specs: string[] }>();
      lineRows.forEach((row) => {
        const category = `${row.phase || row.category} · ${row.unit}`;
        const current = grouped.get(category) || { quantity: 0, total: 0, lines: [], unit: row.unit, specs: [] };
        current.quantity += Number(row.quantity) || 0; current.total += Number(row.total) || 0;
        current.lines.push(String(row.description)); if (row.specifications) current.specs.push(String(row.specifications));
        grouped.set(category, current);
      });
      rows = [...grouped.entries()].map(([category, group]) => ({ category, description: group.lines.join('، '), unit: group.unit, quantity: Number(group.quantity.toFixed(3)), total: Number(group.total.toFixed(2)), specifications: group.specs.join(' | ') }));
    }
    const paymentNotes = payments.length
      ? payments.map((payment, index) => `دفعة ${index + 1}: ${payment.date} · ${payment.method} · ${fmt(payment.amount)} ج${payment.reference ? ` · ${payment.reference}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`)
      : ['لا توجد دفعات مسجلة.'];
    const notes = [
      `العميل: ${customerName}${customerPhone ? ` · هاتف: ${customerPhone}` : ''}${projectName ? ` · المشروع: ${projectName}` : ''}`,
      ...rooms.map((room) => `قياس ${room.name}: ${room.length} × ${room.width} × ${room.height} م؛ أرضية ${fmt(getRoomMeasures(room).floor)} م²؛ حوائط صافية ${fmt(getRoomMeasures(room).walls)} م²؛ فتحات ${room.openings?.length || 0}؛ نقاط كهرباء ${room.electricalPoints || 0}؛ نقاط سباكة ${room.plumbingPoints || 0}.`),
      `شروط العرض: ${documentTerms || 'لا توجد شروط إضافية.'}`,
      ...paymentNotes,
      `التكلفة التقديرية: ${fmt(totalCost)} ج · سعر البنود: ${fmt(estimateTotal)} ج · الاحتياطي ${contingencyPercent}% (${fmt(contingencyAmount)} ج) · الضريبة ${taxPercent}% (${fmt(taxAmount)} ج) · الإجمالي النهائي ${fmt(grandTotal)} ج · المدفوع ${fmt(totalPaid)} ج · المتبقي ${fmt(remainingAmount)} ج.`,
    ];
    return {
      title: kind === 'detailed' ? `مقايسة تفصيلية — ${apartmentName || projectName || 'الشقة'}` : `ملخص عرض — ${apartmentName || projectName || 'الشقة'}`,
      subtitle: `العميل: ${customerName}${projectName ? ` · المشروع: ${projectName}` : ''} · التاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
      columns, rows, notes, permission: 'projects.print',
      fileName: `مقايسة-${kind === 'detailed' ? 'تفصيلية' : 'ملخص'}-${apartmentName || projectName || 'الشقة'}`,
      kpis: [
        { label: 'المساحة', value: `${fmt(inputApartmentArea)} م²` },
        { label: 'عدد البنود', value: lineRows.length }, { label: 'التكلفة', value: `${fmt(totalCost)} ج` },
        { label: 'الربح', value: `${fmt(grossProfit)} ج` }, { label: 'الإجمالي النهائي', value: `${fmt(grandTotal)} ج` },
        { label: 'المدفوع / المتبقي', value: `${fmt(totalPaid)} / ${fmt(remainingAmount)} ج` },
      ],
    };
  };

  const exportEstimateExcel = (kind: 'detailed' | 'summary') => {
    try { exportToExcel(buildEstimateDocument(kind)); setDataError(''); }
    catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تصدير ملف Excel.'); }
  };

  const saveEstimatePdf = async (kind: 'detailed' | 'summary') => {
    try {
      const report = buildEstimateDocument(kind);
      const html = buildExportHtml(report, true);
      await downloadPdf(html, report.fileName);
      setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر حفظ ملف PDF.'); }
  };

  const shareEstimateWithCustomer = (kind: 'detailed' | 'summary') => {
    try {
      const customer = customers.find((item) => item.id === customerId);
      if (!customer?.phone) { setDataError('أضف رقم هاتف العميل قبل إرسال المقايسة عبر واتساب.'); return; }
      const report = buildEstimateDocument(kind);
      const message = [
        `الأستاذ/ة ${customer.name}، مرفق ملخص ${kind === 'detailed' ? 'المقايسة التفصيلية' : 'عرض المقايسة'} لـ ${apartmentName || 'الشقة'}.`,
        `المساحة ${fmt(inputApartmentArea)} م² · البنود ${lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0).length} · الإجمالي ${fmt(grandTotal)} ج · المدفوع ${fmt(totalPaid)} ج · المتبقي ${fmt(remainingAmount)} ج.`,
        `الشروط: ${documentTerms || 'حسب البنود والقياسات المعتمدة.'}`,
        `تم إعداد المستند: ${report.title}. احفظ ملف PDF وأرفقه بالمحادثة قبل الإرسال.`,
      ].join('\n');
      openWhatsAppChat(customer.phone, message);
      setDataError('');
    } catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تجهيز رسالة العميل.'); }
  };

  return { createQuotation, buildEstimateDocument, exportEstimateExcel, saveEstimatePdf, shareEstimateWithCustomer };
};
