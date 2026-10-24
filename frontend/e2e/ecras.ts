/**
 * A LISTA DOS ECRÃS, tirada da própria árvore de navegação.
 *
 * Não é escrita à mão de propósito: uma lista à mão fica velha no dia em que
 * alguém acrescenta um centro, e a varredura passa a dizer "tudo bem" sobre um
 * sistema que já tem mais ecrãs do que ela conhece. Isto lê `config/navigation.tsx`
 * — a mesma árvore que o backoffice desenha — e por isso cresce com o produto.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Ecra { module: string; moduleTitle: string; id: string; name: string; }

export function ecrasDaArvore(): Ecra[] {
  const fonte = readFileSync(join(process.cwd(), 'src/config/navigation.tsx'), 'utf8');

  // Só a parte do ficheiro que define a árvore de módulos.
  const registry = new Set<string>();
  const regBloco = fonte.match(/VIEW_REGISTRY[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (regBloco) {
    for (const m of regBloco[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\s*:/gm)) registry.add(m[1]);
  }

  const ecras: Ecra[] = [];
  const modulos = fonte.matchAll(
    /key:\s*'([a-z0-9_]+)',\s*title:\s*'([^']+)',\s*items:\s*\[([\s\S]*?)\]\s*,?\s*\}/g);
  for (const mod of modulos) {
    const [, key, title, corpo] = mod;
    for (const it of corpo.matchAll(/\{\s*id:\s*'([A-Za-z0-9_]+)',\s*name:\s*'([^']+)'/g)) {
      const [, id, name] = it;
      // Só os ecrãs que o registo sabe desenhar. Um item da árvore sem ecrã
      // registado é outro defeito — mas é um defeito de navegação, não de
      // desenho, e tem o seu próprio teste.
      if (registry.size && !registry.has(id)) continue;
      ecras.push({ module: key, moduleTitle: title, id, name });
    }
  }
  return ecras;
}

/** Itens da árvore que NÃO têm ecrã registado — a navegação a prometer o que não tem. */
export function itensSemEcra(): { module: string; id: string; name: string }[] {
  const fonte = readFileSync(join(process.cwd(), 'src/config/navigation.tsx'), 'utf8');
  const registry = new Set<string>();
  const regBloco = fonte.match(/VIEW_REGISTRY[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (regBloco) {
    for (const m of regBloco[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\s*:/gm)) registry.add(m[1]);
  }
  const orfaos: { module: string; id: string; name: string }[] = [];
  const modulos = fonte.matchAll(
    /key:\s*'([a-z0-9_]+)',\s*title:\s*'([^']+)',\s*items:\s*\[([\s\S]*?)\]\s*,?\s*\}/g);
  for (const mod of modulos) {
    const [, key, , corpo] = mod;
    for (const it of corpo.matchAll(/\{\s*id:\s*'([A-Za-z0-9_]+)',\s*name:\s*'([^']+)'/g)) {
      const [, id, name] = it;
      if (!registry.has(id)) orfaos.push({ module: key, id, name });
    }
  }
  return orfaos;
}
