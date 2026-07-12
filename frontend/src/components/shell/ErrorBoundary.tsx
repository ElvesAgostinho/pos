import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; viewKey?: string; }
interface State { error: Error | null; }

/**
 * Isola cada ecrã: se um ecrã rebentar, mostra o erro em vez de deixar o
 * sistema inteiro em branco. Reinicia automaticamente ao mudar de ecrã.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // Log para diagnóstico (aparece na consola do browser).
    console.error('[ErrorBoundary] Ecrã rebentou:', error, info?.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Ao navegar para outro ecrã, limpa o erro e tenta renderizar de novo.
    if (prev.viewKey !== this.props.viewKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex items-center justify-center p-6 bg-[#e6e6e6]">
          <div className="bg-white border border-[#a0a0a0] shadow max-w-lg w-full">
            <div className="bg-[#a01818] text-white px-4 py-2 flex items-center gap-2 text-sm font-bold">
              <AlertTriangle size={16} /> Ocorreu um erro neste ecrã
            </div>
            <div className="p-4 space-y-3 text-[12px] text-gray-700">
              <p>O ecrã não pôde ser apresentado. O resto do sistema continua a funcionar — pode voltar à árvore e abrir outro ecrã.</p>
              <pre className="bg-[#f5f5f5] border border-[#ddd] p-2 text-[11px] text-red-700 overflow-auto max-h-40 whitespace-pre-wrap">{this.state.error.message}</pre>
              <div className="flex gap-2">
                <button onClick={() => this.setState({ error: null })}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#f0f0f0] border border-[#a0a0a0] text-[11px] hover:bg-[#e8e8e8]">
                  <RefreshCw size={12} /> Tentar novamente
                </button>
                <button onClick={() => window.location.reload()}
                  className="px-3 py-1.5 bg-[#1e3f66] text-white text-[11px] hover:bg-[#2a5488]">Recarregar sistema</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
