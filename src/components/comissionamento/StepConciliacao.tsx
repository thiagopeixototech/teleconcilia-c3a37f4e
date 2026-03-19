import { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizeCpfCnpj, normalizeCpfCnpjForMatch } from '@/lib/normalizeCpfCnpj';
import { normalizeProtocolo } from '@/lib/normalizeProtocolo';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, GitCompare, CheckCircle2, Search, XCircle, RefreshCw, Trash2, ChevronDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';

interface Props {
  comissionamentoId: string;
}

interface ComVenda {
  id: string;
  venda_interna_id: string;
  status_pag: string | null;
  receita_interna: number | null;
  receita_lal: number | null;
  lal_apelido: string | null;
  linha_operadora_id: string | null;
  cliente_nome?: string;
  cpf_cnpj?: string;
  protocolo_interno?: string;
  identificador_make?: string;
  status_make?: string;
  valor_venda?: number;
  vendedor_nome?: string;
  data_venda?: string;
  plano?: string;
  endereco?: string;
  cep?: string;
  telefone?: string;
  operadora_nome?: string;
  operadora_id?: string | null;
  // Pre-match fields (computed client-side)
  matched_linha_id?: string | null;
  matched_valor_lq?: number | null;
  matched_apelido?: string | null;
  matched_source_type?: 'linha_operadora' | 'lal_registro' | null;
  matched_lal_registro_ids?: string[];
  is_atencao?: boolean;
  atencao_key?: string;
}

export function StepConciliacao({ comissionamentoId }: Props) {
  const { user } = useAuth();
  const [vendas, setVendas] = useState<ComVenda[]>([]);
  const [lals, setLals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [matchRan, setMatchRan] = useState(false);

  const [statusPagFilter, setStatusPagFilter] = useState<string>('all');
  const [statusMakeFilter, setStatusMakeFilter] = useState<string>('all');
  const [matchFilter, setMatchFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [duplicateSelections, setDuplicateSelections] = useState<Record<string, Record<string, 'OK' | 'DESCONTADA'>>>({});
  const [selectedAtencaoIds, setSelectedAtencaoIds] = useState<Set<string>>(new Set());

  // Collect unique status_make values for dynamic filter
  const uniqueStatusMake = useMemo(() => {
    const set = new Set<string>();
    vendas.forEach(v => {
      if (v.status_make) set.add(v.status_make.trim());
    });
    return Array.from(set).sort();
  }, [vendas]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMatchRan(false);
    try {
      const allVendas: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('comissionamento_vendas')
          .select(`
            id, venda_interna_id, status_pag, receita_interna, receita_lal, lal_apelido, linha_operadora_id,
            vendas_internas!comissionamento_vendas_venda_interna_id_fkey(
              cliente_nome, cpf_cnpj, protocolo_interno, identificador_make, status_make, valor, data_venda,
              plano, endereco, cep, telefone, operadora_id,
              usuarios!vendas_internas_usuario_id_fkey(nome),
              operadoras!vendas_internas_operadora_id_fkey(nome)
            )
          `)
          .eq('comissionamento_id', comissionamentoId)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allVendas.push(...data);
        if (data.length < batchSize) break;
        offset += batchSize;
      }

      // Load LAL importacoes (new architecture)
      const { data: lalImportacoes } = await supabase
        .from('lal_importacoes' as any)
        .select('*')
        .eq('comissionamento_id', comissionamentoId);

      // Fallback to comissionamento_lal if no lal_importacoes found
      const lalData = (lalImportacoes && lalImportacoes.length > 0)
        ? lalImportacoes
        : (await supabase.from('comissionamento_lal').select('*').eq('comissionamento_id', comissionamentoId)).data || [];

      const mapped: ComVenda[] = allVendas.map((row: any) => {
        const vi = row.vendas_internas;
        return {
          id: row.id,
          venda_interna_id: row.venda_interna_id,
          status_pag: row.status_pag,
          receita_interna: row.receita_interna,
          receita_lal: row.receita_lal,
          lal_apelido: row.lal_apelido,
          linha_operadora_id: row.linha_operadora_id,
          cliente_nome: vi?.cliente_nome,
          cpf_cnpj: vi?.cpf_cnpj,
          protocolo_interno: vi?.protocolo_interno,
          identificador_make: vi?.identificador_make,
          status_make: vi?.status_make,
          valor_venda: vi?.valor,
          vendedor_nome: vi?.usuarios?.nome,
          data_venda: vi?.data_venda,
          plano: vi?.plano,
          endereco: vi?.endereco,
          cep: vi?.cep,
          telefone: vi?.telefone,
          operadora_nome: vi?.operadoras?.nome,
          operadora_id: vi?.operadora_id || null,
          matched_linha_id: row.linha_operadora_id || null,
          matched_valor_lq: row.receita_lal || null,
          matched_apelido: row.lal_apelido || null,
          is_atencao: false,
          atencao_key: undefined,
        };
      });

      setVendas(mapped);
      setLals(lalData);

      // Auto-run pre-match if there are LALs and unprocessed vendas
      if (lalData.length > 0) {
        await runPreMatch(mapped, lalData);
      }
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [comissionamentoId]);

  const runPreMatch = async (vendasData: ComVenda[], lalData: any[]) => {
    try {
      // Determine if we have lal_importacoes (new arch) or comissionamento_lal (old arch)
      const isNewArch = lalData.some((l: any) => l.created_by != null); // lal_importacoes has created_by

      const allLinhas: any[] = [];

      if (isNewArch) {
        // NEW ARCHITECTURE: Fetch from lal_registros via importacao IDs
        const importacaoIds = lalData.map((l: any) => l.id);
        for (const impId of importacaoIds) {
          let offset = 0;
          while (true) {
            const { data } = await supabase
              .from('lal_registros' as any)
              .select('id, n_solicitacao, cpf_cnpj, telefone, receita, importacao_id, status')
              .eq('importacao_id', impId)
              .eq('status', 'ativo')
              .range(offset, offset + 999);
            if (!data || data.length === 0) break;
            // Map lal_registros fields to a common shape
            allLinhas.push(...(data as any[]).map((r: any) => ({
              id: r.id,
              protocolo_operadora: r.n_solicitacao,
              cpf_cnpj: r.cpf_cnpj,
              telefone: r.telefone,
              valor_lq: r.receita,
              apelido: lalData.find((l: any) => l.id === r.importacao_id)?.apelido || '',
              _importacao_id: r.importacao_id,
              _source_type: 'lal_registro' as const,
            })));
            if ((data as any[]).length < 1000) break;
            offset += 1000;
          }
        }
      } else {
        // OLD ARCHITECTURE: Fetch from linha_operadora by apelido
        const lalApelidos = lalData.map((l: any) => l.apelido);
        for (const apelido of lalApelidos) {
          let offset = 0;
          while (true) {
            const { data } = await supabase
              .from('linha_operadora')
              .select('id, protocolo_operadora, cpf_cnpj, telefone, valor_lq, apelido')
              .eq('apelido', apelido)
              .range(offset, offset + 999);
            if (!data || data.length === 0) break;
            allLinhas.push(...data.map((linha: any) => ({
              ...linha,
              _source_type: 'linha_operadora' as const,
            })));
            if (data.length < 1000) break;
            offset += 1000;
          }
        }
      }

      const normDoc = normalizeCpfCnpjForMatch;
      const linhasByProtocolo = new Map<string, any[]>();
      const linhasByCpf = new Map<string, any[]>();

      for (const linha of allLinhas) {
        if (linha.protocolo_operadora) {
          const key = normalizeProtocolo(linha.protocolo_operadora.trim()) || linha.protocolo_operadora.trim();
          if (!linhasByProtocolo.has(key)) linhasByProtocolo.set(key, []);
          linhasByProtocolo.get(key)!.push(linha);
        }
        if (linha.cpf_cnpj) {
          const key = normDoc(linha.cpf_cnpj);
          if (!linhasByCpf.has(key)) linhasByCpf.set(key, []);
          linhasByCpf.get(key)!.push(linha);
        }
      }

      // Phase 1: Find which match key each venda would use
      type MatchCandidate = {
        vendaIndex: number;
        matchKey: string;
        matchType: 'protocolo' | 'cpf';
        linhas: any[];
        apelido: string;
      };

      const candidates: MatchCandidate[] = [];

      // Build a map from LAL apelido → operadora_id for filtering
      const lalOperadoraMap = new Map<string, string>();
      lalData.forEach((l: any) => lalOperadoraMap.set(l.apelido, l.operadora_id));

      vendasData.forEach((venda, index) => {
        if (venda.linha_operadora_id) return; // already linked in DB

        for (const lal of lalData) {
          const tipoMatch = lal.tipo_match;
          const lalOperadoraId = lal.operadora_id;

          // Only match vendas that belong to the same operadora as the LAL batch
          if (venda.operadora_id && lalOperadoraId && venda.operadora_id !== lalOperadoraId) {
            continue;
          }

          if (tipoMatch === 'protocolo' && venda.protocolo_interno) {
            const key = normalizeProtocolo(venda.protocolo_interno.trim()) || venda.protocolo_interno.trim();
            const linhas = linhasByProtocolo.get(key);
            if (linhas && linhas.length > 0) {
              // Filter linhas to same operadora's LAL batches
              const linhasFiltradas = linhas.filter((l: any) => lalOperadoraMap.get(l.apelido) === lalOperadoraId);
              if (linhasFiltradas.length > 0) {
                candidates.push({ vendaIndex: index, matchKey: `proto:${key}`, matchType: 'protocolo', linhas: linhasFiltradas, apelido: lal.apelido });
                return;
              }
            }
          }

          if (tipoMatch === 'cpf' && venda.cpf_cnpj) {
            const key = normDoc(venda.cpf_cnpj);
            const linhas = linhasByCpf.get(key);
            if (linhas && linhas.length > 0) {
              const linhasFiltradas = linhas.filter((l: any) => lalOperadoraMap.get(l.apelido) === lalOperadoraId);
              if (linhasFiltradas.length > 0) {
                candidates.push({ vendaIndex: index, matchKey: `cpf:${key}`, matchType: 'cpf', linhas: linhasFiltradas, apelido: lal.apelido });
                return;
              }
            }
          }
        }
      });

      // Phase 2: Group candidates by matchKey to find cross-vendor attention cases
      const groupedByKey = new Map<string, MatchCandidate[]>();
      for (const c of candidates) {
        if (!groupedByKey.has(c.matchKey)) groupedByKey.set(c.matchKey, []);
        groupedByKey.get(c.matchKey)!.push(c);
      }

      // Phase 3: Apply matches and flag "atenção" (same CPF found in LAL, different identificador_make)
      // Track which LAL line IDs have been claimed to prevent double-counting
      const claimedLinhaIds = new Set<string>();

      const updated = vendasData.map((venda, index) => {
        if (venda.linha_operadora_id) return venda;

        const candidate = candidates.find(c => c.vendaIndex === index);
        if (!candidate) {
          return { ...venda, matched_linha_id: null, matched_valor_lq: null, matched_apelido: null, matched_source_type: null, is_atencao: false, atencao_key: undefined };
        }

        const group = groupedByKey.get(candidate.matchKey)!;
        
        // "Atenção" = same CPF found in LAL but multiple vendas with DIFFERENT identificador_make
        let isAtencao = false;
        if (group.length > 1) {
          const idMakes = new Set(group.map(c => (vendasData[c.vendaIndex].identificador_make || '').trim()).filter(Boolean));
          isAtencao = idMakes.size > 1;
        }

        // Only sum valor_lq from lines NOT yet claimed by another venda
        const availableLinhas = candidate.linhas.filter((l: any) => !claimedLinhaIds.has(l.id));
        if (availableLinhas.length === 0 && !isAtencao) {
          // All lines already claimed — this venda gets no LAL revenue
          return { ...venda, matched_linha_id: null, matched_valor_lq: null, matched_apelido: null, matched_source_type: null, is_atencao: false, atencao_key: undefined };
        }

        const linhasToUse = isAtencao ? candidate.linhas : availableLinhas;
        const totalValorLq = linhasToUse.reduce((sum: number, l: any) => sum + Number(l.valor_lq || 0), 0);
        const primaryLinha = linhasToUse[0] || candidate.linhas[0];

        // Claim the lines (only for non-attention, since attention requires manual decision)
        if (!isAtencao) {
          linhasToUse.forEach((l: any) => claimedLinhaIds.add(l.id));
        }

        return {
          ...venda,
          matched_linha_id: primaryLinha.id,
          matched_valor_lq: totalValorLq,
          matched_apelido: candidate.apelido,
          matched_source_type: primaryLinha._source_type || null,
          matched_lal_registro_ids: linhasToUse.map((l: any) => l.id),
          is_atencao: isAtencao,
          atencao_key: isAtencao ? candidate.matchKey : undefined,
        };
      });

      setVendas(updated);
      setMatchRan(true);
    } catch (err: any) {
      console.error('Pre-match error:', err);
    }
  };

  // Helper: create lal_vinculos for matched LAL records
  const createLalVinculos = async (comVendaId: string, lalRegistroIds: string[], userId?: string) => {
    if (!lalRegistroIds || lalRegistroIds.length === 0) return;
    const vinculos = lalRegistroIds.map(regId => ({
      lal_registro_id: regId,
      comissionamento_venda_id: comVendaId,
      tipo_vinculo: 'automatico',
      receita_atribuida: null,
      created_by: userId || null,
    }));
    // Insert in batches, ignore duplicates
    for (let i = 0; i < vinculos.length; i += 50) {
      const batch = vinculos.slice(i, i + 50);
      await supabase.from('lal_vinculos' as any).upsert(batch as any, { onConflict: 'lal_registro_id,comissionamento_venda_id' });
    }
  };

  useEffect(() => { loadData(); }, [loadData]);

  const filteredVendas = useMemo(() => {
    let result = vendas;
    if (statusPagFilter !== 'all') {
      if (statusPagFilter === 'vazio') {
        result = result.filter(v => !v.status_pag);
      } else {
        result = result.filter(v => v.status_pag === statusPagFilter);
      }
    }
    if (statusMakeFilter !== 'all') {
      result = result.filter(v => (v.status_make || '').toLowerCase() === statusMakeFilter.toLowerCase());
    }
    if (matchFilter !== 'all') {
      if (matchFilter === 'encontrada_total') {
        result = result.filter(v => v.matched_linha_id || v.linha_operadora_id);
      } else if (matchFilter === 'encontrada') {
        result = result.filter(v => (v.matched_linha_id || v.linha_operadora_id) && !v.is_atencao);
      } else if (matchFilter === 'atencao') {
        result = result.filter(v => v.is_atencao);
      } else {
        result = result.filter(v => !v.matched_linha_id && !v.linha_operadora_id);
      }
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v =>
        (v.cliente_nome || '').toLowerCase().includes(term) ||
        (v.cpf_cnpj || '').includes(term) ||
        (v.protocolo_interno || '').toLowerCase().includes(term) ||
        (v.vendedor_nome || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [vendas, statusPagFilter, statusMakeFilter, matchFilter, searchTerm]);

  const displayedVendas = filteredVendas.slice(0, 200);

  // Group attention items by atencao_key for accordion view
  const atencaoGroups = useMemo(() => {
    if (matchFilter !== 'atencao') return new Map<string, ComVenda[]>();
    const groups = new Map<string, ComVenda[]>();
    filteredVendas.forEach(v => {
      if (v.atencao_key) {
        if (!groups.has(v.atencao_key)) groups.set(v.atencao_key, []);
        groups.get(v.atencao_key)!.push(v);
      }
    });
    return groups;
  }, [filteredVendas, matchFilter]);

  const handleConfirmAtencaoGroup = async (groupKey: string) => {
    const groupSelections = duplicateSelections[groupKey];
    if (!groupSelections || Object.keys(groupSelections).length === 0) {
      toast.error('Defina o status de pelo menos um registro antes de confirmar');
      return;
    }

    const group = atencaoGroups.get(groupKey);
    if (!group) return;

    setIsProcessing(true);
    try {
      for (const v of group) {
        const status = groupSelections[v.id];
        if (!status) continue;

        const updateData: any = { status_pag: status };
        if (!v.linha_operadora_id && v.matched_linha_id && v.matched_source_type === 'linha_operadora') {
          updateData.linha_operadora_id = v.matched_linha_id;
          updateData.receita_lal = v.matched_valor_lq;
          updateData.lal_apelido = v.matched_apelido;
        } else if (v.matched_valor_lq != null) {
          updateData.receita_lal = v.matched_valor_lq;
          updateData.lal_apelido = v.matched_apelido;
        }
        await supabase.from('comissionamento_vendas').update(updateData).eq('id', v.id);
        // Create lal_vinculos
        if (v.matched_lal_registro_ids && v.matched_lal_registro_ids.length > 0) {
          await createLalVinculos(v.id, v.matched_lal_registro_ids, user?.id);
        }
      }

      const count = Object.keys(groupSelections).length;
      toast.success(`${count} registros atualizados`);
      setDuplicateSelections(prev => { const next = { ...prev }; delete next[groupKey]; return next; });
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAllAtencaoGroups = async () => {
    const groupKeys = Object.keys(duplicateSelections).filter(key => {
      const sel = duplicateSelections[key];
      return sel && Object.keys(sel).length > 0;
    });

    if (groupKeys.length === 0) {
      toast.error('Nenhum grupo possui seleções para confirmar');
      return;
    }

    setIsProcessing(true);
    let totalUpdated = 0;
    try {
      for (const groupKey of groupKeys) {
        const groupSelections = duplicateSelections[groupKey];
        const group = atencaoGroups.get(groupKey);
        if (!group) continue;

        for (const v of group) {
          const status = groupSelections[v.id];
          if (!status) continue;

          const updateData: any = { status_pag: status };
          if (!v.linha_operadora_id && v.matched_linha_id && v.matched_source_type === 'linha_operadora') {
            updateData.linha_operadora_id = v.matched_linha_id;
            updateData.receita_lal = v.matched_valor_lq;
            updateData.lal_apelido = v.matched_apelido;
          } else if (v.matched_valor_lq != null) {
            updateData.receita_lal = v.matched_valor_lq;
            updateData.lal_apelido = v.matched_apelido;
          }
          await supabase.from('comissionamento_vendas').update(updateData).eq('id', v.id);
          totalUpdated++;
        }
      }

      toast.success(`${totalUpdated} registros atualizados em ${groupKeys.length} grupos`);
      setDuplicateSelections({});
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveVendaFromCommission = async (vendaId: string, groupKey: string) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('comissionamento_vendas')
        .delete()
        .eq('id', vendaId);
      if (error) throw error;

      toast.success('Venda removida da competência');
      setDuplicateSelections(prev => {
        const next = { ...prev };
        if (next[groupKey]) {
          delete next[groupKey][vendaId];
          if (Object.keys(next[groupKey]).length === 0) delete next[groupKey];
        }
        return next;
      });
      setSelectedAtencaoIds(prev => {
        const next = new Set(prev);
        next.delete(vendaId);
        return next;
      });
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleAtencaoSelect = (id: string) => {
    setSelectedAtencaoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkRemoveAtencaoSelected = async () => {
    if (selectedAtencaoIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedAtencaoIds);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error } = await supabase
          .from('comissionamento_vendas')
          .delete()
          .in('id', batch);
        if (error) throw error;
        setProgress({ current: Math.min(i + 50, ids.length), total: ids.length });
      }
      toast.success(`${ids.length} vendas removidas da competência`);
      setSelectedAtencaoIds(new Set());
      setDuplicateSelections(prev => {
        const next = { ...prev };
        for (const id of ids) {
          for (const key of Object.keys(next)) {
            if (next[key]?.[id]) {
              delete next[key][id];
              if (Object.keys(next[key]).length === 0) delete next[key];
            }
          }
        }
        return next;
      });
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const bulkSetStatusAtencaoSelected = async (status: 'OK' | 'DESCONTADA') => {
    if (selectedAtencaoIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedAtencaoIds);
      const vendasById = new Map(vendas.map(v => [v.id, v]));

      const statusOnlyIds: string[] = [];
      const needsLinkUpdate: ComVenda[] = [];
      const allVinculos: any[] = [];

      for (const id of ids) {
        const v = vendasById.get(id);
        if (!v) continue;
        if (!v.linha_operadora_id && v.matched_linha_id && v.matched_source_type === 'linha_operadora') {
          needsLinkUpdate.push(v);
        } else {
          statusOnlyIds.push(id);
        }
        if (v.matched_lal_registro_ids && v.matched_lal_registro_ids.length > 0) {
          for (const regId of v.matched_lal_registro_ids) {
            allVinculos.push({ lal_registro_id: regId, comissionamento_venda_id: id, tipo_vinculo: 'automatico', receita_atribuida: null, created_by: user?.id || null });
          }
        }
      }

      let processed = 0;
      const total = ids.length;

      for (let i = 0; i < statusOnlyIds.length; i += 200) {
        const batch = statusOnlyIds.slice(i, i + 200);
        const batchVendas = batch.map(id => vendasById.get(id)).filter(Boolean) as ComVenda[];
        const payload = batchVendas.map(v => ({
          id: v.id,
          status_pag: status,
          receita_lal: v.matched_valor_lq ?? v.receita_lal ?? null,
          lal_apelido: v.matched_apelido ?? v.lal_apelido ?? null,
        }));
        await supabase.from('comissionamento_vendas').upsert(payload as any, { onConflict: 'id' });
        processed += batch.length;
        setProgress({ current: processed, total });
      }

      for (let i = 0; i < needsLinkUpdate.length; i += 50) {
        const batch = needsLinkUpdate.slice(i, i + 50);
        await Promise.all(batch.map(v =>
          supabase.from('comissionamento_vendas').update({
            status_pag: status, linha_operadora_id: v.matched_linha_id, receita_lal: v.matched_valor_lq, lal_apelido: v.matched_apelido,
          } as any).eq('id', v.id)
        ));
        processed += batch.length;
        setProgress({ current: processed, total });
      }

      for (let i = 0; i < allVinculos.length; i += 200) {
        await supabase.from('lal_vinculos' as any).upsert(allVinculos.slice(i, i + 200) as any, { onConflict: 'lal_registro_id,comissionamento_venda_id' });
      }

      toast.success(`${ids.length} vendas marcadas como ${status}`);
      setSelectedAtencaoIds(new Set());
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(filteredVendas.map(v => v.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSaveAndMark = async (newStatus: 'OK' | 'DESCONTADA') => {
    if (selectedIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      const vendasToUpdate = vendas.filter(v => ids.includes(v.id));

      // Separate: vendas that only need status_pag vs vendas that also need link data
      const statusOnlyIds: string[] = [];
      const needsLinkUpdate: ComVenda[] = [];
      const allVinculos: { lal_registro_id: string; comissionamento_venda_id: string; tipo_vinculo: string; receita_atribuida: null; created_by: string | null }[] = [];

      for (const v of vendasToUpdate) {
        if (!v.linha_operadora_id && v.matched_linha_id && v.matched_source_type === 'linha_operadora') {
          needsLinkUpdate.push(v);
        } else {
          statusOnlyIds.push(v.id);
        }
        // Collect vinculos
        if (v.matched_lal_registro_ids && v.matched_lal_registro_ids.length > 0) {
          for (const regId of v.matched_lal_registro_ids) {
            allVinculos.push({
              lal_registro_id: regId,
              comissionamento_venda_id: v.id,
              tipo_vinculo: 'automatico',
              receita_atribuida: null,
              created_by: user?.id || null,
            });
          }
        }
      }

      let processed = 0;
      const total = vendasToUpdate.length;

      // Batch 1: Update status-only vendas in chunks of 200 using .in()
      for (let i = 0; i < statusOnlyIds.length; i += 200) {
        const batch = statusOnlyIds.slice(i, i + 200);
        const batchVendas = vendasToUpdate.filter(v => batch.includes(v.id));
        const payload = batchVendas.map(v => ({
          id: v.id,
          status_pag: newStatus,
          receita_lal: v.matched_valor_lq ?? v.receita_lal ?? null,
          lal_apelido: v.matched_apelido ?? v.lal_apelido ?? null,
        }));
        await supabase.from('comissionamento_vendas').upsert(payload as any, { onConflict: 'id' });
        processed += batch.length;
        setProgress({ current: processed, total });
      }

      // Batch 2: Update vendas that need link data (must be individual due to different values per row)
      for (let i = 0; i < needsLinkUpdate.length; i += 50) {
        const batch = needsLinkUpdate.slice(i, i + 50);
        await Promise.all(
          batch.map(v =>
            supabase.from('comissionamento_vendas').update({
              status_pag: newStatus,
              linha_operadora_id: v.matched_linha_id,
              receita_lal: v.matched_valor_lq,
              lal_apelido: v.matched_apelido,
            } as any).eq('id', v.id)
          )
        );
        processed += batch.length;
        setProgress({ current: processed, total });
      }

      // Batch 3: Insert all vinculos in one go
      for (let i = 0; i < allVinculos.length; i += 200) {
        const batch = allVinculos.slice(i, i + 200);
        await supabase.from('lal_vinculos' as any).upsert(batch as any, { onConflict: 'lal_registro_id,comissionamento_venda_id' });
      }

      toast.success(`${vendasToUpdate.length} vendas marcadas como ${newStatus}`);
      setVendas(prev => prev.map(v => {
        if (!ids.includes(v.id)) return v;
        const sourceIsLinhaOperadora = v.matched_source_type === 'linha_operadora';
        return {
          ...v,
          status_pag: newStatus,
          receita_lal: v.matched_valor_lq ?? v.receita_lal ?? null,
          lal_apelido: v.matched_apelido ?? v.lal_apelido ?? null,
          linha_operadora_id: (!v.linha_operadora_id && sourceIsLinhaOperadora && v.matched_linha_id) ? v.matched_linha_id : v.linha_operadora_id,
        };
      }));
      setSelectedIds(new Set());
      setSelectAll(false);
      await loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const bulkRemoveFromCommission = async () => {
    if (selectedIds.size === 0) { toast.error('Selecione vendas primeiro'); return; }
    setIsProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error } = await supabase
          .from('comissionamento_vendas')
          .delete()
          .in('id', batch);
        if (error) throw error;
        setProgress({ current: Math.min(i + 50, ids.length), total: ids.length });
      }
      toast.success(`${ids.length} vendas removidas da competência`);
      setSelectedIds(new Set());
      setSelectAll(false);
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const formatBRL = (v: number | null) =>
    v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '-';

  const statusPagBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-xs">Pendente</Badge>;
    if (status === 'OK') return <Badge className="bg-success/20 text-success text-xs">OK</Badge>;
    return <Badge className="bg-destructive/20 text-destructive text-xs">DESCONTADA</Badge>;
  };

  const matchBadge = (v: ComVenda) => {
    if (v.linha_operadora_id && !v.is_atencao) return <Badge className="bg-success/20 text-success text-xs">Vinculada</Badge>;
    if (v.is_atencao) return <Badge className="bg-warning/20 text-warning text-xs">⚠ Atenção</Badge>;
    if (v.matched_linha_id) return <Badge className="bg-accent text-accent-foreground text-xs">Encontrada</Badge>;
    return <Badge variant="outline" className="text-xs text-muted-foreground">Não encontrada</Badge>;
  };

  const matchStats = useMemo(() => {
    const total = vendas.length;
    const foundTotal = vendas.filter(v => v.matched_linha_id || v.linha_operadora_id).length;
    const atencao = vendas.filter(v => v.is_atencao).length;
    const found = foundTotal - atencao;
    const notFound = total - foundTotal;
    const percentage = total > 0 ? ((foundTotal / total) * 100).toFixed(1) : '0';
    return { total, found, foundTotal, notFound, atencao, percentage };
  }, [vendas]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando e analisando matches...</p>
      </div>
    );
  }

  const stats = {
    total: vendas.length,
    ok: vendas.filter(v => v.status_pag === 'OK').length,
    descontada: vendas.filter(v => v.status_pag === 'DESCONTADA').length,
    pendente: vendas.filter(v => !v.status_pag).length,
  };

  return (
    <div className="space-y-4">
      {/* Match Indicators */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total no Comissionamento</p>
              <p className="text-xl font-bold">{matchStats.total}</p>
            </div>
            <div className="text-center cursor-pointer" onClick={() => setMatchFilter(matchFilter === 'encontrada_total' ? 'all' : 'encontrada_total')}>
              <p className="text-xs text-muted-foreground">Encontradas (total)</p>
              <p className="text-xl font-bold text-success">{matchStats.foundTotal}</p>
            </div>
            <div className="text-center cursor-pointer" onClick={() => setMatchFilter(matchFilter === 'atencao' ? 'all' : 'atencao')}>
              <p className="text-xs text-muted-foreground">⚠ Atenção</p>
              <p className="text-xl font-bold text-warning">{matchStats.atencao}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Não Encontradas</p>
              <p className="text-xl font-bold text-destructive">{matchStats.notFound}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">% Match</p>
              <p className="text-xl font-bold">{matchStats.percentage}%</p>
            </div>
          </div>
          <Progress value={Number(matchStats.percentage)} className="h-2 mt-3" />
        </CardContent>
      </Card>

      {/* Status Pag Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3 text-center cursor-pointer hover:bg-accent/50" onClick={() => setStatusPagFilter(statusPagFilter === 'OK' ? 'all' : 'OK')}>
          <p className="text-xs text-muted-foreground">OK</p>
          <p className="text-lg font-bold text-success">{stats.ok}</p>
        </Card>
        <Card className="p-3 text-center cursor-pointer hover:bg-accent/50" onClick={() => setStatusPagFilter(statusPagFilter === 'DESCONTADA' ? 'all' : 'DESCONTADA')}>
          <p className="text-xs text-muted-foreground">Descontada</p>
          <p className="text-lg font-bold text-destructive">{stats.descontada}</p>
        </Card>
        <Card className="p-3 text-center cursor-pointer hover:bg-accent/50" onClick={() => setStatusPagFilter(statusPagFilter === 'vazio' ? 'all' : 'vazio')}>
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="text-lg font-bold text-warning">{stats.pendente}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 pl-8 w-48 text-sm"
          />
        </div>
        <Select value={matchFilter} onValueChange={setMatchFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Match LAL" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="encontrada_total">Encontradas (total)</SelectItem>
            <SelectItem value="atencao">⚠ Atenção</SelectItem>
            <SelectItem value="encontrada">Encontradas (sem duplicados)</SelectItem>
            <SelectItem value="nao_encontrada">Não Encontradas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusMakeFilter} onValueChange={setStatusMakeFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status Pedido" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {uniqueStatusMake.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusPagFilter} onValueChange={setStatusPagFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status Pag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="DESCONTADA">Descontada</SelectItem>
            <SelectItem value="vazio">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={loadData} className="h-8 gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Recarregar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredVendas.length} resultados
        </span>
      </div>

      {/* Bulk Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {selectedIds.size > 0 ? (
          <>
            <span className="text-sm font-medium">{selectedIds.size} selecionadas</span>
            <Button size="sm" onClick={() => bulkSaveAndMark('OK')} disabled={isProcessing} className="gap-1.5">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Marcar como OK
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulkSaveAndMark('DESCONTADA')} disabled={isProcessing} className="gap-1.5">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Marcar como DESCONTADA
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={isProcessing} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                  Remover da Competência
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover {selectedIds.size} vendas da competência?</AlertDialogTitle>
                  <AlertDialogDescription>
                    As vendas serão removidas deste comissionamento. Elas continuarão existindo no sistema, apenas não farão parte desta competência. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkRemoveFromCommission} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Confirmar Remoção
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" variant="ghost" onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}>
              Limpar seleção
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Use os filtros para encontrar as vendas desejadas, selecione e marque como OK ou DESCONTADA.
          </p>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">{progress.current} / {progress.total}</p>
        </div>
      )}

      {/* Atenção Accordion View */}
      {matchFilter === 'atencao' && atencaoGroups.size > 0 ? (
        <div className="space-y-3">
          {/* Bulk actions bar for attention view */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
            {selectedAtencaoIds.size > 0 ? (
              <>
                <span className="text-sm font-medium">{selectedAtencaoIds.size} selecionada(s)</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={isProcessing} className="gap-1.5 border-green-500/30 text-green-700 hover:bg-green-500/10">
                      <CheckCircle2 className="h-4 w-4" />
                      Marcar OK
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Marcar {selectedAtencaoIds.size} vendas como OK?</AlertDialogTitle>
                      <AlertDialogDescription>
                        As vendas selecionadas terão o status de pagamento definido como OK.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => bulkSetStatusAtencaoSelected('OK')} className="bg-green-600 text-white hover:bg-green-700">
                        Confirmar OK
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={isProcessing} className="gap-1.5 border-orange-500/30 text-orange-700 hover:bg-orange-500/10">
                      <XCircle className="h-4 w-4" />
                      Marcar DESCONTADA
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Marcar {selectedAtencaoIds.size} vendas como DESCONTADA?</AlertDialogTitle>
                      <AlertDialogDescription>
                        As vendas selecionadas terão o status de pagamento definido como DESCONTADA.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => bulkSetStatusAtencaoSelected('DESCONTADA')} className="bg-orange-600 text-white hover:bg-orange-700">
                        Confirmar DESCONTADA
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={isProcessing} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                      Excluir Selecionadas
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir {selectedAtencaoIds.size} vendas da competência?</AlertDialogTitle>
                      <AlertDialogDescription>
                        As vendas selecionadas serão removidas deste comissionamento. Os registros originais continuarão no sistema.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={bulkRemoveAtencaoSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Confirmar Exclusão
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button size="sm" variant="ghost" onClick={() => setSelectedAtencaoIds(new Set())}>Limpar seleção</Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Marque as vendas e escolha: OK, DESCONTADA ou Excluir.</span>
            )}
            {Object.keys(duplicateSelections).length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm">
                  {Object.keys(duplicateSelections).filter(k => duplicateSelections[k] && Object.keys(duplicateSelections[k]).length > 0).length} grupo(s) com seleções
                </span>
                <Button
                  size="sm"
                  onClick={handleConfirmAllAtencaoGroups}
                  disabled={isProcessing}
                  className="gap-1.5"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirmar Todos os Grupos
                </Button>
              </div>
            )}
          </div>

          <div className="border rounded-lg">
            <Accordion type="multiple" className="w-full">
              {Array.from(atencaoGroups.entries()).map(([groupKey, group]) => {
                const first = group[0];
                const lalValue = first.matched_valor_lq ?? first.receita_lal;
                const groupSel = duplicateSelections[groupKey];
                const hasSelections = groupSel && Object.keys(groupSel).length > 0;
                return (
                  <AccordionItem key={groupKey} value={groupKey} className="border-b last:border-b-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/30">
                      <div className="flex items-center gap-4 text-left w-full mr-4">
                        <Badge className="bg-warning/20 text-warning text-xs shrink-0">
                          {group.length} vendas
                        </Badge>
                        {hasSelections && (
                          <Badge className="bg-primary/20 text-primary text-xs shrink-0">
                            ✓ Marcado
                          </Badge>
                        )}
                        <span className="text-sm font-medium truncate max-w-[200px]">{first.cliente_nome || '-'}</span>
                        <span className="text-xs font-mono text-muted-foreground">{first.cpf_cnpj || '-'}</span>
                        <span className="text-xs text-muted-foreground ml-auto">LAL: {formatBRL(lalValue)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2">
                        {group.map(v => {
                          const selectedStatus = duplicateSelections[groupKey]?.[v.id] || null;
                          return (
                            <div
                              key={v.id}
                              className={`p-3 rounded-md border transition-colors ${
                                selectedStatus === 'OK'
                                  ? 'border-success bg-success/5'
                                  : selectedStatus === 'DESCONTADA'
                                  ? 'border-destructive bg-destructive/5'
                                  : 'border-border'
                              }`}
                            >
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <Checkbox
                                    checked={selectedAtencaoIds.has(v.id)}
                                    onCheckedChange={() => toggleAtencaoSelect(v.id)}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Vendedor:</span>{' '}
                                    <span className="font-medium">{v.vendedor_nome || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">ID Make:</span>{' '}
                                    <span className="font-mono font-medium">{v.identificador_make || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Data Venda:</span>{' '}
                                    <span className="font-medium">{v.data_venda || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Status Make:</span>{' '}
                                    <span className="font-medium">{v.status_make || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Plano:</span>{' '}
                                    <span className="font-medium">{v.plano || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Valor:</span>{' '}
                                    <span className="font-medium">{formatBRL(v.valor_venda)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Telefone:</span>{' '}
                                    <span className="font-medium">{v.telefone || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Operadora:</span>{' '}
                                    <span className="font-medium">{v.operadora_nome || '-'}</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Endereço:</span>{' '}
                                    <span className="font-medium">{[v.endereco, v.cep].filter(Boolean).join(' - ') || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Protocolo:</span>{' '}
                                    <span className="font-mono font-medium">{v.protocolo_interno || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Pag atual:</span>{' '}
                                    {statusPagBadge(v.status_pag)}
                                  </div>
                                </div>
                                </div>
                                <div className="flex items-center gap-1.5 pt-1">
                                  <Button
                                    size="sm"
                                    variant={selectedStatus === 'OK' ? 'default' : 'outline'}
                                    className={`h-7 text-xs gap-1 ${selectedStatus === 'OK' ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}`}
                                    onClick={() => setDuplicateSelections(prev => ({
                                      ...prev,
                                      [groupKey]: { ...(prev[groupKey] || {}), [v.id]: 'OK' }
                                    }))}
                                  >
                                    <CheckCircle2 className="h-3 w-3" /> OK
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={selectedStatus === 'DESCONTADA' ? 'destructive' : 'outline'}
                                    className="h-7 text-xs gap-1"
                                    onClick={() => setDuplicateSelections(prev => ({
                                      ...prev,
                                      [groupKey]: { ...(prev[groupKey] || {}), [v.id]: 'DESCONTADA' }
                                    }))}
                                  >
                                    <XCircle className="h-3 w-3" /> DESC
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10 ml-auto"
                                        disabled={isProcessing}
                                      >
                                        <Trash2 className="h-3 w-3" /> Excluir
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir venda da competência?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          A venda de <strong>{v.cliente_nome}</strong> (Vendedor: {v.vendedor_nome}) será removida deste comissionamento.
                                          O registro original continuará no sistema.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleRemoveVendaFromCommission(v.id, groupKey)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Confirmar Exclusão
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {hasSelections && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground mr-2">
                            {Object.values(duplicateSelections[groupKey]).filter(s => s === 'OK').length} OK, {Object.values(duplicateSelections[groupKey]).filter(s => s === 'DESCONTADA').length} Descontadas
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleConfirmAtencaoGroup(groupKey)}
                            disabled={isProcessing}
                            className="gap-1.5"
                          >
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Confirmar Grupo
                          </Button>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </div>
      ) : (
        /* Standard Table View */
        <>
          <div className="overflow-x-auto border rounded-lg max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={selectAll} onCheckedChange={handleSelectAll} />
                  </TableHead>
                  <TableHead className="text-xs">Match</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs">Protocolo</TableHead>
                  <TableHead className="text-xs">ID Make</TableHead>
                  <TableHead className="text-xs">Vendedor</TableHead>
                  <TableHead className="text-xs">Data Venda</TableHead>
                  <TableHead className="text-xs">Status Pedido</TableHead>
                  <TableHead className="text-xs">Status Pag</TableHead>
                  <TableHead className="text-xs">Receita Int.</TableHead>
                  <TableHead className="text-xs">Receita LAL</TableHead>
                  <TableHead className="text-xs">LAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedVendas.map(v => (
                  <TableRow key={v.id} className={`${selectedIds.has(v.id) ? 'bg-accent/50' : ''} ${v.is_atencao ? 'bg-warning/5' : ''}`}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} />
                    </TableCell>
                    <TableCell>{matchBadge(v)}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{v.cliente_nome || '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{v.cpf_cnpj || '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{v.protocolo_interno || '-'}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[80px] truncate">{v.identificador_make || '-'}</TableCell>
                    <TableCell className="text-xs max-w-[100px] truncate">{v.vendedor_nome || '-'}</TableCell>
                    <TableCell className="text-xs">{v.data_venda || '-'}</TableCell>
                    <TableCell className="text-xs">{v.status_make || '-'}</TableCell>
                    <TableCell>{statusPagBadge(v.status_pag)}</TableCell>
                    <TableCell className="text-xs">{formatBRL(v.receita_interna)}</TableCell>
                    <TableCell className="text-xs">{formatBRL(v.matched_valor_lq ?? v.receita_lal)}</TableCell>
                    <TableCell className="text-xs max-w-[80px] truncate">{v.matched_apelido ?? v.lal_apelido ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredVendas.length > 200 && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando 200 de {filteredVendas.length}. Use os filtros para refinar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
