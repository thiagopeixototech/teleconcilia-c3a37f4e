import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { registrarAuditoria } from '@/services/auditService';
import { AuditLogPanel } from '@/components/audit/AuditLogPanel';
import { VendaInterna, StatusInterno, Operadora } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { DateRangeBlock } from '@/components/DateRangeBlock';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, Search, Plus, Eye, Edit, Download, Filter,
  X, ChevronDown, ChevronUp, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

type SortKey = 'vendedor' | 'protocolo_interno' | 'identificador_make' | 'cliente_nome' | 'cpf_cnpj' | 'operadora' | 'empresa' | 'plano' | 'valor' | 'status_make' | 'data_venda' | 'data_instalacao' | 'linha_a_linha' | 'valor_lal' | 'status_pag' | 'comissionamento_desconto' | 'receita_descontada' | 'receita_interna';
type SortDir = 'asc' | 'desc';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const statusColors: Record<StatusInterno, string> = {
  nova: 'bg-info text-info-foreground',
  enviada: 'bg-primary text-primary-foreground',
  aguardando: 'bg-warning text-warning-foreground',
  confirmada: 'bg-success text-success-foreground',
  cancelada: 'bg-destructive text-destructive-foreground',
  contestacao_enviada: 'bg-orange-500 text-white',
  contestacao_procedente: 'bg-emerald-600 text-white',
  contestacao_improcedente: 'bg-red-600 text-white',
};

const statusLabels: Record<StatusInterno, string> = {
  nova: 'Nova',
  enviada: 'Enviada',
  aguardando: 'Aguardando',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  contestacao_enviada: 'Enviada p/ Contestação',
  contestacao_procedente: 'Contestação Procedente',
  contestacao_improcedente: 'Contestação Improcedente',
};

type VendaComExtras = VendaInterna & {
  usuario?: { nome: string; email: string } | null;
  empresa?: { nome: string } | null;
  _linha_a_linha_apelido?: string;
  _valor_lal?: number | null;
  _status_pag?: string | null;
  _comissionamento_desconto?: string | null;
  _receita_descontada?: number | null;
  _receita_interna?: number | null;
};

export default function VendasInternas() {
  const navigate = useNavigate();
  const { user, vendedor, isAdmin, isSupervisor } = useAuth();
  const [vendas, setVendas] = useState<VendaComExtras[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operadoraFilter, setOperadoraFilter] = useState<string>('all');
  const [statusMakeFilter, setStatusMakeFilter] = useState<string>('INSTALADA');
  const [confirmadaFilter, setConfirmadaFilter] = useState<string>('all');
  const [idMakeSearch, setIdMakeSearch] = useState('');
  const [protocoloSearch, setProtocoloSearch] = useState('');
  const [cpfSearch, setCpfSearch] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [vendedorOptions, setVendedorOptions] = useState<{ id: string; nome: string }[]>([]);
  const [statusMakeOptions, setStatusMakeOptions] = useState<string[]>([]);
  const [linhaALinhaFilter, setLinhaALinhaFilter] = useState<string>('all');
  const [linhaALinhaOptions, setLinhaALinhaOptions] = useState<string[]>([]);
  const [statusPagFilter, setStatusPagFilter] = useState<string>('all');
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [empresaOptions, setEmpresaOptions] = useState<{ id: string; nome: string }[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);
  const [loadProgress, setLoadProgress] = useState(0);
  const [selectedVenda, setSelectedVenda] = useState<VendaComExtras | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editStep, setEditStep] = useState<'select' | 'edit'>('select');
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Independent date filters
  const [dataVendaInicio, setDataVendaInicio] = useState<Date | null>(null);
  const [dataVendaFim, setDataVendaFim] = useState<Date | null>(null);
  const [dataInstalacaoInicio, setDataInstalacaoInicio] = useState<Date | null>(null);
  const [dataInstalacaoFim, setDataInstalacaoFim] = useState<Date | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<StatusInterno | ''>('');
  const [bulkVendedor, setBulkVendedor] = useState<string>('');
  const [bulkAction, setBulkAction] = useState<'status' | 'vendedor' | ''>('');
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Cancel ref
  const cancelRef = useRef(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  useEffect(() => {
    fetchOperadoras();
    fetchStatusMakeOptions();
    fetchLinhaALinhaOptions();
    fetchVendedorOptions();
    fetchEmpresaOptions();
  }, []);

  const fetchEmpresaOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativa', true)
        .order('nome');
      if (error) throw error;
      setEmpresaOptions((data || []).map((e: any) => ({ id: e.id, nome: e.nome })));
    } catch (error) {
      console.error('Error fetching empresa options:', error);
    }
  };

  const fetchLinhaALinhaOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('linha_operadora')
        .select('apelido, arquivo_origem');
      if (error) throw error;
      const labels = (data || [])
        .map((d: any) => (d.apelido || d.arquivo_origem) as string)
        .filter(Boolean);
      const unique = [...new Set(labels)].sort();
      setLinhaALinhaOptions(unique);
    } catch (error) {
      console.error('Error fetching linha a linha options:', error);
    }
  };

  const fetchStatusMakeOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('vendas_internas')
        .select('status_make')
        .not('status_make', 'is', null)
        .not('status_make', 'eq', '');
      if (error) throw error;
      const unique = [...new Set((data || []).map((d: any) => d.status_make as string))].sort();
      setStatusMakeOptions(unique);
    } catch (error) {
      console.error('Error fetching status_make options:', error);
    }
  };

  const fetchVendedorOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      setVendedorOptions((data || []).map((u: any) => ({ id: u.id, nome: u.nome })));
    } catch (error) {
      console.error('Error fetching vendedor options:', error);
    }
  };

  const handleBuscar = () => {
    cancelRef.current = false;
    setHasFetched(true);
    setVisibleCount(50);
    setIsLoading(true);
    setLoadProgress(0);
    fetchVendas();
  };

  const handleCancelar = () => {
    cancelRef.current = true;
    setIsLoading(false);
    setLoadProgress(0);
    toast.info('Busca cancelada');
  };

  const fetchVendas = async () => {
    try {
      const allVendas: any[] = [];
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;
      let batchNum = 0;

      setLoadProgress(5);

      while (hasMore) {
        if (cancelRef.current) return;

        let query = supabase
          .from('vendas_internas')
          .select(`
            *,
            usuario:usuarios(nome, email),
            empresa:empresas(nome)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        // Apply ALL filters at database level
        if (dataVendaInicio) query = query.gte('data_venda', format(dataVendaInicio, 'yyyy-MM-dd'));
        if (dataVendaFim) query = query.lte('data_venda', format(dataVendaFim, 'yyyy-MM-dd'));
        if (dataInstalacaoInicio) query = query.gte('data_instalacao', format(dataInstalacaoInicio, 'yyyy-MM-dd'));
        if (dataInstalacaoFim) query = query.lte('data_instalacao', format(dataInstalacaoFim, 'yyyy-MM-dd'));
        if (statusFilter !== 'all') query = query.eq('status_interno', statusFilter as any);
        if (operadoraFilter !== 'all') query = query.eq('operadora_id', operadoraFilter);
        if (vendedorFilter !== 'all') query = query.eq('usuario_id', vendedorFilter);
        if (empresaFilter !== 'all') query = query.eq('empresa_id', empresaFilter);
        if (statusMakeFilter !== 'all') {
          if (statusMakeFilter === '_empty_') {
            query = query.or('status_make.is.null,status_make.eq.');
          } else {
            query = query.eq('status_make', statusMakeFilter);
          }
        }
        if (confirmadaFilter === 'confirmada') query = query.eq('status_interno', 'confirmada');
        else if (confirmadaFilter === 'nao_confirmada') query = query.neq('status_interno', 'confirmada');
        if (idMakeSearch) query = query.ilike('identificador_make', `%${idMakeSearch}%`);
        if (protocoloSearch) query = query.ilike('protocolo_interno', `%${protocoloSearch}%`);
        if (searchTerm) {
          query = query.or(`cliente_nome.ilike.%${searchTerm}%,cpf_cnpj.ilike.%${searchTerm}%,protocolo_interno.ilike.%${searchTerm}%,identificador_make.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        if (cancelRef.current) return;

        batchNum++;

        if (data && data.length > 0) {
          allVendas.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
          setLoadProgress(Math.min(70, 5 + batchNum * 25));
        } else {
          hasMore = false;
        }
      }

      setLoadProgress(75);

      // Fetch conciliacoes to find "Linha a Linha" apelido
      const vendaIds = allVendas.map(v => v.id);
      const conciliacaoMap: Record<string, { apelido: string; valor_lal: number | null }> = {};

      if (vendaIds.length > 0) {
        for (let i = 0; i < vendaIds.length; i += 500) {
          const batch = vendaIds.slice(i, i + 500);
          const { data: concData } = await supabase
            .from('conciliacoes')
            .select('venda_interna_id, linha_operadora_id, status_final')
            .in('venda_interna_id', batch)
            .eq('status_final', 'conciliado');
          
          if (concData && concData.length > 0) {
            const linhaIds = concData.map(c => c.linha_operadora_id);
            const { data: linhaData } = await supabase
              .from('linha_operadora')
              .select('id, apelido, arquivo_origem, valor_lq')
              .in('id', linhaIds);
            
            const linhaMap: Record<string, { label: string; valor: number | null }> = {};
            linhaData?.forEach(l => { 
              const label = l.apelido || l.arquivo_origem; 
              linhaMap[l.id] = { label: label || '', valor: l.valor_lq };
            });
            
            concData.forEach(c => {
              const info = linhaMap[c.linha_operadora_id];
              if (info) {
                conciliacaoMap[c.venda_interna_id] = { apelido: info.label, valor_lal: info.valor };
              }
            });
          }
        }
      }

      // Fetch comissionamento_vendas data
      const comissaoMap: Record<string, { status_pag: string | null; comissionamento_desconto: string | null; receita_descontada: number | null; receita_interna: number | null }> = {};
      if (vendaIds.length > 0) {
        for (let i = 0; i < vendaIds.length; i += 500) {
          const batch = vendaIds.slice(i, i + 500);
          const { data: comData } = await supabase
            .from('comissionamento_vendas')
            .select('venda_interna_id, status_pag, comissionamento_desconto, receita_descontada, receita_interna')
            .in('venda_interna_id', batch);
          comData?.forEach(c => {
            comissaoMap[c.venda_interna_id] = {
              status_pag: c.status_pag,
              comissionamento_desconto: c.comissionamento_desconto,
              receita_descontada: c.receita_descontada,
              receita_interna: c.receita_interna,
            };
          });
        }
      }

      setLoadProgress(95);

      // Enrich vendas with apelido + comissao
      const enriched = allVendas.map(v => ({
        ...v,
        _linha_a_linha_apelido: conciliacaoMap[v.id]?.apelido || '',
        _valor_lal: conciliacaoMap[v.id]?.valor_lal || null,
        _status_pag: comissaoMap[v.id]?.status_pag || null,
        _comissionamento_desconto: comissaoMap[v.id]?.comissionamento_desconto || null,
        _receita_descontada: comissaoMap[v.id]?.receita_descontada || null,
        _receita_interna: comissaoMap[v.id]?.receita_interna || null,
      }));

      setTotalCount(enriched.length);
      setVendas(enriched as VendaComExtras[]);
      setLoadProgress(100);
    } catch (error) {
      console.error('Error fetching vendas:', error);
      toast.error('Erro ao carregar vendas');
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setLoadProgress(0);
      }, 300);
    }
  };

  const fetchOperadoras = async () => {
    try {
      const { data, error } = await supabase
        .from('operadoras')
        .select('*')
        .eq('ativa', true)
        .order('nome');
      if (error) throw error;
      setOperadoras(data as Operadora[]);
    } catch (error) {
      console.error('Error fetching operadoras:', error);
    }
  };

  const getOperadoraNome = (operadoraId: string | null) => {
    if (!operadoraId) return '-';
    return operadoras.find(o => o.id === operadoraId)?.nome || '-';
  };

  const handleViewDetails = (venda: VendaComExtras) => {
    setSelectedVenda(venda);
    setIsDetailOpen(true);
  };

  const editableFields = [
    { key: 'usuario_id', label: 'Vendedor' },
    { key: 'status_interno', label: 'Status Interno' },
    { key: 'status_make', label: 'Status Make' },
    { key: 'operadora_id', label: 'Operadora' },
    { key: 'cliente_nome', label: 'Cliente' },
    { key: 'cpf_cnpj', label: 'CPF/CNPJ' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'plano', label: 'Plano' },
    { key: 'valor', label: 'Valor' },
    { key: 'protocolo_interno', label: 'Protocolo' },
    { key: 'identificador_make', label: 'Identificador Make' },
    { key: 'data_venda', label: 'Data Venda' },
    { key: 'data_instalacao', label: 'Data Instalação' },
    { key: 'observacoes', label: 'Observações' },
  ];

  const handleEditStatus = (venda: VendaComExtras) => {
    setSelectedVenda(venda);
    setEditStep('select');
    setEditField('');
    setEditValue('');
    setIsEditOpen(true);
  };

  const handleSelectField = (fieldKey: string) => {
    if (!selectedVenda) return;
    setEditField(fieldKey);
    const currentVal = (selectedVenda as any)[fieldKey];
    setEditValue(currentVal != null ? String(currentVal) : '');
    setEditStep('edit');
  };

  const handleSaveField = async () => {
    if (!selectedVenda || !editField) return;
    setIsSaving(true);
    try {
      let updateValue: any = editValue;
      if (editField === 'valor') {
        updateValue = editValue ? parseFloat(editValue.replace(',', '.')) : null;
      } else if (editField === 'data_venda' || editField === 'data_instalacao') {
        updateValue = editValue || null;
      } else if (editValue === '') {
        updateValue = null;
      }

      const { error } = await supabase
        .from('vendas_internas')
        .update({ [editField]: updateValue })
        .eq('id', selectedVenda.id);
      if (error) throw error;

      const fieldLabel = editableFields.find(f => f.key === editField)?.label || editField;
      const oldVal = (selectedVenda as any)[editField];
      
      let acaoAudit = 'EDITAR_CAMPO';
      if (editField === 'status_interno') acaoAudit = 'MUDAR_STATUS_INTERNO';
      if (editField === 'status_make') acaoAudit = 'MUDAR_STATUS_MAKE';
      if (editField === 'valor') acaoAudit = 'ALTERAR_VALOR';

      // For usuario_id, resolve names for audit
      let valorAnteriorAudit: any = oldVal;
      let valorNovoAudit: any = updateValue;
      if (editField === 'usuario_id') {
        const oldVendedor = vendedorOptions.find(v => v.id === oldVal);
        const newVendedor = vendedorOptions.find(v => v.id === updateValue);
        valorAnteriorAudit = oldVendedor ? `${oldVendedor.nome} (${oldVal})` : oldVal;
        valorNovoAudit = newVendedor ? `${newVendedor.nome} (${updateValue})` : updateValue;
      }

      await registrarAuditoria({
        venda_id: selectedVenda.id,
        user_id: user?.id,
        user_nome: vendedor?.nome,
        acao: acaoAudit,
        campo: editField,
        valor_anterior: valorAnteriorAudit,
        valor_novo: valorNovoAudit,
      });

      toast.success(`${fieldLabel} atualizado com sucesso`);
      setIsEditOpen(false);
      fetchVendas();
    } catch (error: any) {
      console.error('Error updating venda:', error);
      toast.error('Erro ao atualizar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = filteredVendas.slice(0, visibleCount);
    if (selectedIds.size === visible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map(v => v.id)));
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    setIsBulkSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const BATCH = 200;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const { error } = await supabase
          .from('vendas_internas')
          .update({ status_interno: bulkStatus })
          .in('id', batch);
        if (error) throw error;
      }
      toast.success(`${ids.length} vendas atualizadas para "${statusLabels[bulkStatus]}"`);
      setSelectedIds(new Set());
      setBulkStatus('');
      setBulkAction('');
      fetchVendas();
    } catch (error: any) {
      toast.error('Erro ao atualizar vendas: ' + (error.message || ''));
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleBulkVendedorUpdate = async () => {
    if (!bulkVendedor || selectedIds.size === 0) return;
    setIsBulkSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const BATCH = 200;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const { error } = await supabase
          .from('vendas_internas')
          .update({ usuario_id: bulkVendedor })
          .in('id', batch);
        if (error) throw error;
      }
      const vendedorNome = vendedorOptions.find(v => v.id === bulkVendedor)?.nome || '';
      toast.success(`${ids.length} vendas transferidas para "${vendedorNome}"`);
      setSelectedIds(new Set());
      setBulkVendedor('');
      setBulkAction('');
      fetchVendas();
    } catch (error: any) {
      toast.error('Erro ao atualizar vendas: ' + (error.message || ''));
    } finally {
      setIsBulkSaving(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Vendedor', 'Protocolo', 'ID Make', 'Cliente', 'CPF/CNPJ', 'Operadora', 'Empresa', 'Plano', 'Valor', 'Status Make', 'Data Venda', 'Data Instalação', 'Linha a Linha', 'Valor LAL', 'Valor Interno', 'Status Pag', 'Desconto', 'Receita Descontada'];
    const rows = filteredVendas.map(v => [
      v.usuario?.nome || '',
      v.protocolo_interno || '',
      v.identificador_make || '',
      v.cliente_nome,
      v.cpf_cnpj || '',
      getOperadoraNome(v.operadora_id),
      v.empresa?.nome || '',
      v.plano || '',
      v.valor?.toString() || '',
      v.status_make || '',
      format(new Date(v.data_venda), 'dd/MM/yyyy'),
      v.data_instalacao ? format(new Date(v.data_instalacao), 'dd/MM/yyyy') : '',
      v._linha_a_linha_apelido || '',
      v._valor_lal?.toString() || '',
      v._receita_interna?.toString() || '',
      v._status_pag || '',
      v._comissionamento_desconto || '',
      v._receita_descontada?.toString() || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendas_internas_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = statusFilter !== 'all' || operadoraFilter !== 'all' || vendedorFilter !== 'all' ||
    statusMakeFilter !== 'all' || confirmadaFilter !== 'all' || linhaALinhaFilter !== 'all' ||
    statusPagFilter !== 'all' || empresaFilter !== 'all' ||
    idMakeSearch !== '' || protocoloSearch !== '' ||
    dataVendaInicio !== null || dataVendaFim !== null || dataInstalacaoInicio !== null || dataInstalacaoFim !== null;

  const activeFilterCount = [
    statusFilter !== 'all', operadoraFilter !== 'all', vendedorFilter !== 'all',
    statusMakeFilter !== 'all', confirmadaFilter !== 'all', linhaALinhaFilter !== 'all',
    statusPagFilter !== 'all', empresaFilter !== 'all',
    idMakeSearch, protocoloSearch,
    dataVendaInicio !== null || dataVendaFim !== null,
    dataInstalacaoInicio !== null || dataInstalacaoFim !== null,
  ].filter(Boolean).length;

  const clearAdvancedFilters = () => {
    setStatusFilter('all');
    setOperadoraFilter('all');
    setVendedorFilter('all');
    setStatusMakeFilter('all');
    setConfirmadaFilter('all');
    setLinhaALinhaFilter('all');
    setStatusPagFilter('all');
    setEmpresaFilter('all');
    setIdMakeSearch('');
    setProtocoloSearch('');
    setDataVendaInicio(null);
    setDataVendaFim(null);
    setDataInstalacaoInicio(null);
    setDataInstalacaoFim(null);
    setVisibleCount(50);
  };

  useEffect(() => {
    setVisibleCount(50);
  }, [searchTerm, statusFilter, operadoraFilter, vendedorFilter, statusMakeFilter, confirmadaFilter, linhaALinhaFilter, statusPagFilter, empresaFilter, idMakeSearch, protocoloSearch]);

  const filteredVendas = (() => {
    const filtered = vendas.filter(venda => {
      const matchesSearch = 
        venda.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.cpf_cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.protocolo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        venda.identificador_make?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || venda.status_interno === statusFilter;
      const matchesOperadora = operadoraFilter === 'all' || venda.operadora_id === operadoraFilter;
      const matchesVendedor = vendedorFilter === 'all' || venda.usuario_id === vendedorFilter;
      
      const matchesStatusMake = statusMakeFilter === 'all' || 
        (statusMakeFilter === '_empty_' ? (!venda.status_make || venda.status_make === '') : venda.status_make === statusMakeFilter);
      
      const matchesConfirmada = confirmadaFilter === 'all' || 
        (confirmadaFilter === 'confirmada' ? venda.status_interno === 'confirmada' : venda.status_interno !== 'confirmada');

      const matchesIdMake = !idMakeSearch || 
        venda.identificador_make?.toLowerCase().includes(idMakeSearch.toLowerCase());
      
      const matchesProtocolo = !protocoloSearch || 
        venda.protocolo_interno?.toLowerCase().includes(protocoloSearch.toLowerCase());

      const matchesLinhaALinha = linhaALinhaFilter === 'all' ||
        (linhaALinhaFilter === '_sem_' ? !venda._linha_a_linha_apelido : venda._linha_a_linha_apelido === linhaALinhaFilter);

      const matchesStatusPag = statusPagFilter === 'all' ||
        (statusPagFilter === '_sem_' ? !venda._status_pag : venda._status_pag === statusPagFilter);

      const matchesEmpresa = empresaFilter === 'all' || venda.empresa_id === empresaFilter;
      
      return matchesSearch && matchesStatus && matchesOperadora && matchesVendedor &&
        matchesStatusMake && matchesConfirmada &&
        matchesIdMake && matchesProtocolo && matchesLinhaALinha && matchesStatusPag && matchesEmpresa;
    });

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any, valB: any;
      switch (sortKey) {
        case 'vendedor':
          valA = a.usuario?.nome || '';
          valB = b.usuario?.nome || '';
          break;
        case 'operadora':
          valA = getOperadoraNome(a.operadora_id);
          valB = getOperadoraNome(b.operadora_id);
          break;
        case 'valor':
          valA = a.valor ?? 0;
          valB = b.valor ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        case 'data_venda':
          valA = a.data_venda || '';
          valB = b.data_venda || '';
          break;
        case 'data_instalacao':
          valA = a.data_instalacao || '';
          valB = b.data_instalacao || '';
          break;
        case 'linha_a_linha':
          valA = a._linha_a_linha_apelido || '';
          valB = b._linha_a_linha_apelido || '';
          break;
        case 'empresa':
          valA = a.empresa?.nome || '';
          valB = b.empresa?.nome || '';
          break;
        case 'receita_descontada':
          valA = a._receita_descontada ?? 0;
          valB = b._receita_descontada ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        case 'valor_lal':
          valA = a._valor_lal ?? 0;
          valB = b._valor_lal ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        case 'receita_interna':
          valA = a._receita_interna ?? 0;
          valB = b._receita_interna ?? 0;
          return sortDir === 'asc' ? valA - valB : valB - valA;
        default:
          valA = (a as any)[sortKey] || '';
          valB = (b as any)[sortKey] || '';
      }
      const cmp = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  })();

  return (
    <AppLayout title="Vendas Internas">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente, CPF/CNPJ, protocolo ou ID Make..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button 
                  variant={showAdvancedFilters ? "secondary" : "outline"} 
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Filtros {activeFilterCount > 0 && `(${activeFilterCount})`}
                </Button>
                <Button variant="outline" onClick={exportToCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button onClick={() => navigate('/vendas/nova')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Venda
                </Button>
              </div>

              {showAdvancedFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Filtros</p>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAdvancedFilters} className="gap-1 text-xs">
                        <X className="h-3 w-3" />
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                  {/* Independent date blocks */}
                  <div className="flex flex-wrap gap-6">
                    <DateRangeBlock
                      label="Data de Venda"
                      dateFrom={dataVendaInicio}
                      dateTo={dataVendaFim}
                      onDateFromChange={setDataVendaInicio}
                      onDateToChange={setDataVendaFim}
                    />
                    <DateRangeBlock
                      label="Data de Instalação"
                      dateFrom={dataInstalacaoInicio}
                      dateTo={dataInstalacaoFim}
                      onDateFromChange={setDataInstalacaoInicio}
                      onDateToChange={setDataInstalacaoFim}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs mb-1.5 block">Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os Status</SelectItem>
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Operadora</Label>
                      <Select value={operadoraFilter} onValueChange={setOperadoraFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Operadora" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas Operadoras</SelectItem>
                          {operadoras.map((op) => (
                            <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(isAdmin || isSupervisor) && (
                      <div>
                        <Label className="text-xs mb-1.5 block">Vendedor</Label>
                        <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Vendedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos Vendedores</SelectItem>
                            {vendedorOptions.map(({ id, nome }) => (
                              <SelectItem key={id} value={id}>{nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs mb-1.5 block">Status Make</Label>
                      <Select value={statusMakeFilter} onValueChange={setStatusMakeFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="_empty_">Sem Status</SelectItem>
                          {statusMakeOptions.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Linha a Linha</Label>
                      <Select value={linhaALinhaFilter} onValueChange={setLinhaALinhaFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="_sem_">Sem Linha a Linha</SelectItem>
                          {linhaALinhaOptions.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Empresa</Label>
                      <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {empresaOptions.map(({ id, nome }) => (
                            <SelectItem key={id} value={id}>{nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Status Pag</Label>
                      <Select value={statusPagFilter} onValueChange={setStatusPagFilter}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="_sem_">Sem Status</SelectItem>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="DESCONTADA">DESCONTADA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">ID Make (múltiplos: separar por vírgula)</Label>
                      <Textarea
                        placeholder="Ex: 123456, 789012, 345678"
                        value={idMakeSearch}
                        onChange={(e) => setIdMakeSearch(e.target.value)}
                        className="w-full min-h-[40px] h-10 resize-y"
                        rows={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">Protocolo (múltiplos: separar por vírgula)</Label>
                      <Textarea
                        placeholder="Ex: PROT001, PROT002"
                        value={protocoloSearch}
                        onChange={(e) => setProtocoloSearch(e.target.value)}
                        className="w-full min-h-[40px] h-10 resize-y"
                        rows={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">CPF/CNPJ (múltiplos: separar por vírgula)</Label>
                      <Textarea
                        placeholder="Ex: 12345678900, 98765432100"
                        value={cpfSearch}
                        onChange={(e) => setCpfSearch(e.target.value)}
                        className="w-full min-h-[40px] h-10 resize-y"
                        rows={1}
                      />
                    </div>
                  </div>
                   <div className="flex justify-end gap-2 pt-2">
                    {isLoading && (
                      <Button variant="destructive" onClick={handleCancelar} className="gap-2">
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                    )}
                    <Button onClick={handleBuscar} disabled={isLoading} className="gap-2">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Buscar
                    </Button>
                  </div>
                  {isLoading && (
                    <div className="space-y-1 pt-2">
                      <Progress value={loadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">Carregando... {loadProgress}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Vendas Registradas ({filteredVendas.length})
            </CardTitle>
            {filteredVendas.length > visibleCount && (
              <p className="text-sm text-muted-foreground">
                Mostrando {Math.min(visibleCount, filteredVendas.length)} de {filteredVendas.length}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {/* Bulk action bar */}
            {(isAdmin || isSupervisor) && selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-md bg-muted border">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{selectedIds.size} selecionada(s)</span>
                <Select value={bulkAction} onValueChange={(v) => { setBulkAction(v as any); setBulkStatus(''); setBulkVendedor(''); }}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Ação em massa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Alterar Status</SelectItem>
                    <SelectItem value="vendedor">Alterar Vendedor</SelectItem>
                  </SelectContent>
                </Select>
                {bulkAction === 'status' && (
                  <>
                    <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as StatusInterno)}>
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Selecione o status..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      disabled={!bulkStatus || isBulkSaving}
                      onClick={handleBulkStatusUpdate}
                    >
                      {isBulkSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Aplicar
                    </Button>
                  </>
                )}
                {bulkAction === 'vendedor' && (
                  <>
                    <Select value={bulkVendedor} onValueChange={setBulkVendedor}>
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Selecione o vendedor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendedorOptions.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      disabled={!bulkVendedor || isBulkSaving}
                      onClick={handleBulkVendedorUpdate}
                    >
                      {isBulkSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Aplicar
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setSelectedIds(new Set()); setBulkAction(''); }}>
                  Limpar seleção
                </Button>
              </div>
            )}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(isAdmin || isSupervisor) && (
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={filteredVendas.slice(0, visibleCount).length > 0 && selectedIds.size === filteredVendas.slice(0, visibleCount).length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('vendedor')}>
                      <span className="flex items-center">Vendedor<SortIcon col="vendedor" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('protocolo_interno')}>
                      <span className="flex items-center">Protocolo<SortIcon col="protocolo_interno" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('identificador_make')}>
                      <span className="flex items-center">ID Make<SortIcon col="identificador_make" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('cliente_nome')}>
                      <span className="flex items-center">Cliente<SortIcon col="cliente_nome" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('cpf_cnpj')}>
                      <span className="flex items-center">CPF/CNPJ<SortIcon col="cpf_cnpj" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('operadora')}>
                      <span className="flex items-center">Operadora<SortIcon col="operadora" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('empresa')}>
                      <span className="flex items-center">Empresa<SortIcon col="empresa" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('plano')}>
                      <span className="flex items-center">Plano<SortIcon col="plano" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('valor')}>
                      <span className="flex items-center">Valor<SortIcon col="valor" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status_make')}>
                      <span className="flex items-center">Status Make<SortIcon col="status_make" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('linha_a_linha')}>
                      <span className="flex items-center">Linha a Linha<SortIcon col="linha_a_linha" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('valor_lal')}>
                      <span className="flex items-center">Valor LAL<SortIcon col="valor_lal" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('receita_interna')}>
                      <span className="flex items-center">Valor Interno<SortIcon col="receita_interna" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('data_venda')}>
                      <span className="flex items-center">Data Venda<SortIcon col="data_venda" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('data_instalacao')}>
                      <span className="flex items-center">Data Instalação<SortIcon col="data_instalacao" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status_pag')}>
                      <span className="flex items-center">Status Pag<SortIcon col="status_pag" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('comissionamento_desconto')}>
                      <span className="flex items-center">Desconto<SortIcon col="comissionamento_desconto" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('receita_descontada')}>
                      <span className="flex items-center">Receita Desc.<SortIcon col="receita_descontada" /></span>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!hasFetched ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Filter className="h-8 w-8 opacity-40" />
                          <p>Utilize os filtros acima e clique em <strong>Buscar</strong> para carregar as vendas</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : isLoading ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : filteredVendas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                        Nenhuma venda encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendas.slice(0, visibleCount).map((venda) => (
                      <TableRow key={venda.id} data-state={selectedIds.has(venda.id) ? 'selected' : undefined}>
                        {(isAdmin || isSupervisor) && (
                          <TableCell className="w-10">
                            <Checkbox 
                              checked={selectedIds.has(venda.id)}
                              onCheckedChange={() => toggleSelect(venda.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-sm">{venda.usuario?.nome || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.protocolo_interno || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.identificador_make || '-'}</TableCell>
                        <TableCell className="font-medium">{venda.cliente_nome}</TableCell>
                        <TableCell className="font-mono text-sm">{venda.cpf_cnpj || '-'}</TableCell>
                        <TableCell>{getOperadoraNome(venda.operadora_id)}</TableCell>
                        <TableCell className="text-sm">{venda.empresa?.nome || '-'}</TableCell>
                        <TableCell className="text-sm">{venda.plano || '-'}</TableCell>
                        <TableCell>
                          {venda.valor 
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.valor)
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-sm">{venda.status_make || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {venda._linha_a_linha_apelido || '-'}
                        </TableCell>
                        <TableCell>
                          {venda._valor_lal != null
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda._valor_lal)
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {venda._receita_interna != null
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda._receita_interna)
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {format(new Date(venda.data_venda), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {venda.data_instalacao 
                            ? format(new Date(venda.data_instalacao), 'dd/MM/yyyy', { locale: ptBR })
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {venda._status_pag ? (
                            <Badge variant={venda._status_pag === 'OK' ? 'default' : 'destructive'}>
                              {venda._status_pag}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{venda._comissionamento_desconto || '-'}</TableCell>
                        <TableCell>
                          {venda._receita_descontada != null
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda._receita_descontada)
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleViewDetails(venda)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {(isAdmin || isSupervisor) && (
                              <Button variant="ghost" size="icon" onClick={() => handleEditStatus(venda)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredVendas.length > visibleCount && (
              <div className="flex justify-center pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setVisibleCount(prev => prev + 50)}
                  className="w-full md:w-auto"
                >
                  Mostrar mais ({filteredVendas.length - visibleCount} restantes)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Venda</DialogTitle>
              <DialogDescription>
                Protocolo: {selectedVenda?.protocolo_interno || 'N/A'}
              </DialogDescription>
            </DialogHeader>
            {selectedVenda && (
              <div className="space-y-6">
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Cliente</Label>
                      <p className="font-medium">{selectedVenda.cliente_nome}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">CPF/CNPJ</Label>
                      <p className="font-medium font-mono">{selectedVenda.cpf_cnpj || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Telefone</Label>
                      <p className="font-medium">{selectedVenda.telefone || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Operadora</Label>
                      <p className="font-medium">{getOperadoraNome(selectedVenda.operadora_id)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Plano</Label>
                      <p className="font-medium">{selectedVenda.plano || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Valor</Label>
                      <p className="font-medium">
                        {selectedVenda.valor 
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedVenda.valor)
                          : '-'
                        }
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Badge className={statusColors[selectedVenda.status_interno]}>
                        {statusLabels[selectedVenda.status_interno]}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Linha a Linha</Label>
                      <p className="font-medium">{selectedVenda._linha_a_linha_apelido || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Endereço</Label>
                      <p className="font-medium">
                        {selectedVenda.endereco || '-'} {selectedVenda.cep ? `- CEP: ${selectedVenda.cep}` : ''}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Observações</Label>
                      <p className="font-medium">{selectedVenda.observacoes || 'Nenhuma observação'}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <AuditLogPanel vendaId={selectedVenda.id} isOpen={isDetailOpen} />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Field Wizard Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editStep === 'select' ? 'Editar Venda' : `Editar ${editableFields.find(f => f.key === editField)?.label}`}
              </DialogTitle>
              <DialogDescription>
                {editStep === 'select'
                  ? `Selecione o campo que deseja editar — ${selectedVenda?.cliente_nome}`
                  : `Atualize o valor do campo para a venda de ${selectedVenda?.cliente_nome}`}
              </DialogDescription>
            </DialogHeader>

            {editStep === 'select' && (
              <div className="grid grid-cols-2 gap-2 py-4">
                {editableFields.map(f => (
                  <Button
                    key={f.key}
                    variant="outline"
                    className="justify-start text-sm h-10"
                    onClick={() => handleSelectField(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            )}

            {editStep === 'edit' && (
              <div className="space-y-4 py-4">
                {editField === 'status_interno' && (
                  <Select value={editValue} onValueChange={setEditValue}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {editField === 'operadora_id' && (
                  <Select value={editValue} onValueChange={setEditValue}>
                    <SelectTrigger><SelectValue placeholder="Selecione a operadora" /></SelectTrigger>
                    <SelectContent>
                      {operadoras.map(op => (
                        <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {editField === 'usuario_id' && (
                  <Select value={editValue} onValueChange={setEditValue}>
                    <SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                    <SelectContent>
                      {vendedorOptions.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {editField === 'observacoes' && (
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Observações..."
                    rows={3}
                  />
                )}

                {editField === 'valor' && (
                  <Input
                    type="number"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="0.00"
                  />
                )}

                {(editField === 'data_venda' || editField === 'data_instalacao') && (
                  <Input
                    type="date"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                )}

                {!['status_interno', 'operadora_id', 'usuario_id', 'observacoes', 'valor', 'data_venda', 'data_instalacao'].includes(editField) && (
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={editableFields.find(f => f.key === editField)?.label}
                  />
                )}

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setEditStep('select')}>
                    Voltar
                  </Button>
                  <Button onClick={handleSaveField} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
