import React, { useState, useEffect } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';

// Types for EDC Inbox
interface Document {
    document_id: string;
    title: string;
    doc_type: string;
    status: string;
    version: number;
    created_at: string;
    author: {
        username: string;
        first_name: string;
        last_name: string;
    };
}

interface Workflow {
    workflow_id: string;
    status: string;
    document: Document;
}

interface WorkflowTask {
    task_id: string;
    workflow: Workflow;
    action_required: string;
    status: string;
    created_at: string;
}

interface EdcInboxViewProps {
    onClose: () => void;
}

const EdcInboxView: React.FC<EdcInboxViewProps> = ({ onClose }) => {
    const [tasks, setTasks] = useState<WorkflowTask[]>([]);
    const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null);
    const [loading, setLoading] = useState(true);

    // Mock fetching tasks
    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const response = await fetch('http://localhost:8001/api/edc/inbox/');
                if (response.ok) {
                    const data = await response.json();
                    setTasks(data);
                } else {
                    console.error('Failed to fetch tasks');
                }
            } catch (error) {
                console.error('Error fetching tasks:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTasks();
    }, []);

    const handleAction = async (action: 'approve' | 'reject') => {
        if (!selectedTask) return;

        try {
            const response = await fetch(`http://localhost:8001/api/edc/inbox/${selectedTask.task_id}/${action}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ comments: `Automated ${action} via UI` })
            });

            if (response.ok) {
                // Remove from list
                setTasks(tasks.filter(t => t.task_id !== selectedTask.task_id));
                setSelectedTask(null);
            } else {
                alert(`Error: Could not ${action} document.`);
            }
        } catch (error) {
            console.error(`Error during ${action}:`, error);
        }
    };

    return (
        <ClassicWindow 
            title="Enterprise Document Center - Inbox" 
            onClose={onClose}
        >
            <div style={{ display: 'flex', height: '100%', borderTop: '1px solid #fff', borderLeft: '1px solid #fff', borderRight: '1px solid #808080', borderBottom: '1px solid #808080' }}>
                {/* Left Panel: Inbox List */}
                <div style={{ flex: '0 0 40%', borderRight: '2px groove #fff', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ backgroundColor: '#000080', color: '#fff', padding: '2px 5px', fontWeight: 'bold' }}>
                        Minhas Tarefas (Pendentes)
                    </div>
                    
                    {loading ? (
                        <div style={{ padding: '10px' }}>A carregar...</div>
                    ) : tasks.length === 0 ? (
                        <div style={{ padding: '10px' }}>Não existem documentos pendentes para aprovação.</div>
                    ) : (
                        <div style={{ overflowY: 'auto', flexGrow: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#c0c0c0', borderBottom: '1px solid #808080' }}>
                                        <th style={{ textAlign: 'left', padding: '4px', borderRight: '1px solid #808080' }}>Documento</th>
                                        <th style={{ textAlign: 'left', padding: '4px', borderRight: '1px solid #808080' }}>Tipo</th>
                                        <th style={{ textAlign: 'left', padding: '4px' }}>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((task) => (
                                        <tr 
                                            key={task.task_id}
                                            onClick={() => setSelectedTask(task)}
                                            style={{ 
                                                cursor: 'pointer',
                                                backgroundColor: selectedTask?.task_id === task.task_id ? '#000080' : 'transparent',
                                                color: selectedTask?.task_id === task.task_id ? '#fff' : '#000'
                                            }}
                                        >
                                            <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{task.workflow.document.title}</td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{task.workflow.document.doc_type}</td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #eee' }}>{new Date(task.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Right Panel: Document Preview & Actions */}
                <div style={{ flex: '1', backgroundColor: '#e0dfdb', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ backgroundColor: '#000080', color: '#fff', padding: '2px 5px', fontWeight: 'bold' }}>
                        Pré-visualização do Documento
                    </div>
                    
                    {selectedTask ? (
                        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ marginBottom: '10px', backgroundColor: '#fff', border: '1px inset #fff', padding: '10px' }}>
                                <h3 style={{ margin: '0 0 10px 0' }}>Detalhes do Workflow</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '5px', fontSize: '13px' }}>
                                    <strong>Documento ID:</strong> <span>{selectedTask.workflow.document.document_id}</span>
                                    <strong>Título:</strong> <span>{selectedTask.workflow.document.title}</span>
                                    <strong>Autor:</strong> <span>{selectedTask.workflow.document.author?.first_name} {selectedTask.workflow.document.author?.last_name}</span>
                                    <strong>Ação Requerida:</strong> <span>{selectedTask.action_required}</span>
                                </div>
                            </div>

                            {/* Mock Document PDF Viewer */}
                            <div style={{ flexGrow: 1, backgroundColor: '#808080', border: '2px inset #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                [ PREVIEW PDF/IMAGEM RENDERIZADO AQUI ]
                                <br />
                                Ficheiro: {selectedTask.workflow.document.title} (v{selectedTask.workflow.document.version})
                            </div>

                            <div style={{ marginTop: '10px', display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '10px', borderTop: '2px groove #fff' }}>
                                <ClassicButton onClick={() => handleAction('approve')} style={{ width: '120px', fontWeight: 'bold' }}>
                                    Aprovar
                                </ClassicButton>
                                <ClassicButton onClick={() => handleAction('reject')} style={{ width: '120px' }}>
                                    Rejeitar
                                </ClassicButton>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#808080' }}>
                            Selecione um documento à esquerda para visualizar.
                        </div>
                    )}
                </div>
            </div>
        </ClassicWindow>
    );
};

export default EdcInboxView;
