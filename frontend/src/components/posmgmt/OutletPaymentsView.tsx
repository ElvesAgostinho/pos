import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import { Wallet } from 'lucide-react';
import { useOutlets, useOutletPayments, useCreateOutletPayment, useDeleteOutletPayment } from '../../hooks/usePosMgmt';
import { useMdPaymentMethods } from '../../hooks/useMasterData';

export default function OutletPaymentsView() {
  const { data: outlets = [] } = useOutlets();
  const [outletId, setOutletId] = useState<number | null>(null);
  const { data: methods = [] } = useMdPaymentMethods();
  const { data: enabled = [] } = useOutletPayments(outletId ?? undefined);
  const create = useCreateOutletPayment();
  const del = useDeleteOutletPayment();

  const enabledByMethod = new Map<number, number>(enabled.map((e: any) => [e.payment_method, e.id]));

  const toggle = (methodId: number) => {
    if (!outletId) return;
    const existingId = enabledByMethod.get(methodId);
    if (existingId) del.mutate(existingId);
    else create.mutate({ outlet: outletId, payment_method: methodId, is_active: true });
  };

  return (
    <ClassicWindow title="Métodos de Pagamento por Outlet" icon={<Wallet size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{outletId ? `${enabled.length} de ${methods.length} métodos autorizados` : 'Selecione um outlet'}</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Outlet:</label>
          <select value={outletId ?? ''} onChange={(e) => setOutletId(e.target.value ? Number(e.target.value) : null)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— escolher —</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>)}
          </select>
        </div>

        {!outletId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Escolha um outlet para autorizar os métodos de pagamento.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-[10px] text-gray-500 mb-3">Os métodos são criados no Master Data. Aqui apenas se autoriza quais ficam disponíveis neste outlet.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {methods.map((m: any) => {
                const on = enabledByMethod.has(m.id);
                return (
                  <label key={m.id} className={`flex items-center justify-between border p-2 cursor-pointer ${on ? 'bg-[#eaf5ea] border-[#90c040]' : 'bg-white border-[#c0c0c0]'}`}>
                    <div>
                      <div className="font-bold text-gray-800 text-[11px]">{m.name}</div>
                      <div className="text-[10px] text-gray-500">[{m.code}] · {m.method_type_display || m.method_type} · {m.currency}</div>
                    </div>
                    <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="w-4 h-4" />
                  </label>
                );
              })}
              {methods.length === 0 && <div className="text-gray-500 text-[11px]">Sem métodos no Master Data. Crie-os primeiro em Master Data → Métodos de Pagamento.</div>}
            </div>
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
